import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { SensorEvent, SensorEventsResponse, SensorState, StreamMessage } from '../src/types.js';

const SENSOR = 'seat-001';
const OTHER_SENSOR = 'seat-002';
const TOKEN = 'test-token-seat-001-abcdef';
const OTHER_TOKEN = 'test-token-seat-002-abcdef';
const START_MS = Date.parse('2026-11-11T09:30:00.000Z');

let clock = START_MS;
let app: App;
let base: string;

const startApp = async (env: Record<string, string> = {}) => {
  clock = START_MS;
  const config = loadConfig({
    PORT: '0',
    HOST: '127.0.0.1',
    DEVICE_TOKENS: `${SENSOR}:${TOKEN},${OTHER_SENSOR}:${OTHER_TOKEN}`,
    MAX_EVENTS: '5',
    ...env,
  });
  app = createApp(config, { now: () => clock, timers: false });
  const port = await app.listen();
  base = `http://127.0.0.1:${port}`;
};

const reading = (overrides: Record<string, unknown> = {}) => ({
  sensorId: SENSOR,
  occupied: true,
  sentAt: new Date(clock - 120).toISOString(),
  seq: 1,
  targetType: 2,
  movingCm: 120,
  stationaryCm: 80,
  movingEnergy: 65,
  stationaryEnergy: 30,
  rssi: -55,
  uptimeMs: 123456,
  ...overrides,
});

