import type { OccupancySummary } from '../types/campus';
import OccupancyBar from './OccupancyBar';
import { seatStatusStyles } from './statusStyles';

interface AvailabilitySummaryProps {
  summary: OccupancySummary;
  // Also list recently used and offline seats (room detail). Elsewhere they
  // are only visible as bar segments.
  showAllStates?: boolean;
}

// One-line seat availability: free count first, the rest as muted context,
// with the segmented bar underneath. The dots double as the colour legend.
const AvailabilitySummary = ({ summary, showAllStates = false }: AvailabilitySummaryProps) => {
  const details = [
    { label: 'occupied', value: summary.occupied, dot: seatStatusStyles.occupied.dot },
    ...(showAllStates
      ? [
          { label: 'recently used', value: summary.recentlyUsed, dot: seatStatusStyles['recently-used'].dot },
          { label: 'offline', value: summary.offline, dot: seatStatusStyles.offline.dot },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate-400">
        <span className="inline-flex items-baseline gap-1.5">
          <span aria-hidden="true" className={`h-2 w-2 self-center rounded-full ${seatStatusStyles.available.dot}`} />
          <span className="text-2xl font-semibold text-emerald-200">{summary.available}</span>
          <span>seats free</span>
        </span>
        {details.map(({ label, value, dot }) => (
          <span key={label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
            <span className="font-medium text-slate-200">{value}</span> {label}
          </span>
        ))}
        <span className="whitespace-nowrap">
          {summary.total} total <span aria-hidden="true" className="mx-1 text-slate-600">·</span>
          {summary.occupancyPercent}% occupied
        </span>
      </p>
      <OccupancyBar summary={summary} />
    </div>
  );
};

export default AvailabilitySummary;
