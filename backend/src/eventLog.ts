import { createReadStream, createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import type { SensorEvent, SensorEventType } from './types.js';

// Append-only event log: one JSON object per line (JSON Lines). The file is
// the complete history and is never truncated; only the newest events per
// sensor are loaded back into memory at startup.

const EVENT_TYPES = new Set<SensorEventType>(['occupancy-change', 'heartbeat', 'offline', 'online']);

const isSensorEvent = (value: unknown): value is SensorEvent => {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Partial<SensorEvent>;
  return (
    typeof event.id === 'number' &&
    typeof event.sensorId === 'string' &&
    typeof event.type === 'string' &&
    EVENT_TYPES.has(event.type) &&
    typeof event.at === 'string' &&
    Number.isFinite(Date.parse(event.at))
  );
};

export interface LoadResult {
  // Oldest first, at most maxPerSensor per sensor.
  events: SensorEvent[];
  lines: number;
  skippedInvalid: number;
  skippedUnknownSensor: number;
}

// Streams the file line by line, so a long pilot log does not have to fit in
// memory at once. A missing file is an empty log.
export const loadEvents = async (
  path: string,
  sensorIds: ReadonlySet<string>,
  maxPerSensor: number,
): Promise<LoadResult> => {
  const result: LoadResult = { events: [], lines: 0, skippedInvalid: 0, skippedUnknownSensor: 0 };
  if (!existsSync(path)) {
    return result;
  }

  // Indexed by line so the result keeps file (= chronological) order.
  const perSensor = new Map<string, Array<{ line: number; event: SensorEvent }>>();
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });

  for await (const line of lines) {
    if (line.trim() === '') continue;
    result.lines++;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      result.skippedInvalid++;
      continue;
    }
    if (!isSensorEvent(parsed)) {
      result.skippedInvalid++;
      continue;
    }
    if (!sensorIds.has(parsed.sensorId)) {
      result.skippedUnknownSensor++;
      continue;
    }

    const list = perSensor.get(parsed.sensorId) ?? [];
    list.push({ line: result.lines, event: parsed });
    if (list.length > maxPerSensor) list.shift();
    perSensor.set(parsed.sensorId, list);
  }

  result.events = [...perSensor.values()]
    .flat()
    .sort((a, b) => a.line - b.line)
    .map((entry) => entry.event);
  return result;
};

export interface EventWriter {
  append(event: SensorEvent): void;
  close(): Promise<void>;
}

// Opens the file for appending (creating its directory). Write errors are
// logged; they never stop the API, but they mean history is not being saved.
export const openEventWriter = (path: string): EventWriter => {
  mkdirSync(dirname(path), { recursive: true });
  let failed = false;
  const stream: WriteStream = createWriteStream(path, { flags: 'a', encoding: 'utf8' });
  stream.on('error', (error) => {
    if (!failed) console.error(`[events] cannot write ${path}, events are NOT being persisted:`, error);
    failed = true;
  });

  return {
    append: (event) => {
      if (!failed) stream.write(`${JSON.stringify(event)}\n`);
    },
    close: () =>
      new Promise((resolve) => {
        if (stream.closed || stream.destroyed) {
          resolve();
          return;
        }
        stream.end(() => resolve());
      }),
  };
};
