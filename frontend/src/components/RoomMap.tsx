import type {
  ReadingRoom,
  RoomFeature,
  Seat as SeatType,
} from '../types/campus';

import Seat from './Seat';

interface RoomMapProps {
  room: ReadingRoom;
  seats: SeatType[];
  selectedSeat: SeatType | null;
  nowMs: number;
  onSelectSeat: (seat: SeatType) => void;
}

const featureClass = (feature: RoomFeature) => {
  if (feature.type === 'door') {
    return 'fill-cyan-400/20 stroke-cyan-200/60';
  }

  if (feature.type === 'whiteboard') {
    return 'fill-slate-200/10 stroke-slate-300/50';
  }

  if (feature.type === 'quiet-zone') {
    return 'fill-emerald-400/10 stroke-emerald-200/40';
  }

  return 'fill-sky-400/10 stroke-sky-200/40';
};

const RoomMap = ({
  room,
  seats,
  selectedSeat,
  nowMs,
  onSelectSeat,
}: RoomMapProps) => (
  <div className="overflow-x-auto rounded-lg border border-white/10 bg-surface-900 p-4">
    {/*
      Important:
      The wrapper must use the exact same dimensions as the SVG.

      Previously this used minWidth, which meant the SVG could stretch
      while the absolutely positioned seats remained in pixel coordinates.
      That caused desks and seats to become misaligned.
    */}
    <div
      className="relative flex-none"
      style={{
        width: room.layout.width,
        height: room.layout.height,
      }}
    >
      <svg
        viewBox={`0 0 ${room.layout.width} ${room.layout.height}`}
        width={room.layout.width}
        height={room.layout.height}
        className="absolute inset-0"
      >
        {/* Room boundary */}
        <rect
          x={room.layout.boundary.x}
          y={room.layout.boundary.y}
          width={room.layout.boundary.width}
          height={room.layout.boundary.height}
          rx="8"
          className="fill-surface-850 stroke-slate-600"
          strokeWidth="2"
        />

        {/* Architectural features */}
        {room.layout.features.map((feature) => (
          <g key={feature.id}>
            <rect
              x={feature.x}
              y={feature.y}
              width={feature.width}
              height={feature.height}
              rx="4"
              className={featureClass(feature)}
              strokeWidth="2"
            />

            <text
              x={feature.x + feature.width / 2}
              y={feature.y + feature.height / 2 + 4}
              textAnchor="middle"
              className="fill-slate-300 text-xs"
            >
              {feature.label}
            </text>
          </g>
        ))}

        {/* Desks */}
        {room.layout.desks.map((desk) => (
          <g key={desk.id}>
            <rect
              x={desk.x}
              y={desk.y}
              width={desk.width}
              height={desk.height}
              rx="8"
              className="fill-slate-700/50 stroke-slate-500"
              strokeWidth="2"
            />

            <text
              x={desk.x + desk.width / 2}
              y={desk.y + desk.height / 2 + 4}
              textAnchor="middle"
              className="fill-slate-300 text-[11px]"
            >
              {desk.label}
            </text>
          </g>
        ))}
      </svg>

      {/*
        Seats are rendered above the SVG so they remain clickable.

        They now use exactly the same coordinate system as the SVG.
      */}
      <div
        className="absolute inset-0"
        style={{
          width: room.layout.width,
          height: room.layout.height,
        }}
      >
        {seats.map((seat) => (
          <div
            key={seat.id}
            className="absolute left-0 top-0"
          >
            <Seat
              seat={seat}
              selected={selectedSeat?.id === seat.id}
              nowMs={nowMs}
              onSelect={onSelectSeat}
            />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default RoomMap;
