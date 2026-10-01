import type { GroupRoom } from '../types/campus';
import { getGroupRoomStatus } from '../utils/roomStatus';
import StatusBadge from './StatusBadge';
import { cardClass } from './uiStyles';

// Room-level state for a group room: status first, booking and presence as
// supporting facts. Group rooms have no individual seats.
const GroupRoomOverview = ({ room }: { room: GroupRoom }) => {
  const facts = [
    { label: 'Capacity', value: `Up to ${room.capacity} people` },
    { label: 'Booking', value: room.booking ? `${room.booking.start}–${room.booking.end}` : 'Not booked' },
    { label: 'Presence', value: room.presenceDetected ? 'Detected' : 'Not detected' },
  ];

  return (
    <section aria-label="Room availability" className={`${cardClass} p-5`}>
      <StatusBadge status={getGroupRoomStatus(room)} kind="group-room" />
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        {facts.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className="mt-1 font-medium text-white">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 max-w-2xl text-sm text-slate-500">
        Group rooms use booking state and presence detection only. Individual study seats are not shown.
      </p>
    </section>
  );
};

export default GroupRoomOverview;
