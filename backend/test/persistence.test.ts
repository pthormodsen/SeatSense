import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { loadEvents } from '../src/eventLog.js';
import type { SensorEvent, SensorState } from '../src/types.js';

const SENSOR = 'seat-001';
const OTHER = 'seat-002';
const TOKEN = 'test-token-seat-001-abcdef';
const OTHER_TOKEN = 'test-token-seat-002-abcdef';
const START_MS = Date.parse('2026-11-11T09:30:00.000Z');

let dir: string;
let file: string;
let clock: number;
const apps: App[] = [];

const start = async (tokens = `${SENSOR}:${TOKEN},${OTHER}:${OTHER_TOKEN}`, maxEvents = '3') => {
  const config = loadConfig({
    PORT: '0',
    HOST: '127.0.0.1',
    DEVICE_TOKENS: tokens,
    MAX_EVENTS: maxEvents,
    EVENTS_FILE: file,
  });
  const loaded = await loadEvents(file, new Set(config.deviceTokens.keys()), config.maxEvents);
  const app = createApp(config, { now: () => clock, timers: false, initialEvents: loaded.events });
  apps.push(app);
  const port = await app.listen();
  return { app, base: `http://127.0.0.1:${port}`, loaded };
};

const post = (base: string, sensorId: string, token: string, occupied: boolean, seq: number) =>
  fetch(`${base}/api/sensors/${sensorId}/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sensorId, occupied, seq, sentAt: new Date(clock - 100).toISOString() }),
  }).then((res) => res.arrayBuffer());

const fileEvents = (): SensorEvent[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SensorEvent);

describe('event persistence (EVENTS_FILE)', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'seatsense-events-'));
    file = join(dir, 'nested', 'events.jsonl');
    clock = START_MS;
  });
  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('appends every event as one JSON line, including offline', async () => {
    const { app, base } = await start();
    await post(base, SENSOR, TOKEN, true, 1);
    clock += 10_000;
    await post(base, SENSOR, TOKEN, true, 2);
    clock += 30_000;
    app.checkOffline();
    await app.close();

    const events = fileEvents();
    assert.deepEqual(
      events.map((e) => e.type),
      ['online', 'occupancy-change', 'heartbeat', 'offline'],
    );
    assert.equal(events[0].sensorId, SENSOR);
    assert.equal(events[0].latencyMs, 100);
  });

  test('restores the last MAX_EVENTS per sensor, state and event ids after a restart', async () => {
    const first = await start();
    await post(first.base, SENSOR, TOKEN, true, 1); // online + change
    await post(first.base, SENSOR, TOKEN, true, 2); // heartbeat
    await post(first.base, SENSOR, TOKEN, false, 3); // change
    await post(first.base, OTHER, OTHER_TOKEN, true, 1); // online + change
    await first.app.close();
    assert.equal(fileEvents().length, 6, 'the file keeps the full history');

    clock += 5_000;
    const second = await start();
    assert.equal(second.loaded.lines, 6);

    const events = (await (await fetch(`${second.base}/api/sensors/${SENSOR}/events`)).json()) as {
      events: SensorEvent[];
    };
    assert.deepEqual(
      events.events.map((e) => [e.type, e.seq]),
      [
        ['occupancy-change', 1],
        ['heartbeat', 2],
        ['occupancy-change', 3],
      ],
      'only the newest MAX_EVENTS (3) per sensor are loaded',
    );

    const state = (await (await fetch(`${second.base}/api/sensors/${SENSOR}`)).json()) as SensorState;
    assert.equal(state.online, true);
    assert.equal(state.occupied, false);
    assert.equal(state.seq, 3);
    assert.equal(state.lastReceivedAt, new Date(START_MS).toISOString());

    // A reading right after the restart is not a new "online" event, and its
    // id continues after the restored ones.
    await post(second.base, SENSOR, TOKEN, false, 4);
    await second.app.close(); // flushes the file
    const all = fileEvents();
    const last = all[all.length - 1];
    assert.equal(last.type, 'heartbeat');
    assert.equal(last.id, Math.max(...all.slice(0, -1).map((e) => e.id)) + 1);
  });

  test('a restored sensor that stays silent goes offline after the timeout', async () => {
    const first = await start();
    await post(first.base, SENSOR, TOKEN, true, 1);
    await first.app.close();

    clock += 31_000;
    const second = await start();
    const offline = second.app.checkOffline();
    assert.deepEqual(offline.map((e) => [e.sensorId, e.type]), [[SENSOR, 'offline']]);
    await second.app.close(); // flushes the file
    assert.equal(fileEvents().at(-1)?.type, 'offline');
  });

  test('skips invalid lines and sensors that are no longer configured', async () => {
    const first = await start();
    await post(first.base, SENSOR, TOKEN, true, 1);
    await post(first.base, OTHER, OTHER_TOKEN, true, 1);
    await first.app.close();
    appendFileSync(file, '{not json\n{"id":"x"}\n\n');

    const second = await start(`${SENSOR}:${TOKEN}`);
    assert.equal(second.loaded.skippedInvalid, 2);
    assert.equal(second.loaded.skippedUnknownSensor, 2);
    assert.equal(second.loaded.events.length, 2);
  });

  test('a missing file is an empty log', async () => {
    const loaded = await loadEvents(join(dir, 'missing.jsonl'), new Set([SENSOR]), 500);
    assert.deepEqual(loaded, { events: [], lines: 0, skippedInvalid: 0, skippedUnknownSensor: 0 });
  });
});
