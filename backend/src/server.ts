import { createApp } from './app.js';
import { loadConfig, type Config } from './config.js';

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

const app = createApp(config);
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
