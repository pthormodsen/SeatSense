export const SENSOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MIN_TOKEN_LENGTH = 16;

export interface Config {
  host: string;
  port: number;
  // sensorId -> device token. Only these sensors exist for the API.
  deviceTokens: Map<string, string>;
  offlineAfterMs: number;
  maxEvents: number;
  maxStreamClients: number;
  keepaliveMs: number;
  offlineCheckMs: number;
  maxBodyBytes: number;
  // JSON Lines file for persisted events; null disables persistence.
  eventsFile: string | null;
}

// "seat-001:token-a,seat-002:token-b" -> Map. Throws on malformed entries so a
// typo in the deployment config fails loudly at startup.
export const parseDeviceTokens = (raw: string): Map<string, string> => {
  const tokens = new Map<string, string>();

  for (const entry of raw.split(',').map((part) => part.trim()).filter(Boolean)) {
    const separator = entry.indexOf(':');
    const sensorId = separator > 0 ? entry.slice(0, separator).trim() : '';
    const token = separator > 0 ? entry.slice(separator + 1).trim() : '';

    if (!SENSOR_ID_PATTERN.test(sensorId)) {
      throw new Error(`DEVICE_TOKENS: invalid sensor id in entry "${sensorId || entry.slice(0, 20)}"`);
    }
    if (token.length < MIN_TOKEN_LENGTH) {
      throw new Error(`DEVICE_TOKENS: token for ${sensorId} must be at least ${MIN_TOKEN_LENGTH} characters`);
    }
    if (tokens.has(sensorId)) {
      throw new Error(`DEVICE_TOKENS: duplicate sensor id ${sensorId}`);
    }
    tokens.set(sensorId, token);
  }
  return tokens;
};

const readInt = (env: NodeJS.ProcessEnv, name: string, fallback: number, min: number): number => {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}, got "${raw}"`);
  }
  return value;
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => ({
  host: env.HOST?.trim() || '0.0.0.0',
  port: readInt(env, 'PORT', 3001, 0),
  deviceTokens: parseDeviceTokens(env.DEVICE_TOKENS ?? ''),
  offlineAfterMs: readInt(env, 'OFFLINE_AFTER_MS', 30_000, 1_000),
  maxEvents: readInt(env, 'MAX_EVENTS', 500, 1),
  maxStreamClients: readInt(env, 'MAX_STREAM_CLIENTS', 100, 1),
  keepaliveMs: readInt(env, 'SSE_KEEPALIVE_MS', 15_000, 1_000),
  offlineCheckMs: 1_000,
  maxBodyBytes: 4_096,
  eventsFile: env.EVENTS_FILE?.trim() || null,
});
