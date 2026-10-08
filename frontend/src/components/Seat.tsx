import type { Seat as SeatType } from '../types/campus';
import { getSeatStatus } from '../utils/seatStatus';
import { seatStatusStyles } from './statusStyles';

interface SeatProps {
  seat: SeatType;
  selected: boolean;
  nowMs: number;
  onSelect: (seat: SeatType) => void;
}

const Seat = ({ seat, selected, nowMs, onSelect }: SeatProps) => {
  const status = getSeatStatus(seat, nowMs);
  const styles = seatStatusStyles[status];

  return (
    <button
      type="button"
      className="group rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
      style={{ transform: `translate(${seat.x}px, ${seat.y}px)` }}
      onClick={() => onSelect(seat)}
      aria-label={`${seat.id} ${styles.label}`}
    >
      <svg width="34" height="34" viewBox="0 0 34 34" className="overflow-visible">
        <circle
          cx="17"
          cy="17"
          r={selected ? 13 : 11}
          className={`${styles.seat} origin-center transition-all duration-200 group-hover:stroke-white`}
          strokeWidth={selected ? 4 : 2}
        />
        <text x="17" y="21" textAnchor="middle" className="fill-surface-950 text-[8px] font-bold">
          {seat.id.replace(/[A-Z]/g, '')}
        </text>
      </svg>
    </button>
  );
};

export default Seat;
