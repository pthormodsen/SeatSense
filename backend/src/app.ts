import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Config } from './config.js';
import { openEventWriter } from './eventLog.js';
import { SensorStore } from './store.js';
import type { SensorEvent, SensorEventsResponse, SensorState, StreamMessage } from './types.js';
import { parseReading } from './validate.js';

export interface AppOptions {
  now?: () => number;
  // Tests drive offline checks and keepalives by hand.
  timers?: boolean;
  // Persisted events to restore (see eventLog.loadEvents), oldest first.
  initialEvents?: SensorEvent[];
}

export interface App {
  server: Server;
  store: SensorStore;
  listen(): Promise<number>;
  close(): Promise<void>;
  checkOffline(): SensorEvent[];
  streamClientCount(): number;
}

interface StreamClient {
  sensorId: string;
  res: ServerResponse;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const ROUTE = /^\/api\/sensors\/([^/]+)(?:\/(readings|events|stream))?$/;

const digest = (value: string) => createHash('sha256').update(value).digest();

const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
};

const clientAddress = (req: IncomingMessage) =>
  (req.headers['cf-connecting-ip'] as string | undefined) ??
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
  req.socket.remoteAddress ??
  'unknown';

const readBody = (req: IncomingMessage, limit: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      reject(new HttpError(413, `Body larger than ${limit} bytes`));
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new HttpError(413, `Body larger than ${limit} bytes`));
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', reject);
  });

