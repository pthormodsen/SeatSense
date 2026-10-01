import type { OccupancySummary } from '../types/campus';

interface OccupancyBarProps {
  occupied?: number;
  total?: number;
  // When a full summary is given the bar is split into free / occupied /
  // recently used / offline segments instead of a single occupancy fill.
  summary?: OccupancySummary;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

const segmentOrder = [
  { key: 'available', label: 'free', className: 'bg-emerald-400' },
  { key: 'occupied', label: 'occupied', className: 'bg-rose-400' },
  { key: 'recentlyUsed', label: 'recently used', className: 'bg-amber-300' },
  { key: 'offline', label: 'offline', className: 'bg-slate-500' },
] as const;

export const describeSeatSummary = (summary: OccupancySummary): string =>
  `${summary.available} free, ${summary.occupied} occupied, ${summary.recentlyUsed} recently used, ${summary.offline} offline of ${summary.total} seats`;

const OccupancyBar = ({ occupied = 0, total = 0, summary, size = 'md', showLabel }: OccupancyBarProps) => {
  const height = size === 'sm' ? 'h-1.5' : 'h-2';

  if (summary) {
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
  }

  const percent = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const labelVisible = showLabel ?? true;

  return (
    <div>
      {labelVisible ? (
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>Occupancy</span>
          <span>{percent}%</span>
        </div>
      ) : null}
      <div
        role="img"
        aria-label={`${occupied} of ${total} seats occupied (${percent}%)`}
        className={`${height} overflow-hidden rounded-full bg-slate-800`}
      >
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

export default OccupancyBar;
