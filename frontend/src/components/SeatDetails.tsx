import type { Seat } from '../types/campus';
import { getSeatStatus } from '../utils/seatStatus';
import StatusBadge from './StatusBadge';

interface SeatDetailsProps {
  seat: Seat | null;
  nowMs: number;
}

const SeatDetails = ({ seat, nowMs }: SeatDetailsProps) => {
  if (!seat) {
    return (
      <aside className="rounded-lg border border-white/10 bg-surface-850 p-5 text-sm text-slate-400">
        Select a seat in the room map to inspect its sensor state.
      </aside>
    );
  }

  const status = getSeatStatus(seat, nowMs);
  const formatTime = (isoTime: string | null) =>
    isoTime
      ? new Date(isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'No recent presence';

  return (
    <aside key={seat.id} className="animate-fade-in rounded-lg border border-white/10 bg-surface-850 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">Seat ID</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{seat.id}</h2>
        </div>
        <StatusBadge status={status} />
      </div>
      <dl className="mt-6 space-y-4 text-sm">
        <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
          <dt className="text-slate-400">Sensor</dt>
          <dd className={seat.sensorOnline ? 'text-emerald-200' : 'text-slate-300'}>
            {seat.sensorOnline ? 'Online' : 'Offline'}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
          <dt className="text-slate-400">Presence</dt>
          <dd className={seat.presenceDetected ? 'text-rose-200' : 'text-slate-300'}>
            {seat.presenceDetected ? 'Detected' : 'Not detected'}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
          <dt className="text-slate-400">ESP32 node</dt>
          <dd className="text-white">{seat.nodeId}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
          <dt className="text-slate-400">Last presence</dt>
          <dd className="text-white">{formatTime(seat.lastPresenceAt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Updated</dt>
          <dd className="text-white">{formatTime(seat.updatedAt)}</dd>
        </div>
      </dl>
    </aside>
  );
};

export default SeatDetails;