const post = (body: unknown, { token = TOKEN, sensorId = SENSOR, contentType = 'application/json' } = {}) =>
  fetch(`${base}/api/sensors/${sensorId}/readings`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const getState = async (sensorId = SENSOR) => (await (await fetch(`${base}/api/sensors/${sensorId}`)).json()) as SensorState;
const getEvents = async () =>
  ((await (await fetch(`${base}/api/sensors/${SENSOR}/events`)).json()) as SensorEventsResponse).events;

const openStream = async (sensorId = SENSOR) => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/sensors/${sensorId}/stream`, { signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const next = async (): Promise<{ name: string; data: StreamMessage }> => {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let name = 'message';
        let data = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) name = line.slice(7);
          if (line.startsWith('data: ')) data += line.slice(6);
        }
        if (data) return { name, data: JSON.parse(data) as StreamMessage };
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream closed');
      buffer += decoder.decode(value, { stream: true });
    }
  };

  return { res, next, reader, close: () => controller.abort() };
};

describe('POST /api/sensors/:id/readings', () => {
  beforeEach(() => startApp());
  afterEach(() => app.close());

  test('accepts a valid reading and records server time and latency', async () => {
    const res = await post(reading());
    assert.equal(res.status, 200);
    const body = (await res.json()) as { receivedAt: string; latencyMs: number };
    assert.equal(body.receivedAt, new Date(START_MS).toISOString());
    assert.equal(body.latencyMs, 120);

    const state = await getState();
    assert.equal(state.online, true);
    assert.equal(state.occupied, true);
    assert.equal(state.stationaryCm, 80);
    assert.equal(state.rssi, -55);
    assert.equal(state.latencyMs, 120);
  });

  test('accepts the minimal payload and an unknown radar state', async () => {
    let res = await post({ sensorId: SENSOR, occupied: false });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { latencyMs: number | null }).latencyMs, null);

    res = await post({ sensorId: SENSOR, occupied: null, sentAt: null });
    assert.equal(res.status, 200);
    const state = await getState();
    assert.equal(state.occupied, null);
    assert.equal(state.targetType, null);
  });

  test('rejects malformed and invalid payloads with 400', async () => {
    const invalid: unknown[] = [
      '{not json',
      '[]',
      'null',
      reading({ sensorId: OTHER_SENSOR }),
      reading({ occupied: 'yes' }),
      { sensorId: SENSOR },
      reading({ sentAt: 'yesterday' }),
      reading({ sentAt: 12345 }),
      reading({ targetType: 7 }),
      reading({ movingCm: -1 }),
      reading({ movingCm: 1.5 }),
      reading({ rssi: 10 }),
      reading({ seq: '1' }),
    ];
    for (const body of invalid) {
      const res = await post(body);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
      assert.ok(((await res.json()) as { error: string }).error);
    }
    assert.equal((await getState()).online, false, 'rejected readings must not change state');
  });

  test('rejects wrong content type and oversized bodies', async () => {
    assert.equal((await post(reading(), { contentType: 'text/plain' })).status, 415);
    assert.equal((await post(reading({ padding: 'x'.repeat(5_000) }))).status, 413);
  });

  test('rejects missing, wrong and cross-sensor tokens with 401', async () => {
    for (const token of ['', 'wrong-token-wrong-token', OTHER_TOKEN]) {
      const res = await post(reading(), { token });
      assert.equal(res.status, 401, `token "${token}"`);
      assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    }
    const unknown = await post({ ...reading(), sensorId: 'seat-999' }, { sensorId: 'seat-999' });
    assert.equal(unknown.status, 401);
    assert.equal((await getState()).online, false);
  });
});

describe('GET endpoints and event log', () => {
  beforeEach(() => startApp());
  afterEach(() => app.close());

  test('returns an offline, empty state for a configured sensor that never reported', async () => {
    const state = await getState(OTHER_SENSOR);
    assert.equal(state.online, false);
    assert.equal(state.lastReceivedAt, null);
    assert.equal(state.occupied, null);
  });

  test('returns 404 for unknown sensors and routes, 405 for wrong methods', async () => {
    assert.equal((await fetch(`${base}/api/sensors/seat-999`)).status, 404);
    assert.equal((await fetch(`${base}/api/sensors/seat-999/stream`)).status, 404);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
    assert.equal((await fetch(`${base}/api/sensors/${SENSOR}/readings`)).status, 405);
    assert.equal((await fetch(`${base}/api/sensors/${SENSOR}`, { method: 'POST' })).status, 405);
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(((await health.json()) as { status: string }).status, 'ok');
    const list = (await (await fetch(`${base}/api/sensors`)).json()) as { sensors: SensorState[] };
    assert.deepEqual(list.sensors.map((s) => s.sensorId), [SENSOR, OTHER_SENSOR]);
  });

  test('classifies online, occupancy changes and heartbeats', async () => {
    await post(reading({ occupied: true, seq: 1 }));
    clock += 10_000;
    await post(reading({ occupied: true, seq: 2 }));
    clock += 3_000;
    await post(reading({ occupied: false, seq: 3, targetType: 0 }));

    const events = await getEvents();
    assert.deepEqual(
      events.map((e) => [e.type, e.occupied, e.seq]),
      [
        ['online', true, 1],
        ['occupancy-change', true, 1],
        ['heartbeat', true, 2],
        ['occupancy-change', false, 3],
      ],
    );
    assert.ok(events.every((e, i) => i === 0 || e.id > events[i - 1].id), 'ids increase');
  });

  test('keeps only the newest MAX_EVENTS events', async () => {
    for (let seq = 1; seq <= 8; seq++) {
      await post(reading({ seq }));
      clock += 1_000;
    }
    const events = await getEvents();
    assert.equal(events.length, 5);
    assert.deepEqual(events.map((e) => e.seq), [4, 5, 6, 7, 8]);
  });
});

describe('offline detection and reconnection', () => {
  beforeEach(() => startApp());
  afterEach(() => app.close());

  test('goes offline after OFFLINE_AFTER_MS without readings, and back online', async () => {
    await post(reading({ seq: 1 }));
    clock += 29_999;
    assert.deepEqual(app.checkOffline(), []);
    assert.equal((await getState()).online, true);

    clock += 1;
    const offline = app.checkOffline();
    assert.equal(offline.length, 1);
    assert.equal(offline[0].type, 'offline');
    assert.equal(offline[0].occupied, null);
    const state = await getState();
    assert.equal(state.online, false);
    assert.equal(state.occupied, true, 'last known occupancy is kept');
    assert.deepEqual(app.checkOffline(), [], 'offline is reported once');

    clock += 60_000;
    await post(reading({ seq: 1, occupied: false }));
    const types = (await getEvents()).map((e: SensorEvent) => e.type);
    assert.deepEqual(types, ['online', 'occupancy-change', 'offline', 'online', 'occupancy-change']);
    assert.equal((await getState()).online, true);
  });
});

describe('GET /api/sensors/:id/stream (SSE)', () => {
  beforeEach(() => startApp());
  afterEach(() => app.close());

  test('sends a snapshot, then updates for readings and offline transitions', async () => {
    const stream = await openStream();
    assert.equal(stream.res.headers.get('content-type'), 'text/event-stream; charset=utf-8');

    const snapshot = await stream.next();
    assert.equal(snapshot.name, 'snapshot');
    assert.equal(snapshot.data.state.online, false);
    assert.equal(snapshot.data.event, null);
    assert.equal(app.streamClientCount(), 1);

    await (await post(reading({ occupied: true }))).arrayBuffer();
    const online = await stream.next();
    assert.equal(online.name, 'update');
    assert.equal(online.data.event?.type, 'online');
    const change = await stream.next();
    assert.equal(change.data.event?.type, 'occupancy-change');
    assert.equal(change.data.state.occupied, true);
    assert.ok(change.data.pushedAt);

    // Readings for another sensor are not sent to this stream.
    await fetch(`${base}/api/sensors/${OTHER_SENSOR}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OTHER_TOKEN}` },
      body: JSON.stringify({ sensorId: OTHER_SENSOR, occupied: true }),
    }).then((res) => res.arrayBuffer());

    clock += 30_000;
    app.checkOffline();
    const offline = await stream.next();
    assert.equal(offline.data.event?.type, 'offline');
    assert.equal(offline.data.event?.sensorId, SENSOR);
    assert.equal(offline.data.state.online, false);

    stream.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(app.streamClientCount(), 0, 'disconnected clients are removed');
  });

  test('limits the number of stream clients', async () => {
    await app.close();
    await startApp({ MAX_STREAM_CLIENTS: '1' });
    const first = await openStream();
    await first.next();
    const second = await fetch(`${base}/api/sensors/${SENSOR}/stream`);
    assert.equal(second.status, 503);
    first.close();
  });

  test('ends open streams on shutdown', async () => {
    const stream = await openStream();
    await stream.next();
    const closing = app.close();
    const { done } = await stream.reader.read();
    assert.equal(done, true);
    await closing;
  });
});

describe('config', () => {
  test('rejects malformed DEVICE_TOKENS', () => {
    assert.throws(() => loadConfig({ DEVICE_TOKENS: 'seat-001' }), /invalid sensor id/);
    assert.throws(() => loadConfig({ DEVICE_TOKENS: 'seat-001:short' }), /at least 16/);
    assert.throws(() => loadConfig({ DEVICE_TOKENS: 'bad id:0123456789abcdef' }), /invalid sensor id/);
    assert.throws(
      () => loadConfig({ DEVICE_TOKENS: 'seat-001:0123456789abcdef,seat-001:0123456789abcdef' }),
      /duplicate/,
    );
    assert.equal(loadConfig({ DEVICE_TOKENS: '' }).deviceTokens.size, 0);
  });
});
