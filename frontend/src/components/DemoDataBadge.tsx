import { formatDemoSnapshotTime } from '../utils/demoTime';

interface DemoDataBadgeProps {
  className?: string;
}

// Marks values as simulated so they are never mistaken for live sensor data.
const DemoDataBadge = ({ className = '' }: DemoDataBadgeProps) => (
  <span
    className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-400 ${className}`}
  >
    {formatDemoSnapshotTime()}
  </span>
);

export default DemoDataBadge;
