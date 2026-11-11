import { createApp } from './app.js';
import { loadConfig, type Config } from './config.js';
import { loadEvents } from './eventLog.js';
import type { SensorEvent } from './types.js';

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`[config] ${(error as Error).message}`);
  process.exit(1);
}

if (config.deviceTokens.size === 0) {
  console.warn('[config] DEVICE_TOKENS is empty: no sensors are configured and every reading will be rejected');
}

let initialEvents: SensorEvent[] = [];
if (config.eventsFile) {
  try {
    const loaded = await loadEvents(config.eventsFile, new Set(config.deviceTokens.keys()), config.maxEvents);
    initialEvents = loaded.events;
    console.log(
      `[events] ${config.eventsFile}: restored ${loaded.events.length} of ${loaded.lines} events` +
        (loaded.skippedInvalid ? `, skipped ${loaded.skippedInvalid} invalid lines` : '') +
        (loaded.skippedUnknownSensor ? `, ${loaded.skippedUnknownSensor} from sensors no longer configured` : ''),
    );
  } catch (error) {
    // An unreadable log must not keep the API down; it starts empty instead.
    console.error(`[events] could not read ${config.eventsFile}, starting with an empty log:`, error);
  }
} else {
  console.warn('[events] EVENTS_FILE is not set: events are kept in memory only');
}

const app = createApp(config, { initialEvents });
const port = await app.listen();
console.log(
  `[server] listening on ${config.host}:${port}, sensors: ${[...config.deviceTokens.keys()].join(', ') || 'none'}`,
);

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, closing live connections`);
  setTimeout(() => {
    console.error('[server] shutdown timed out, exiting');
    process.exit(1);
  }, 5_000).unref();
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
