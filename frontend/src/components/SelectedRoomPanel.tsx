import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { summarizeReadingSeats } from '../demo/createDemoRoomFromMazeMap';
import type { GroupRoom, ReadingRoom, Room } from '../types/campus';
import { getGroupRoomStatus } from '../utils/roomStatus';
import OccupancyBar from './OccupancyBar';
import { groupRoomStatusStyles } from './statusStyles';

interface SelectedRoomPanelProps {
  room: Room | null;
  // Built by the page so the known-room / generated-room link rule stays in one place.
  detailHref: string | null;
  quickPicks: Room[];
  onSelectRoom: (roomId: string) => void;
}

const typeChipClass = 'inline-flex rounded border border-white/10 px-1.5 py-0.5 text-xs font-medium text-slate-400';
const primaryButtonClass =
  'inline-flex w-full justify-center rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-surface-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-850';

const SelectedRoomPanel = forwardRef<HTMLElement, SelectedRoomPanelProps>(
  ({ room, detailHref, quickPicks, onSelectRoom }, ref) => (
    <aside
      ref={ref}
      aria-label="Selected room"
      aria-live="polite"
      className="flex h-full scroll-mt-4 flex-col rounded-lg border border-white/10 bg-surface-850 p-5"
    >
      {room === null ? (
        <EmptyPanel quickPicks={quickPicks} onSelectRoom={onSelectRoom} />
      ) : room.type === 'reading-room' ? (
        <ReadingRoomPanel room={room} detailHref={detailHref} />
      ) : (
        <GroupRoomPanel room={room} detailHref={detailHref} />
      )}
    </aside>
  ),
);

SelectedRoomPanel.displayName = 'SelectedRoomPanel';

const Swatch = ({ className }: { className: string }) => (
  <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-sm ${className}`} />
);

const EmptyPanel = ({ quickPicks, onSelectRoom }: Pick<SelectedRoomPanelProps, 'quickPicks' | 'onSelectRoom'>) => (
  <div className="flex flex-1 flex-col">
    <h2 className="text-xl font-semibold text-white">Choose a room</h2>
    <p className="mt-2 text-sm text-slate-400">
      Select a room on the map or from the list below.{' '}
      <span className="inline-flex items-center gap-0.5 align-middle">
        <Swatch className={groupRoomStatusStyles.available.dot} />
        <Swatch className={groupRoomStatusStyles['booked-unused'].dot} />
        <Swatch className={groupRoomStatusStyles['booked-in-use'].dot} />
      </span>{' '}
      Coloured rooms are group rooms. Uncoloured reading rooms can still be clicked to see seat availability.
    </p>
    {quickPicks.length > 0 ? (
      <div className="mt-5">
        <p className="text-xs font-medium text-slate-500">Suggestions</p>
        <ul className="mt-1.5 space-y-1">
          {quickPicks.map((pick) => (
            <li key={pick.id}>
              <button
                type="button"
                onClick={() => onSelectRoom(pick.id)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-white/10 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
              >
                <span className="truncate font-medium">{pick.name}</span>
                <QuickPickStatus room={pick} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : null}
  </div>
);

const QuickPickStatus = ({ room }: { room: Room }) => {
  if (room.type === 'reading-room') {
    return (
      <span className="shrink-0 text-xs text-slate-400">
        <span className="font-medium text-emerald-200">{summarizeReadingSeats(room.seats).available}</span> seats free
      </span>
    );
  }

  const status = groupRoomStatusStyles[getGroupRoomStatus(room)];

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.dot}`} />
      {status.label}
    </span>
  );
};

// Pinned to the bottom of the panel so it lines up with the bottom of the map.
const DetailLink = ({ href }: { href: string | null }) =>
  href ? (
    <div className="mt-auto pt-5">
      <Link to={href} className={primaryButtonClass}>
        View details
      </Link>
    </div>
  ) : null;

const ReadingRoomPanel = ({ room, detailHref }: { room: ReadingRoom; detailHref: string | null }) => {
  const summary = summarizeReadingSeats(room.seats);
  const secondary = [
    { value: summary.occupied, label: 'occupied' },
    { value: summary.recentlyUsed, label: 'recently used' },
    { value: summary.offline, label: 'offline' },
  ]
    .filter(({ value }) => value > 0)
    .map(({ value, label }) => `${value} ${label}`)
    .join(' · ');

  return (
    <div className="flex flex-1 flex-col">
      <span className={`${typeChipClass} self-start`}>Reading room</span>
      <h2 className="mt-2 text-xl font-semibold text-white">{room.name}</h2>
      <p className="mt-4">
        <span className="text-3xl font-semibold text-emerald-200">{summary.available}</span>
        <span className="ml-2 text-slate-400">of {summary.total} seats free</span>
      </p>
      <div className="mt-3">
        <OccupancyBar summary={summary} size="sm" />
      </div>
      {secondary ? <p className="mt-2 text-xs text-slate-500">{secondary}</p> : null}
      <DetailLink href={detailHref} />
    </div>
  );
};

const GroupRoomPanel = ({ room, detailHref }: { room: GroupRoom; detailHref: string | null }) => {
  const status = groupRoomStatusStyles[getGroupRoomStatus(room)];
  const booking = room.booking
    ? `Booked ${room.booking.start}–${room.booking.end}`
    : room.booked
      ? 'Booked'
      : 'Not booked';

  return (
    <div className="flex flex-1 flex-col">
      <span className={`${typeChipClass} self-start`}>Group room</span>
      <h2 className="mt-2 text-xl font-semibold text-white">{room.name}</h2>
      <span className={`mt-4 inline-flex items-center gap-2 self-start rounded-md border px-3 py-1.5 text-base font-medium ${status.badge}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} aria-hidden="true" />
        {status.label}
      </span>
      <p className="mt-3 text-sm text-slate-400">
        Up to {room.capacity} people · {booking}
      </p>
      <p className="mt-1 text-sm text-slate-400">{room.presenceDetected ? 'Someone detected' : 'No one detected'}</p>
      <DetailLink href={detailHref} />
    </div>
  );
};

export default SelectedRoomPanel;
