// SeatSense live sensor API contract.
//
// The frontend keeps a copy of these types in frontend/src/types/liveSensor.ts
// (the two Docker builds have separate contexts, so the file cannot be shared).
// Keep both copies and the firmware payload in src/network.cpp in sync.

// Values reported by a sensor node in one reading. `null` means "not reported".
export interface ReadingValues {
  // true = person detected, false = no person, null = node is alive but the
  // radar is not delivering valid frames (firmware state UNKNOWN).
  occupied: boolean | null;
  // Sensor wall-clock time (ISO 8601, UTC) when the reading was produced.
  // null until the node has synchronised its clock with NTP.
  sentAt: string | null;
  // Per-boot sequence number; gaps mean readings were dropped or failed.
  seq: number | null;
  // LD2410C target type: 0 none, 1 moving, 2 stationary, 3 moving + stationary.
  targetType: number | null;
  movingCm: number | null;
  stationaryCm: number | null;
  movingEnergy: number | null;
  stationaryEnergy: number | null;
  // Wi-Fi signal strength in dBm.
  rssi: number | null;
  // Milliseconds since the node booted.
  uptimeMs: number | null;
}

// Body of POST /api/sensors/:id/readings. Only `sensorId` and `occupied` are
// required; every other field may be omitted or null.
export interface ReadingPayload extends Partial<ReadingValues> {
  sensorId: string;
  occupied: boolean | null;
}

// GET /api/sensors/:id
export interface SensorState extends ReadingValues {
  sensorId: string;
  // false until the first reading, and after OFFLINE_AFTER_MS without one.
  online: boolean;
  // Server time when the latest reading arrived.
  lastReceivedAt: string | null;
  // lastReceivedAt - sentAt for the latest reading (needs NTP on the sensor).
  latencyMs: number | null;
}

export type SensorEventType = 'occupancy-change' | 'heartbeat' | 'offline' | 'online';

// One entry in the in-memory event log. `offline` events carry no reading, so
// their reading fields are null.
export interface SensorEvent extends ReadingValues {
  id: number;
  sensorId: string;
  type: SensorEventType;
  // Server time of the event (receivedAt for readings).
  at: string;
  latencyMs: number | null;
}

// GET /api/sensors/:id/events
export interface SensorEventsResponse {
  events: SensorEvent[];
}

// Data of the SSE messages on GET /api/sensors/:id/stream.
// `snapshot` is sent once on connect, `update` after every new event.
export interface StreamMessage {
  state: SensorState;
  event: SensorEvent | null;
  // Server time when the message was written, for delivery-latency display.
  pushedAt: string;
}
