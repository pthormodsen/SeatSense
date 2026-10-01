import { Link } from 'react-router-dom';
import type { Floor } from '../types/campus';
import { seatService } from '../services/seatService';
import OccupancyBar from './OccupancyBar';
import { linkCardClass } from './uiStyles';

interface FloorCardProps {
  floor: Floor;
}

const FloorCard = ({ floor }: FloorCardProps) => {
  const summary = seatService.summarizeRooms(floor.rooms);

  return (
    <Link to={`/building/${floor.buildingId}/floor/${floor.id}`} className={`${linkCardClass} p-5`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{floor.name}</h2>
        <span className="text-sm text-slate-400">{floor.rooms.length} rooms</span>
      </div>
      <p className="mt-3 text-sm text-slate-400">
        <span className="text-2xl font-semibold text-emerald-200">{summary.available}</span>
        <span className="ml-1.5">of {summary.total} seats free</span>
      </p>
      <div className="mt-3">
        <OccupancyBar summary={summary} size="sm" />
      </div>
    </Link>
  );
};

export default FloorCard;
