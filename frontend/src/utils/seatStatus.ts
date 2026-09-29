import type { Seat, SeatStatus } from '../types/campus';

export const RECENTLY_USED_MINUTES = 10;

export const getSeatStatus = (seat: Seat, nowMs: number): SeatStatus => {
  if (!seat.sensorOnline) {
    return 'offline';
  }

  if (seat.presenceDetected) {
    return 'occupied';
  }

  if (!seat.lastPresenceAt) {
    return 'available';
  }

  const lastPresenceMs = new Date(seat.lastPresenceAt).getTime();
  const recentlyUsedMs = RECENTLY_USED_MINUTES * 60 * 1000;

  return nowMs - lastPresenceMs <= recentlyUsedMs ? 'recently-used' : 'available';
};
