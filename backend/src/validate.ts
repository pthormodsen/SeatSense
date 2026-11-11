import type { ReadingValues } from './types.js';

export type ValidationResult =
  | { ok: true; value: ReadingValues }
  | { ok: false; error: string };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// [field, min, max] for optional integer fields.
const INTEGER_FIELDS: Array<[keyof ReadingValues, number, number]> = [
  ['seq', 0, 0xffffffff],
  ['targetType', 0, 3],
  ['movingCm', 0, 0xffff],
  ['stationaryCm', 0, 0xffff],
  // The LD2410C reports 0-100, but the frame field is a byte; accept the byte
  // range so an unexpected value from real hardware is logged, not dropped.
  ['movingEnergy', 0, 0xff],
  ['stationaryEnergy', 0, 0xff],
  ['rssi', -127, 0],
  ['uptimeMs', 0, Number.MAX_SAFE_INTEGER],
];

// Validates a parsed JSON body for POST /api/sensors/:id/readings. Unknown
// fields are ignored. Missing optional fields become null.
export const parseReading = (body: unknown, sensorId: string): ValidationResult => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const input = body as Record<string, unknown>;

  if (input.sensorId !== sensorId) {
    return { ok: false, error: `sensorId must be "${sensorId}" (same as the URL)` };
  }

  if (!('occupied' in input) || (typeof input.occupied !== 'boolean' && input.occupied !== null)) {
    return { ok: false, error: 'occupied must be true, false or null' };
  }

  let sentAt: string | null = null;
  if (input.sentAt !== undefined && input.sentAt !== null) {
    if (typeof input.sentAt !== 'string' || !ISO_DATE_PATTERN.test(input.sentAt)) {
      return { ok: false, error: 'sentAt must be an ISO 8601 timestamp or null' };
    }
    const time = Date.parse(input.sentAt);
    if (!Number.isFinite(time)) {
      return { ok: false, error: 'sentAt is not a valid date' };
    }
    sentAt = new Date(time).toISOString();
  }

  const value: ReadingValues = {
    occupied: input.occupied as boolean | null,
    sentAt,
    seq: null,
    targetType: null,
    movingCm: null,
    stationaryCm: null,
    movingEnergy: null,
    stationaryEnergy: null,
    rssi: null,
    uptimeMs: null,
  };

  for (const [field, min, max] of INTEGER_FIELDS) {
    const raw = input[field];
    if (raw === undefined || raw === null) {
      continue;
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) {
      return { ok: false, error: `${field} must be an integer between ${min} and ${max}, or null` };
    }
    (value as unknown as Record<string, number>)[field] = raw;
  }

  return { ok: true, value };
};