export const createApp = (config: Config, options: AppOptions = {}): App => {
  const now = options.now ?? Date.now;
  const store = new SensorStore(config.deviceTokens.keys(), {
    offlineAfterMs: config.offlineAfterMs,
    maxEvents: config.maxEvents,
    now,
  });
  store.restore(options.initialEvents ?? []);

  const writer = config.eventsFile ? openEventWriter(config.eventsFile) : null;
  const unsubscribeWriter = writer ? store.subscribe((_state, event) => writer.append(event)) : () => {};

  const streamClients = new Set<StreamClient>();
  const timers: NodeJS.Timeout[] = [];

  const writeStream = (res: ServerResponse, name: 'snapshot' | 'update', state: SensorState, event: SensorEvent | null) => {
    const message: StreamMessage = { state, event, pushedAt: new Date(now()).toISOString() };
    res.write(`event: ${name}\ndata: ${JSON.stringify(message)}\n\n`);
  };

  const unsubscribe = store.subscribe((state, event) => {
    for (const client of streamClients) {
      if (client.sensorId === state.sensorId) {
        writeStream(client.res, 'update', state, event);
      }
    }
    if (event.type !== 'heartbeat') {
      const occupancy = event.occupied === null ? 'unknown' : event.occupied ? 'occupied' : 'available';
      console.log(`[sensor] ${event.sensorId} ${event.type}${event.type === 'offline' ? '' : ` (${occupancy})`}`);
    }
  });

  const isAuthorized = (req: IncomingMessage, sensorId: string): boolean => {
    const expected = config.deviceTokens.get(sensorId);
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!expected || !match) {
      return false;
    }
    return timingSafeEqual(digest(expected), digest(match[1].trim()));
  };

  const handleReading = async (req: IncomingMessage, res: ServerResponse, sensorId: string) => {
    if (!isAuthorized(req, sensorId)) {
      req.resume();
      throw new HttpError(401, 'Missing or invalid device token');
    }
    const contentType = req.headers['content-type'] ?? '';
    if (!/^application\/json\b/i.test(contentType)) {
      req.resume();
      throw new HttpError(415, 'Content-Type must be application/json');
    }

    const raw = await readBody(req, config.maxBodyBytes);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Body is not valid JSON');
    }

    const result = parseReading(body, sensorId);
    if (!result.ok) {
      throw new HttpError(400, result.error);
    }

    store.recordReading(sensorId, result.value);
    const state = store.getState(sensorId)!;
    sendJson(res, 200, { ok: true, receivedAt: state.lastReceivedAt, latencyMs: state.latencyMs });
  };

  const handleStream = (req: IncomingMessage, res: ServerResponse, sensorId: string) => {
    if (streamClients.size >= config.maxStreamClients) {
      throw new HttpError(503, 'Too many live connections, try again later');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tells nginx not to buffer the stream.
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const client: StreamClient = { sensorId, res };
    streamClients.add(client);
    writeStream(res, 'snapshot', store.getState(sensorId)!, null);

    const remove = () => {
      streamClients.delete(client);
      // Finish the response so the socket is not counted as busy on shutdown.
      if (!res.writableEnded) res.end();
    };
    req.on('close', remove);
    res.on('error', remove);
  };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const method = req.method ?? 'GET';

    if (pathname === '/api/health') {
      if (method !== 'GET') throw new HttpError(405, 'Method not allowed');
      sendJson(res, 200, { status: 'ok', sensors: config.deviceTokens.size, streamClients: streamClients.size });
      return;
    }

    if (pathname === '/api/sensors') {
      if (method !== 'GET') throw new HttpError(405, 'Method not allowed');
      sendJson(res, 200, { sensors: store.listStates() });
      return;
    }

    const match = ROUTE.exec(pathname);
    if (!match) {
      throw new HttpError(404, 'Not found');
    }

    let sensorId: string;
    try {
      sensorId = decodeURIComponent(match[1]);
    } catch {
      throw new HttpError(400, 'Invalid sensor id');
    }
    const action = match[2];

    if (action === 'readings') {
      if (method !== 'POST') throw new HttpError(405, 'Method not allowed');
      await handleReading(req, res, sensorId);
      return;
    }

    if (method !== 'GET') throw new HttpError(405, 'Method not allowed');
    if (!store.has(sensorId)) {
      throw new HttpError(404, `Unknown sensor ${sensorId}`);
    }

    if (action === 'events') {
      const response: SensorEventsResponse = { events: store.getEvents(sensorId)! };
      sendJson(res, 200, response);
    } else if (action === 'stream') {
      handleStream(req, res, sensorId);
    } else {
      sendJson(res, 200, store.getState(sensorId));
    }
  };

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : 'Internal server error';
      if (!(error instanceof HttpError)) {
        console.error(`[api] ${req.method} ${req.url} failed:`, error);
      } else if (req.method === 'POST' || status >= 500) {
        // Rejected sensor transmissions are always logged.
        console.warn(`[api] ${status} ${req.method} ${req.url} from ${clientAddress(req)}: ${message}`);
      }
      if (res.headersSent) {
        res.end();
        return;
      }
      const headers: Record<string, string> = {};
      if (status === 401) headers['WWW-Authenticate'] = 'Bearer';
      if (status === 413) headers.Connection = 'close';
      sendJson(res, status, { error: message }, headers);
    });
  });

  const checkOffline = () => store.checkOffline();

  return {
    server,
    store,
    checkOffline,
    streamClientCount: () => streamClients.size,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.off('error', reject);
          if (options.timers !== false) {
            timers.push(setInterval(checkOffline, config.offlineCheckMs));
            timers.push(
              setInterval(() => {
                for (const client of streamClients) client.res.write(': keepalive\n\n');
              }, config.keepaliveMs),
            );
          }
          resolve((server.address() as AddressInfo).port);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        for (const timer of timers) clearInterval(timer);
        timers.length = 0;
        unsubscribe();
        for (const client of streamClients) client.res.end();
        streamClients.clear();
        // In-flight requests get a short grace period; connections that never
        // send a request would otherwise keep close() waiting.
        const force = setTimeout(() => server.closeAllConnections(), 1_000);
        server.close(() => {
          clearTimeout(force);
          unsubscribeWriter();
          // Flush events still buffered for the file.
          void (writer?.close() ?? Promise.resolve()).then(() => resolve());
        });
        server.closeIdleConnections();
      }),
  };
};
