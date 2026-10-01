import { DEMO_REFERENCE_NOW_MS } from './createDemoRoomFromMazeMap';
import { hashToRange, pickFromHash } from './deterministicDemo';

// Synthetic "Popular times" for reading rooms. This is demo history, not
// measured data: every value is derived from hashes of the room id, so the same
// room always shows the same week. A real backend would replace this with
// aggregated occupancy observations behind seatService.

export interface PopularTimePoint {
  hour: number;
  // Typical occupancy for this hour, 0–100 integer.
  occupancyPercent: number;
}

export interface PopularTimesDay {
  // 0 = Monday … 6 = Sunday.
  weekday: number;
  points: PopularTimePoint[];
}

export type BusyLevel = 'quiet' | 'moderate' | 'busy' | 'very-busy';

export const POPULAR_TIMES_FIRST_HOUR = 6;
export const POPULAR_TIMES_LAST_HOUR = 23;

export const WEEKDAY_SHORT_LABELS: readonly string[] = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

// Upper bounds (exclusive) per level: < 25 quiet, < 50 moderate, < 75 busy,
// otherwise very busy.
export const BUSY_LEVEL_THRESHOLDS = {
  quiet: 25,
  moderate: 50,
  busy: 75,
} as const;

export const getBusyLevel = (percent: number): BusyLevel => {
  if (percent < BUSY_LEVEL_THRESHOLDS.quiet) return 'quiet';
  if (percent < BUSY_LEVEL_THRESHOLDS.moderate) return 'moderate';
  if (percent < BUSY_LEVEL_THRESHOLDS.busy) return 'busy';
  return 'very-busy';
};

const BUSY_LEVEL_LABELS: Record<BusyLevel, string> = {
  quiet: 'Usually quiet',
  moderate: 'Usually moderate',
  busy: 'Usually busy',
  'very-busy': 'Usually very busy',
};

export const getBusyLevelLabel = (level: BusyLevel): string => BUSY_LEVEL_LABELS[level];

// Typical weekday shape for a reading room, indexed by hour 0–23: quiet early,
// rising through the morning, peak around 12–14, slow evening decline.
const BASE_WEEKDAY_CURVE = [
  0, 0, 0, 0, 0, 0, // 00–05 (outside the displayed range)
  5, 12, 28, 45, 60, 72, 78, 80, 80, 76, 66, 54, 44, 36, 28, 18, 10, 4, // 06–23
];

// Overall level per weekday (Mon busiest, weekends clearly quieter).
const WEEKDAY_SCALE = [1.05, 1.05, 1.0, 0.98, 0.95, 0.45, 0.4];

// Weekends start later: the curve is shifted this many hours to the right.
const WEEKDAY_START_DELAY = [0, 0, 0, 0, 0, 2, 2];

// Friday afternoons empty out earlier: from 13:00 the level drops a bit more
// each hour, down to 70 % of a normal weekday.
const FRIDAY = 4;
const getFridayAfternoonScale = (hour: number) =>
  hour <= 12 ? 1 : Math.max(0.7, 1 - 0.08 * (hour - 12));

const HOUR_JITTER = 4;

const baseCurveAt = (hour: number) =>
  hour < 0 || hour >= BASE_WEEKDAY_CURVE.length ? 0 : BASE_WEEKDAY_CURVE[hour];

// Room-level variation: some rooms peak an hour earlier/later, some are more
// popular than others overall.
const getRoomPeakShift = (roomId: string) => hashToRange(`popular-times-shift:${roomId}`, -1, 1);
const getRoomScale = (roomId: string) => hashToRange(`popular-times-scale:${roomId}`, 75, 110) / 100;

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export const getPopularTimesDay = (roomId: string, weekday: number): PopularTimesDay => {
  const day = ((weekday % 7) + 7) % 7;
  const shift = getRoomPeakShift(roomId) + WEEKDAY_START_DELAY[day];
  const scale = getRoomScale(roomId) * WEEKDAY_SCALE[day];
  const points: PopularTimePoint[] = [];

  for (let hour = POPULAR_TIMES_FIRST_HOUR; hour <= POPULAR_TIMES_LAST_HOUR; hour += 1) {
    let value = baseCurveAt(hour - shift) * scale;

    if (day === FRIDAY) {
      value *= getFridayAfternoonScale(hour);
    }

    // Small per-hour jitter, scaled down for near-empty hours so they stay low.
    const jitter = hashToRange(`popular-times:${roomId}:${day}:${hour}`, -HOUR_JITTER, HOUR_JITTER);
    value += value < 10 ? jitter / 4 : jitter;

    points.push({ hour, occupancyPercent: clampPercent(value) });
  }

  return { weekday: day, points };
};

export const getPopularTimesWeek = (roomId: string): PopularTimesDay[] =>
  WEEKDAY_SHORT_LABELS.map((_, weekday) => getPopularTimesDay(roomId, weekday));

const TYPICAL_STAY_TEXTS = [
  'People usually stay 30 min to 1.5 h',
  'People usually stay 45 min to 2 h',
  'People usually stay 1 to 3 h',
  'People usually stay 2 to 4 h',
];

export const getTypicalStayText = (roomId: string): string =>
  pickFromHash(`popular-times-stay:${roomId}`, TYPICAL_STAY_TEXTS);

// Weekday (Mon = 0) and hour in UTC for the demo clock, with the hour clamped
// into the displayed range.
export const getDemoWeekdayAndHour = (
  nowMs: number = DEMO_REFERENCE_NOW_MS,
): { weekday: number; hour: number } => {
  const date = new Date(nowMs);
  const weekday = (date.getUTCDay() + 6) % 7;
  const hour = Math.min(
    POPULAR_TIMES_LAST_HOUR,
    Math.max(POPULAR_TIMES_FIRST_HOUR, date.getUTCHours()),
  );

  return { weekday, hour };
};
