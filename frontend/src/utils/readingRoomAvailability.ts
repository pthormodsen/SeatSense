import type { OccupancySummary } from '../types/campus';

export type ReadingRoomAvailability = 'good' | 'limited' | 'low' | 'unknown';

// Share of seats with a working sensor that are free right now.
// Offline seats are left out because we don't know their state.
export const GOOD_AVAILABILITY_RATIO = 0.3;
export const LIMITED_AVAILABILITY_RATIO = 0.1;

export const getReadingRoomAvailability = (
  summary: Pick<OccupancySummary, 'available' | 'total' | 'offline'>,
): ReadingRoomAvailability => {
  const onlineSeats = summary.total - summary.offline;

  if (onlineSeats <= 0) {
    return 'unknown';
  }

  const freeRatio = summary.available / onlineSeats;

  if (freeRatio >= GOOD_AVAILABILITY_RATIO) {
    return 'good';
  }

  return freeRatio >= LIMITED_AVAILABILITY_RATIO ? 'limited' : 'low';
};
