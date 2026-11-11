import type { ReadingValues, SensorEvent, SensorEventType, SensorState } from './types.js';

export interface StoreOptions {
  offlineAfterMs: number;
  maxEvents: number;
  now: () => number;
}

export type StoreListener = (state: SensorState, event: SensorEvent) => void;

interface SensorRecord {
  state: SensorState;
  lastReceivedMs: number | null;
  events: SensorEvent[];
}

const EMPTY_READING: ReadingValues = {
  occupied: null,
  sentAt: null,
  seq: null,
  targetType: null,
  movingCm: null,
  stationaryCm: null,
  movingEnergy: null,
  stationaryEnergy: null,
  rssi: null,
  uptimeMs: null,
};

const pickReading = (source: ReadingValues): ReadingValues => ({
  occupied: source.occupied,
  sentAt: source.sentAt,
  seq: source.seq,
  targetType: source.targetType,
  movingCm: source.movingCm,
  stationaryCm: source.stationaryCm,
  movingEnergy: source.movingEnergy,
  stationaryEnergy: source.stationaryEnergy,
  rssi: source.rssi,
  uptimeMs: source.uptimeMs,
});

// Latest state and the newest events per configured sensor, in memory.
// Persistence (the event log file) is handled by eventLog.ts via restore()
// and a store listener.
export class SensorStore {
  private readonly sensors = new Map<string, SensorRecord>();
  private readonly listeners = new Set<StoreListener>();
  private nextEventId = 1;

  constructor(sensorIds: Iterable<string>, private readonly options: StoreOptions) {
    for (const sensorId of sensorIds) {
      this.sensors.set(sensorId, {
        state: { sensorId, online: false, lastReceivedAt: null, latencyMs: null, ...EMPTY_READING },
        lastReceivedMs: null,
        events: [],
      });
    }
  }

  has(sensorId: string): boolean {
    return this.sensors.has(sensorId);
  }

  listStates(): SensorState[] {
    return [...this.sensors.values()].map((record) => ({ ...record.state }));
  }

  getState(sensorId: string): SensorState | undefined {
    const record = this.sensors.get(sensorId);
    return record ? { ...record.state } : undefined;
  }

  getEvents(sensorId: string): SensorEvent[] | undefined {
    return this.sensors.get(sensorId)?.events.slice();
  }

  // Loads persisted events (oldest first) at startup, without notifying
  // listeners. The latest state is rebuilt from them and new event ids continue
  // after the highest restored id. A sensor whose last event was a reading is
  // restored as online with that reading's time, so checkOffline() reports it
  // offline if it does not send again in time.
  restore(events: SensorEvent[]): void {
    for (const event of events) {
      const record = this.sensors.get(event.sensorId);
      if (!record) continue;

      record.events.push(event);
      if (record.events.length > this.options.maxEvents) record.events.shift();
      this.nextEventId = Math.max(this.nextEventId, event.id + 1);

      if (event.type === 'offline') {
        record.state = { ...record.state, online: false };
      } else {
        record.state = {
          sensorId: event.sensorId,
          online: true,
          lastReceivedAt: event.at,
          latencyMs: event.latencyMs,
          ...pickReading(event),
        };
        record.lastReceivedMs = Date.parse(event.at);
      }
    }
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Stores a validated reading and returns the events it produced: `online`
  // if the sensor was offline (or never seen), then `occupancy-change` or
  // `heartbeat`.
  recordReading(sensorId: string, reading: ReadingValues): SensorEvent[] {
    const record = this.sensors.get(sensorId);
    if (!record) {
      throw new Error(`Unknown sensor ${sensorId}`);
    }

    const nowMs = this.options.now();
    const receivedAt = new Date(nowMs).toISOString();
    const latencyMs = reading.sentAt === null ? null : nowMs - Date.parse(reading.sentAt);
    const previous = record.state;
    const hadReading = record.lastReceivedMs !== null;

    record.state = {
      sensorId,
      online: true,
      lastReceivedAt: receivedAt,
      latencyMs,
      ...pickReading(reading),
    };
    record.lastReceivedMs = nowMs;

    const events: SensorEvent[] = [];
    if (!previous.online) {
      events.push(this.addEvent(record, 'online', receivedAt, reading, latencyMs));
    }
    const changed = !hadReading || previous.occupied !== reading.occupied;
    events.push(
      this.addEvent(record, changed ? 'occupancy-change' : 'heartbeat', receivedAt, reading, latencyMs),
    );
    return events;
  }

  // Marks sensors without a reading for offlineAfterMs as offline. Called
  // periodically by the server, so clients learn about it even if the sensor
  // never sends again.
  checkOffline(): SensorEvent[] {
    const nowMs = this.options.now();
    const events: SensorEvent[] = [];

    for (const record of this.sensors.values()) {
      if (
        record.state.online &&
        record.lastReceivedMs !== null &&
        nowMs - record.lastReceivedMs >= this.options.offlineAfterMs
      ) {
        record.state = { ...record.state, online: false };
        events.push(this.addEvent(record, 'offline', new Date(nowMs).toISOString(), EMPTY_READING, null));
      }
    }
    return events;
  }

  private addEvent(
    record: SensorRecord,
    type: SensorEventType,
    at: string,
    reading: ReadingValues,
    latencyMs: number | null,
  ): SensorEvent {
    const event: SensorEvent = {
      id: this.nextEventId++,
      sensorId: record.state.sensorId,
      type,
      at,
      latencyMs,
      ...pickReading(reading),
    };

    record.events.push(event);
    if (record.events.length > this.options.maxEvents) {
      record.events.splice(0, record.events.length - this.options.maxEvents);
    }

    const state = { ...record.state };
    for (const listener of this.listeners) {
      try {
        listener(state, event);
      } catch (error) {
        console.error('[store] listener failed:', error);
      }
    }
    return event;
  }
}
