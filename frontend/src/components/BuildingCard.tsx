import { Link } from 'react-router-dom';
import type { Building } from '../types/campus';
import { seatService } from '../services/seatService';
import AvailabilitySummary from './AvailabilitySummary';
import { linkCardClass } from './uiStyles';

interface BuildingCardProps {
  building: Building;
}

// Entry point into a building. The whole card is the link.
const BuildingCard = ({ building }: BuildingCardProps) => {
  const summary = seatService.summarizeFloors(building.floors);

  return (
    <Link to={`/building/${building.id}`} className={`${linkCardClass} group p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="text-xl font-semibold text-white">{building.name}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {building.floors.length} floors · {building.description}
          </p>
        </div>
        <span className="text-sm font-medium text-cyan-200 group-hover:text-cyan-100">
          Explore floors <span aria-hidden="true">→</span>
        </span>
      </div>
      <div className="mt-5">
        <AvailabilitySummary summary={summary} />
      </div>
    </Link>
  );
};

export default BuildingCard;
