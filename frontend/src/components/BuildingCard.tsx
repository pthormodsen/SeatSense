import { Link } from 'react-router-dom';
import type { Building } from '../types/campus';
import { seatService } from '../services/seatService';
import OccupancyBar from './OccupancyBar';

interface BuildingCardProps {
  building: Building;
}

const BuildingCard = ({ building }: BuildingCardProps) => {
  const summary = seatService.summarizeFloors(building.floors);

  return (
    <Link
      to={`/building/${building.id}`}
      className="block rounded-lg border border-white/10 bg-surface-850 p-5 transition hover:border-cyan-300/40 hover:bg-surface-800"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-cyan-200">{building.campusName}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{building.name}</h2>
          <p className="mt-2 text-sm text-slate-400">{building.description}</p>
        </div>
        <span className="rounded-md bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
          {summary.available} free
        </span>
      </div>
      <div className="mt-5">
        <OccupancyBar occupied={summary.occupied} total={summary.total} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <span className="text-slate-400">
          Floors <b className="text-white">{building.floors.length}</b>
        </span>
        <span className="text-slate-400">
          Seats <b className="text-white">{summary.total}</b>
        </span>
        <span className="text-slate-400">
          Used <b className="text-white">{summary.occupancyPercent}%</b>
        </span>
      </div>
    </Link>
  );
};

export default BuildingCard;
