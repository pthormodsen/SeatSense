import type { ReactNode } from 'react';
import type { OccupancySummary } from '../types/campus';
import OccupancyBar from './OccupancyBar';

interface FloorSummaryProps {
  // Seat totals across the floor's reading rooms.
  summary: OccupancySummary;
  groupRoomsAvailable: number;
  groupRoomsTotal: number;
  // Shown at the end of the row, e.g. the demo-data indicator.
  trailing?: ReactNode;
}

// Compact one-line floor overview. The segmented bar's aria-label carries the
// full free / occupied / recently used / offline breakdown.
const FloorSummary = ({ summary, groupRoomsAvailable, groupRoomsTotal, trailing }: FloorSummaryProps) => (
  <section
    aria-label="Floor occupancy"
    className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-400"
  >
    {summary.total > 0 ? (
      <div className="flex items-center gap-3">
        <p>
          <span className="text-lg font-semibold text-emerald-200">{summary.available}</span>
          <span className="ml-1.5">of {summary.total} seats free</span>
        </p>
        <div className="w-28 sm:w-40">
          <OccupancyBar summary={summary} size="sm" />
        </div>
      </div>
    ) : (
      <p>No reading rooms with tracked seats on this floor.</p>
    )}
    {groupRoomsTotal > 0 ? (
      <>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <p>
          <span className="font-medium text-slate-200">{groupRoomsAvailable}</span> of {groupRoomsTotal} group rooms available
        </p>
      </>
    ) : null}
    {trailing ? <div className="sm:ml-auto">{trailing}</div> : null}
  </section>
);

export default FloorSummary;
