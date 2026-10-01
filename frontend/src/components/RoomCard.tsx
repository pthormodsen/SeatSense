import { summarizeReadingSeats } from '../demo/createDemoRoomFromMazeMap';
import type { GroupRoom, ReadingRoom, Room } from '../types/campus';
import { getGroupRoomStatus } from '../utils/roomStatus';
import OccupancyBar from './OccupancyBar';
import { groupRoomStatusStyles } from './statusStyles';
import { focusRingClass } from './uiStyles';

interface RoomCardProps {
  room: Room;
  selected: boolean;
  onSelect: (roomId: string) => void;
}

const stateClass = (selected: boolean) =>
  selected
    ? 'border-cyan-300/70 bg-cyan-300/10'
    : 'border-white/10 bg-surface-850 hover:border-white/20';

const RoomCard = ({ room, selected, onSelect }: RoomCardProps) =>
  room.type === 'reading-room' ? (
    <ReadingRoomCard room={room} selected={selected} onSelect={onSelect} />
  ) : (
    <GroupRoomTile room={room} selected={selected} onSelect={onSelect} />
  );

const ReadingRoomCard = ({ room, selected, onSelect }: RoomCardProps & { room: ReadingRoom }) => {
  const summary = summarizeReadingSeats(room.seats);

  return (
    <button
      type="button"
      onClick={() => onSelect(room.id)}
      aria-pressed={selected}
      className={`w-full rounded-lg border p-3 text-left transition ${focusRingClass} ${stateClass(selected)}`}
    >
      <h3 className="font-semibold text-white">{room.name}</h3>
      <p className="mt-1 text-sm text-slate-400">
        <span className="font-medium text-emerald-200">{summary.available}</span> of {summary.total} seats free
      </p>
      <div className="mt-2.5">
        <OccupancyBar summary={summary} size="sm" />
      </div>
    </button>
  );
};

// Dense tile: status dot, name and capacity. The full status label is in the
// tooltip and for screen readers.
const GroupRoomTile = ({ room, selected, onSelect }: RoomCardProps & { room: GroupRoom }) => {
  const status = groupRoomStatusStyles[getGroupRoomStatus(room)];

  return (
    <button
      type="button"
      onClick={() => onSelect(room.id)}
      aria-pressed={selected}
      title={`${room.name} · ${status.label} · up to ${room.capacity} people`}
      className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${focusRingClass} ${stateClass(selected)}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
      <span className="min-w-0 truncate font-medium text-white">{room.name}</span>
      <span className="sr-only">, {status.label}, up to {room.capacity} people</span>
      <span aria-hidden="true" className="ml-auto shrink-0 text-xs text-slate-500">
        Up to {room.capacity}
      </span>
    </button>
  );
};

export default RoomCard;
