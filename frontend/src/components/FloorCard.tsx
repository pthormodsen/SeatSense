import { Link } from 'react-router-dom';
import type { Floor } from '../types/campus';
import { seatService } from '../services/seatService';
import OccupancyBar from './OccupancyBar';
import { linkCardClass } from './uiStyles';

interface FloorCardProps {
  floor: Floor;
}

// The free-seat count is the headline; everything else supports it.
const FloorCard = ({ floor }: FloorCardProps) => {
  const summary = seatService.summarizeRooms(floor.rooms);

  return (
    <Link to={`/building/${floor.buildingId}/floor/${floor.id}`} className={`${linkCardClass} group p-6`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-medium text-white">{floor.name}</h2>
        <span aria-hidden="true" className="text-slate-500 transition duration-300 group-hover:translate-x-1 group-hover:text-white">→</span>
      </div>
      <p className="mt-8 text-7xl font-semibold leading-none tracking-tighter text-emerald-200 tabular-nums">
        {summary.available}
      </p>
      <p className="mt-2 text-sm text-slate-400">
        of {summary.total} seats free · {floor.rooms.length} rooms
      </p>
      <div className="mt-5">
        <OccupancyBar summary={summary} size="sm" />
      </div>
    </Link>
  );
};

export default FloorCard;
