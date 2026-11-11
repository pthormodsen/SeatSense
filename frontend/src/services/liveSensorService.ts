import type {
  SensorEvent,
  SensorEventsResponse,
  SensorState,
  StreamMessage,
} from '../types/liveSensor';

// Live data from the backend (/api is proxied by Vite in development and by
// nginx in production). Unlike seatService this is real sensor data, not demo
// data. Device tokens never reach the browser: these endpoints are read-only.
const API_BASE = '/api';
const STREAM_RETRY_MS = 5_000;
const MAX_EVENTS_IN_BROWSER = 5_000;

export type LiveSensorStatus = 'occupied' | 'available' | 'unknown' | 'offline';
export type StreamStatus = 'connecting' | 'open' | 'reconnecting';

// A ground-truth note typed in during a test ("person sat down"). Browser
// only; it is not sent to the backend, but it is included in the CSV export.
export interface TestNote {
  type: 'note';
  sensorId: string;
  at: string;
  text: string;
}

export type TimelineEntry = SensorEvent | TestNote;

export const getLiveStatus = (state: SensorState): LiveSensorStatus => {
  if (!state.online) return 'offline';
  if (state.occupied === null) return 'unknown';
  return state.occupied ? 'occupied' : 'available';
};

export const TARGET_TYPE_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Moving',
  2: 'Stationary',
  3: 'Moving + stationary',
};

const getJson = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      // Not JSON (e.g. an nginx 502 page when the backend is down).
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
};

const sensorPath = (sensorId: string) => `/sensors/${encodeURIComponent(sensorId)}`;

export interface StreamHandlers {
  onMessage: (kind: 'snapshot' | 'update', message: StreamMessage) => void;
  onStatus: (status: StreamStatus) => void;
}

// Opens the SSE stream. EventSource reconnects by itself after network errors;
// if the server refuses the stream (e.g. 503 or a 502 while the backend
// restarts) EventSource gives up, so we reconnect manually. Returns a cleanup
// function that closes the connection.
const subscribe = (sensorId: string, handlers: StreamHandlers): (() => void) => {
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const listen = (kind: 'snapshot' | 'update') => (event: MessageEvent<string>) => {
    try {
      handlers.onMessage(kind, JSON.parse(event.data) as StreamMessage);
    } catch (error) {
      console.error('[liveSensor] invalid stream message', error);
    }
  };

  const connect = () => {
    handlers.onStatus('connecting');
    source = new EventSource(`${API_BASE}${sensorPath(sensorId)}/stream`);
    source.onopen = () => handlers.onStatus('open');
    source.addEventListener('snapshot', listen('snapshot'));
    source.addEventListener('update', listen('update'));
    source.onerror = () => {
      if (closed) return;
      handlers.onStatus('reconnecting');
      if (source?.readyState === EventSource.CLOSED) {
        retryTimer = setTimeout(connect, STREAM_RETRY_MS);
      }
    };
  };

  connect();

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    source?.close();
  };
};

const timelineKey = (entry: TimelineEntry) =>
  entry.type === 'note' ? `note|${entry.at}|${entry.text}` : `${entry.id}|${entry.at}`;

// Merges event lists without duplicates (the same event can arrive from both
// GET /events and the stream). Event ids restart when the backend restarts,
// so the key includes the timestamp. Oldest first.
export const mergeEvents = (current: SensorEvent[], incoming: SensorEvent[]): SensorEvent[] => {
  const byKey = new Map(current.map((event) => [timelineKey(event), event]));
  for (const event of incoming) byKey.set(timelineKey(event), event);
  return [...byKey.values()]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)
    .slice(-MAX_EVENTS_IN_BROWSER);
};

const CSV_COLUMNS = [
  'timestamp',
  'sensorId',
  'eventType',
  'occupancy',
  'note',
  'targetType',
  'movingCm',
  'stationaryCm',
  'movingEnergy',
  'stationaryEnergy',
  'rssi',
  'latencyMs',
  'sentAt',
  'seq',
  'uptimeMs',
] as const;

const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const occupancyLabel = (event: SensorEvent) => {
  if (event.type === 'offline') return '';
  if (event.occupied === null) return 'unknown';
  return event.occupied ? 'occupied' : 'available';
};

// One row per event and note, oldest first. Timestamps are server time
// (notes: browser time), ISO 8601 UTC.
export const timelineToCsv = (entries: TimelineEntry[]): string => {
  const rows = [...entries]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((entry) =>
      entry.type === 'note'
        ? [entry.at, entry.sensorId, 'note', '', entry.text]
        : [
            entry.at,
            entry.sensorId,
            entry.type,
            occupancyLabel(entry),
            '',
            entry.targetType,
            entry.movingCm,
            entry.stationaryCm,
            entry.movingEnergy,
            entry.stationaryEnergy,
            entry.rssi,
            entry.latencyMs,
            entry.sentAt,
            entry.seq,
            entry.uptimeMs,
          ],
    );

  return [CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
};

export const downloadCsv = (filename: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const liveSensorService = {
  listSensors: async () => (await getJson<{ sensors: SensorState[] }>('/sensors')).sensors,
  getState: (sensorId: string) => getJson<SensorState>(sensorPath(sensorId)),
  getEvents: async (sensorId: string) =>
    (await getJson<SensorEventsResponse>(`${sensorPath(sensorId)}/events`)).events,
  subscribe,
};
