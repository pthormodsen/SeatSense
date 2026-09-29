import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import RoomMap from '../components/RoomMap';
import SeatDetails from '../components/SeatDetails';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import {
  createDemoRoomFromMazeMap,
  mazeMapRoomFromSearchParams,
  summarizeReadingSeats,
} from '../demo/createDemoRoomFromMazeMap';
import { seatService } from '../services/seatService';
import type { ReadingRoom, Room as RoomType, Seat } from '../types/campus';
import { getGroupRoomStatus } from '../utils/roomStatus';
import { getSeatStatus } from '../utils/seatStatus';

const formatRelativeTime = (isoTime: string, nowMs: number) => {
  const diffSeconds = Math.max(0, Math.floor((nowMs - new Date(isoTime).getTime()) / 1000));

  if (diffSeconds < 2) {
    return 'just now';
  }

  if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
};

const createRoomFromRoute = (roomId: string | undefined, searchParams: URLSearchParams): RoomType | undefined => {
  if (!roomId) {
    return undefined;
  }

  const staticRoom = seatService.getRoom(roomId);

  if (staticRoom) {
    return staticRoom;
  }

  if (!searchParams.get('title')) {
    return undefined;
  }

  return createDemoRoomFromMazeMap(mazeMapRoomFromSearchParams(roomId, searchParams));
};

const getRoomStatusNowMs = (room: RoomType | undefined) =>
  room ? Date.parse(room.updatedAt) : Date.now();

const rotateSeatState = (seat: Seat, index: number, updatedAt: Date): Seat => {
  if (!seat.sensorOnline || index % 5 !== 0) {
    return seat;
  }

  const currentStatus = getSeatStatus(seat, updatedAt.getTime());

  if (currentStatus === 'occupied') {
    return {
      ...seat,
      presenceDetected: false,
      lastPresenceAt: updatedAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }

  if (currentStatus === 'recently-used') {
    return {
      ...seat,
      presenceDetected: false,
      lastPresenceAt: new Date(updatedAt.getTime() - 45 * 60 * 1000).toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }

  return {
    ...seat,
    presenceDetected: true,
    lastPresenceAt: updatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
};

const Room = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const routeRoom = useMemo(() => createRoomFromRoute(roomId, searchParams), [roomId, searchParams]);
  const [room, setRoom] = useState<RoomType | undefined>(routeRoom);
  const [seats, setSeats] = useState<Seat[]>(routeRoom?.type === 'reading-room' ? routeRoom.seats : []);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(routeRoom?.type === 'reading-room' ? routeRoom.seats[0]?.id ?? null : null);
  const [roomUpdatedAt, setRoomUpdatedAt] = useState(routeRoom?.updatedAt ?? new Date().toISOString());
  const [nowMs, setNowMs] = useState(getRoomStatusNowMs(routeRoom));

  useEffect(() => {
    setRoom(routeRoom);
    setSeats(routeRoom?.type === 'reading-room' ? routeRoom.seats : []);
    setSelectedSeatId(routeRoom?.type === 'reading-room' ? routeRoom.seats[0]?.id ?? null : null);
    setRoomUpdatedAt(routeRoom?.updatedAt ?? new Date().toISOString());
    setNowMs(getRoomStatusNowMs(routeRoom));
  }, [routeRoom]);

  if (!room) {
    return <Navigate to="/" replace />;
  }

  const building = seatService.getBuilding(room.buildingId);
  const selectedSeat = seats.find((seat) => seat.id === selectedSeatId) ?? null;
  const readingSummary = room.type === 'reading-room' ? summarizeReadingSeats(seats, nowMs) : null;
  const groupStatus = room.type === 'group-room' ? getGroupRoomStatus(room) : null;
  const statusCounts = readingSummary
    ? [
        { status: 'available' as const, count: readingSummary.available },
        { status: 'occupied' as const, count: readingSummary.occupied },
        { status: 'recently-used' as const, count: readingSummary.recentlyUsed },
        { status: 'offline' as const, count: readingSummary.offline },
      ]
    : [];

  const simulateOccupancy = () => {
    const updatedAt = new Date();

    if (room.type === 'reading-room') {
      const updatedSeats = seats.map((seat, index) => rotateSeatState(seat, index, updatedAt));
      setSeats(updatedSeats);
      setRoom((currentRoom) =>
        currentRoom?.type === 'reading-room'
          ? { ...currentRoom, seats: updatedSeats, updatedAt: updatedAt.toISOString() }
          : currentRoom,
      );
    } else {
      setRoom((currentRoom) =>
        currentRoom?.type === 'group-room'
          ? {
              ...currentRoom,
              booked: !currentRoom.booked || currentRoom.presenceDetected,
              presenceDetected: currentRoom.booked && !currentRoom.presenceDetected,
              updatedAt: updatedAt.toISOString(),
            }
          : currentRoom,
      );
    }

    setRoomUpdatedAt(updatedAt.toISOString());
    setNowMs(updatedAt.getTime());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link to={`/building/${room.buildingId}/floor/${room.floorId}`} className="text-sm text-cyan-200 hover:text-cyan-100">
            Back to floor
          </Link>
          <p className="mt-4 text-sm uppercase tracking-wide text-cyan-200">{building?.name}</p>
          <h1 className="mt-2 text-4xl font-semibold text-white">Room {room.name}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span>{room.type === 'reading-room' ? 'Reading room' : 'Group room'}</span>
            <span>Updated {formatRelativeTime(roomUpdatedAt, nowMs)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={simulateOccupancy}
          className="w-fit rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
        >
          Simulate occupancy
        </button>
      </div>

      {room.type === 'group-room' && groupStatus ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Capacity" value={room.capacity} />
            <StatCard label="Booking" value={room.booking ? `${room.booking.start}-${room.booking.end}` : 'Not booked'} />
            <StatCard label="Presence" value={room.presenceDetected ? 'Detected' : 'Not detected'} />
            <div className="rounded-lg border border-white/10 bg-surface-850 p-4">
              <p className="text-sm text-slate-400">Status</p>
              <div className="mt-3">
                <StatusBadge status={groupStatus} kind="group-room" />
              </div>
            </div>
          </section>
          <section className="rounded-lg border border-white/10 bg-surface-850 p-6">
            <h2 className="text-xl font-semibold text-white">Room-level availability</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-400">
              This group room demo uses booking state and presence detection only. Individual study seats are not shown for group rooms.
            </p>
          </section>
        </>
      ) : null}

      {room.type === 'reading-room' && readingSummary ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Available" value={readingSummary.available} />
            <StatCard label="Occupied" value={readingSummary.occupied} />
            <StatCard label="Recently used" value={readingSummary.recentlyUsed} />
            <StatCard label="Offline" value={readingSummary.offline} />
            <StatCard label="Total seats" value={readingSummary.total} />
          </section>

          <div className="flex flex-wrap gap-2">
            {statusCounts.map((item) => (
              <span key={item.status} className="inline-flex items-center gap-2 text-sm text-slate-300">
                <StatusBadge status={item.status} />
                <span>{item.count}</span>
              </span>
            ))}
          </div>
          <p className="text-sm text-slate-400">
            Recently used means the seat is currently empty, but presence was detected recently.
          </p>

          <section className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <RoomMap room={{ ...(room as ReadingRoom), seats }} seats={seats} selectedSeat={selectedSeat} nowMs={nowMs} onSelectSeat={(seat) => setSelectedSeatId(seat.id)} />
            <SeatDetails seat={selectedSeat} nowMs={nowMs} />
          </section>
        </>
      ) : null}
    </div>
  );
};

export default Room;
