import { useState } from 'react';
import type { GroupRoomStatus } from '../types/campus';
import { groupRoomStatusStyles } from './statusStyles';

// The map overlay only colours group rooms (by booking/presence state). Reading rooms are
// left uncoloured but can be clicked to view seat availability.
const groupRoomItems: GroupRoomStatus[] = ['available', 'booked-unused', 'booked-in-use'];

interface MapLegendProps {
  className?: string;
}

const LegendItem = ({ dot, label }: { dot: string; label: string }) => (
  <li className="flex items-center gap-1.5 whitespace-nowrap">
    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-sm ${dot}`} />
    <span>{label}</span>
  </li>
);

const MapLegend = ({ className = '' }: MapLegendProps) => {
  // On small screens the legend starts collapsed so it doesn't cover the map.
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`rounded-lg border border-white/10 bg-surface-950/90 px-3 py-2 text-xs text-slate-300 shadow-lg backdrop-blur-sm ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="rounded text-xs font-medium text-slate-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 sm:hidden"
        aria-expanded={isOpen}
      >
        Legend {isOpen ? '−' : '+'}
      </button>
      <div className={`${isOpen ? 'mt-2 block' : 'hidden'} sm:mt-0 sm:block`}>
        <section>
          <h3 className="mb-1 text-[11px] font-medium text-slate-400">Group rooms</h3>
          <ul className="space-y-0.5">
            {groupRoomItems.map((key) => (
              <LegendItem key={key} dot={groupRoomStatusStyles[key].dot} label={groupRoomStatusStyles[key].label} />
            ))}
          </ul>
        </section>
        <p className="mt-2 text-[11px] text-slate-500">Reading rooms can be clicked to view seat availability.</p>
      </div>
    </div>
  );
};

export default MapLegend;
