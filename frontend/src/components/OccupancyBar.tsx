import type { OccupancySummary } from '../types/campus';

interface OccupancyBarProps {
  // Split into free / occupied / recently used / offline segments.
  summary: OccupancySummary;
  size?: 'sm' | 'md';
}

const segmentOrder = [
  { key: 'available', label: 'free', className: 'bg-emerald-400' },
  { key: 'occupied', label: 'occupied', className: 'bg-rose-400' },
  { key: 'recentlyUsed', label: 'recently used', className: 'bg-amber-300' },
  { key: 'offline', label: 'offline', className: 'bg-slate-500' },
] as const;

export const describeSeatSummary = (summary: OccupancySummary): string =>
  `${summary.available} free, ${summary.occupied} occupied, ${summary.recentlyUsed} recently used, ${summary.offline} offline of ${summary.total} seats`;

const OccupancyBar = ({ summary, size = 'md' }: OccupancyBarProps) => {
  const height = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div
      role="img"
      aria-label={describeSeatSummary(summary)}
      className={`flex ${height} gap-px overflow-hidden rounded-full bg-slate-800`}
    >
      {summary.total > 0
        ? segmentOrder.map(({ key, className }) => {
          const value = summary[key];

          return value > 0 ? (
            <div
              key={key}
              className={`h-full ${className}`}
              style={{ width: `${(value / summary.total) * 100}%` }}
            />
          ) : null;
        })
        : null}
    </div>
  );
};

export default OccupancyBar;
