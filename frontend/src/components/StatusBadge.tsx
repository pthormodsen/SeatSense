import type { GroupRoomStatus, SeatStatus } from '../types/campus';
import { groupRoomStatusStyles, seatStatusStyles } from './statusStyles';

interface StatusBadgeProps {
  status: SeatStatus | GroupRoomStatus;
  kind?: 'seat' | 'group-room';
}

const StatusBadge = ({ status, kind = 'seat' }: StatusBadgeProps) => {
  const styles = kind === 'group-room'
    ? groupRoomStatusStyles[status as GroupRoomStatus]
    : seatStatusStyles[status as SeatStatus];

  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium ${styles.badge}`}>
      <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
      {styles.label}
    </span>
  );
};

export default StatusBadge;
