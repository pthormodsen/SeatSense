import type { LiveSensorStatus } from '../services/liveSensorService';
import { liveSensorStatusStyles } from './statusStyles';

// Schematic top-down view of one reading-room desk, showing how the live seat
// would look to a student. Only the highlighted seat is real; its neighbours
// are decoration and carry no data.

const seatFill: Record<LiveSensorStatus, string> = {
  available: 'fill-emerald-400/90 stroke-emerald-100',
  occupied: 'fill-rose-400/90 stroke-rose-100',
  unknown: 'fill-amber-300/90 stroke-amber-100',
  offline: 'fill-slate-500/90 stroke-slate-300',
};

const radarFill: Record<LiveSensorStatus, string> = {
  available: 'fill-emerald-300/10 stroke-emerald-300/40',
  occupied: 'fill-rose-300/15 stroke-rose-300/50',
  unknown: 'fill-amber-300/10 stroke-amber-300/40',
  offline: 'fill-slate-400/5 stroke-slate-400/30',
};

const DESK = { x: 40, y: 104, width: 400, height: 52 };
const SEAT_XS = [107, 240, 373];
const LIVE_SEAT_X = SEAT_XS[1];
const CHAIR_W = 50;
const CHAIR_H = 40;
const BOTTOM_CHAIR_Y = DESK.y + DESK.height + 14;
const TOP_CHAIR_Y = DESK.y - 14 - CHAIR_H;
// Drawn radius of the 1 m detection limit, schematic only.
const RADAR_R = 76;
// Half the opening angle of the drawn field. Smaller = narrower, more straight ahead.
const RADAR_HALF_ANGLE_DEG = 60;
const RADAR_HALF_ANGLE = (RADAR_HALF_ANGLE_DEG * Math.PI) / 180;

interface ChairProps {
  x: number;
  y: number;
  facingDown: boolean;
  className: string;
}

const Chair = ({ x, y, facingDown, className }: ChairProps) => {
  const backY = facingDown ? y + CHAIR_H - 8 : y;
  return (
    <g>
      <rect x={x - CHAIR_W / 2} y={y} width={CHAIR_W} height={CHAIR_H} rx="10" className={className} strokeWidth="2" />
      <rect x={x - CHAIR_W / 2 + 4} y={backY} width={CHAIR_W - 8} height="8" rx="4" className="fill-black/20" />
    </g>
  );
};

// Head and shoulders seen from above, facing the desk (upwards).
const Person = ({ x, y }: { x: number; y: number }) => (
  <g className="fill-surface-950/80">
    <ellipse cx={x} cy={y + 8} rx="22" ry="11" />
    <circle cx={x} cy={y - 4} r="10" className="fill-slate-100" />
  </g>
);

interface LiveSeatPreviewProps {
  status: LiveSensorStatus;
  sensorId: string;
}

const LiveSeatPreview = ({ status, sensorId }: LiveSeatPreviewProps) => {
  const style = liveSensorStatusStyles[status];
  const sensorX = LIVE_SEAT_X;
  const sensorY = DESK.y + DESK.height - 6;

  return (
    <figure className="m-0">
      <div className="rounded-lg border border-white/10 bg-surface-900 p-3">
        <svg
          viewBox="0 0 480 240"
          className="h-auto w-full"
          role="img"
          aria-label={`Reading-room desk with six seats. The live seat (${sensorId}) is ${style.label.toLowerCase()}.`}
        >
          {/* Floor */}
          <rect x="8" y="8" width="464" height="224" rx="10" className="fill-surface-850 stroke-slate-700" strokeWidth="2" />

          {/* Radar field under the desk, pointing at the live chair */}
          <path
            d={`M ${sensorX} ${sensorY} L ${sensorX - RADAR_R * Math.sin(RADAR_HALF_ANGLE)} ${sensorY + RADAR_R * Math.cos(RADAR_HALF_ANGLE)} A ${RADAR_R} ${RADAR_R} 0 0 0 ${sensorX + RADAR_R * Math.sin(RADAR_HALF_ANGLE)} ${sensorY + RADAR_R * Math.cos(RADAR_HALF_ANGLE)} Z`}
            className={`${radarFill[status]} transition-colors duration-500`}
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Desk */}
          <rect x={DESK.x} y={DESK.y} width={DESK.width} height={DESK.height} rx="6" className="fill-slate-700/60 stroke-slate-500" strokeWidth="2" />
          {SEAT_XS.slice(0, -1).map((x, index) => {
            const divider = (x + SEAT_XS[index + 1]) / 2;
            return <line key={x} x1={divider} y1={DESK.y + 8} x2={divider} y2={DESK.y + DESK.height - 8} className="stroke-slate-500/60" strokeWidth="2" />;
          })}

          {/* Neighbour seats: decoration only */}
          {SEAT_XS.map((x) => (
            <Chair key={`top-${x}`} x={x} y={TOP_CHAIR_Y} facingDown={false} className="fill-slate-600/40 stroke-slate-500/60" />
          ))}
          {SEAT_XS.filter((x) => x !== LIVE_SEAT_X).map((x) => (
            <Chair key={`bottom-${x}`} x={x} y={BOTTOM_CHAIR_Y} facingDown className="fill-slate-600/40 stroke-slate-500/60" />
          ))}

          {/* Live seat */}
          <g>
            {status !== 'offline' ? (
              <rect
                x={LIVE_SEAT_X - CHAIR_W / 2 - 6}
                y={BOTTOM_CHAIR_Y - 6}
                width={CHAIR_W + 12}
                height={CHAIR_H + 12}
                rx="14"
                className={`${seatFill[status]} animate-pulse opacity-30`}
                strokeWidth="0"
              />
            ) : null}
            <Chair x={LIVE_SEAT_X} y={BOTTOM_CHAIR_Y} facingDown className={`${seatFill[status]} transition-colors duration-500`} />
            {status === 'occupied' ? <Person x={LIVE_SEAT_X} y={BOTTOM_CHAIR_Y + CHAIR_H / 2} /> : null}
          </g>

          {/* Sensor node under the desk edge */}
          <rect x={sensorX - 9} y={sensorY - 5} width="18" height="10" rx="2" className="fill-cyan-300 stroke-cyan-100" strokeWidth="1" />
          <text x={sensorX} y={DESK.y + 22} textAnchor="middle" className="fill-slate-300 text-[11px]">
            LD2410C
          </text>
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-300">
          Seat <span className="font-medium text-white">{sensorId}</span>
        </span>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${style.badge}`}>
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </figcaption>
      <p className="mt-2 text-xs text-slate-500">
        Schematic, not to scale. Only the highlighted seat is live; the grey seats are decoration. The dashed area marks the 1 m detection limit.
      </p>
    </figure>
  );
};

export default LiveSeatPreview;
