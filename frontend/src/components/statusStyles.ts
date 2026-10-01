import type { GroupRoomStatus, SeatStatus } from '../types/campus';
import type { ReadingRoomAvailability } from '../utils/readingRoomAvailability';

export interface StatusStyle {
  label: string;
  dot: string;
  badge: string;
  seat?: string;
}

export const seatStatusStyles: Record<SeatStatus, StatusStyle> = {
  available: {
    label: 'Available',
    dot: 'bg-emerald-400',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    seat: 'fill-emerald-400 stroke-emerald-100',
  },
  occupied: {
    label: 'Occupied',
    dot: 'bg-rose-400',
    badge: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
    seat: 'fill-rose-400 stroke-rose-100',
  },
  'recently-used': {
    label: 'Recently used',
    dot: 'bg-amber-300',
    badge: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    seat: 'fill-amber-300 stroke-amber-100',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-slate-500',
    badge: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    seat: 'fill-slate-500 stroke-slate-300',
  },
};

export const groupRoomStatusStyles: Record<GroupRoomStatus, StatusStyle> = {
  available: {
    label: 'Available',
    dot: 'bg-emerald-400',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  },
  'booked-unused': {
    label: 'Booked · empty',
    dot: 'bg-amber-300',
    badge: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  },
  'booked-in-use': {
    label: 'In use',
    dot: 'bg-rose-400',
    badge: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  },
};

export const groupRoomMapOverlayStyles: Record<GroupRoomStatus, { fillColor: string; lineColor: string; label: string }> = {
  available: {
    fillColor: '#22c55e',
    lineColor: '#15803d',
    label: groupRoomStatusStyles.available.label,
  },
  'booked-unused': {
    fillColor: '#facc15',
    lineColor: '#ca8a04',
    label: groupRoomStatusStyles['booked-unused'].label,
  },
  'booked-in-use': {
    fillColor: '#f43f5e',
    lineColor: '#be123c',
    label: groupRoomStatusStyles['booked-in-use'].label,
  },
};

export const readingRoomAvailabilityStyles: Record<ReadingRoomAvailability, StatusStyle> = {
  good: {
    label: 'Many seats free',
    dot: 'bg-emerald-400',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  },
  limited: {
    label: 'Few seats free',
    dot: 'bg-amber-300',
    badge: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  },
  low: {
    label: 'Almost full',
    dot: 'bg-rose-400',
    badge: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  },
  unknown: {
    label: 'No sensor data',
    dot: 'bg-slate-500',
    badge: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  },
};
