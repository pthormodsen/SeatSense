import { Link } from 'react-router-dom';
import type { Floor } from '../types/campus';
import { seatService } from '../services/seatService';
import OccupancyBar from './OccupancyBar';

interface FloorCardProps {
  floor: Floor;
}

const FloorCard = ({ floor }: FloorCardProps) => {
  const summary = seatService.summarizeRooms(floor.rooms);

  return (
    <Link
      to={`/building/${floor.buildingId}/floor/${floor.id}`}
      className="rounded-lg border border-white/10 bg-surface-850 p-5 transition hover:border-cyan-300/40 hover:bg-surface-800"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{floor.name}</h2>
        <span className="text-sm text-slate-400">{floor.rooms.length} rooms</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-emerald-200">{summary.available} available</p>
      <p className="mb-4 mt-1 text-sm text-slate-400">{summary.total} total seats</p>
      <OccupancyBar occupied={summary.occupied} total={summary.total} />
    </Link>
  );
};

export default FloorCard;
