interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
}

const StatCard = ({ label, value, detail }: StatCardProps) => (
  <div className="rounded-lg border border-white/10 bg-surface-850 p-4">
    <p className="text-sm text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
  </div>
);

export default StatCard;
