interface OccupancyBarProps {
  occupied: number;
  total: number;
}

const OccupancyBar = ({ occupied, total }: OccupancyBarProps) => {
  const percent = total > 0 ? Math.round((occupied / total) * 100) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span>Occupancy</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

export default OccupancyBar;
