import { Link } from 'react-router-dom';
import type { Building } from '../types/campus';
import { seatService } from '../services/seatService';
import AvailabilitySummary from './AvailabilitySummary';
import { focusRingClass } from './uiStyles';

interface BuildingCardProps {
  building: Building;
  // Position in the list, shown as an editorial index number.
  index?: number;
}

// Entry point into a building, laid out as a large editorial row. The whole row is the link.
const BuildingCard = ({ building, index = 0 }: BuildingCardProps) => {
  const summary = seatService.summarizeFloors(building.floors);

  return (
    <Link
      to={`/building/${building.id}`}
      className={`group relative block overflow-hidden rounded-2xl border border-white/10 bg-surface-900 p-6 transition-colors duration-500 hover:border-white/30 sm:p-10 ${focusRingClass}`}
    >
      {/* Light sweeps up from the bottom on hover. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-full translate-y-full bg-white/[0.04] transition-transform duration-500 ease-out group-hover:translate-y-0"
      />
      <div className="relative flex items-start justify-between gap-6">
        <div>
          <p className="eyebrow">{String(index + 1).padStart(2, '0')} · {building.floors.length} floors</p>
          <h3 className="mt-4 text-5xl font-semibold leading-none tracking-tight text-white sm:text-7xl">
            {building.name}
          </h3>
          <p className="mt-4 max-w-md text-slate-400">{building.description}</p>
        </div>
        <span
          aria-hidden="true"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/20 text-white transition duration-500 group-hover:rotate-[-45deg] group-hover:border-white group-hover:bg-white group-hover:text-surface-950 sm:h-16 sm:w-16"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M3 10a.75.75 0 0 1 .75-.75h10.69l-3.97-3.97a.75.75 0 0 1 1.06-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06l3.97-3.97H3.75A.75.75 0 0 1 3 10Z" />
          </svg>
        </span>
      </div>
      <div className="relative mt-10">
        <AvailabilitySummary summary={summary} />
      </div>
    </Link>
  );
};

export default BuildingCard;
