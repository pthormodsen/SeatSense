import { DEMO_REFERENCE_NOW_MS } from '../demo/createDemoRoomFromMazeMap';

// Formatted in UTC with a 24h clock so every machine shows the same text.
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// "Demo data · Snapshot 10:30"
export const formatDemoSnapshotTime = (ms: number = DEMO_REFERENCE_NOW_MS): string =>
  `Demo data · Snapshot ${timeFormat.format(ms)}`;

// "Demo data · 15 Jan 2026, 10:30"
export const formatDemoSnapshotDateTime = (ms: number = DEMO_REFERENCE_NOW_MS): string =>
  `Demo data · ${dateFormat.format(ms)}, ${timeFormat.format(ms)}`;
