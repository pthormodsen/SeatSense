import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import MazeMapFloorMap, { type MazeMapFloorLevelChange, type MazeMapRoomSelection } from '../components/MazeMapFloorMap';
import OccupancyBar from '../components/OccupancyBar';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { createDemoRoomFromMazeMap, mazeMapRoomToSearchParams, summarizeReadingSeats } from '../demo/createDemoRoomFromMazeMap';
import { getMazeMapZLevelForFloor } from '../data/mazeMapPlacements';
import { seatService } from '../services/seatService';
import type { OccupancySummary, ReadingRoom, Room } from '../types/campus';
import { getGroupRoomStatus } from '../utils/roomStatus';

const formatRelativeTime = (isoTime: string) => {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(isoTime).getTime()) / 1000));

  if (diffSeconds < 2) {
    return 'just now';
  }

  if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
};

const mazeMapRoomLabel = (selection: MazeMapRoomSelection) =>
  selection.title;

const isReadingHall = (room: Room): room is ReadingRoom =>
  room.type === 'reading-room';

interface ReadingHallCard {
  room: ReadingRoom;
  summary: OccupancySummary;
  availableSeats: number | null;
}

const getReadingHallCards = (rooms: Room[]): ReadingHallCard[] =>
  rooms
    .filter(isReadingHall)
    .map((room) => {
      const summary = summarizeReadingSeats(room.seats);

      return {
        room,
        summary,
        availableSeats: summary.available,
      };
    })
    .sort((a, b) => {
      if (a.availableSeats === null && b.availableSeats === null) {
        return a.room.name.localeCompare(b.room.name);
      }

      if (a.availableSeats === null) {
        return 1;
      }

      if (b.availableSeats === null) {
        return -1;
      }

      return b.availableSeats - a.availableSeats || a.room.name.localeCompare(b.room.name);
    });

const getBestFloorFromMazeMapCodes = (
  floors: NonNullable<ReturnType<typeof seatService.getBuilding>>['floors'],
  roomCodes: string[],
) => {
  if (roomCodes.length === 0) {
    return undefined;
  }

  const visibleCodes = new Set(roomCodes.map((code) => code.toUpperCase()));
  const matches = floors
    .map((candidate) => ({
      floor: candidate,
      count: candidate.rooms.filter((room) => visibleCodes.has(room.name.toUpperCase())).length,
    }))
    .filter((match) => match.count > 0)
    .sort((a, b) => b.count - a.count);

  return matches[0]?.floor;
};

const Floor = () => {
  const { buildingId, floorId } = useParams();
  const navigate = useNavigate();
  const building = buildingId ? seatService.getBuilding(buildingId) : undefined;
  const floor = buildingId && floorId ? seatService.getFloor(buildingId, floorId) : undefined;
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [mazeMapSelection, setMazeMapSelection] = useState<MazeMapRoomSelection | null>(null);
  const [selectedDemoRoom, setSelectedDemoRoom] = useState<Room | null>(null);

  useEffect(() => {
    setSelectedRoomId(null);
    setMazeMapSelection(null);
    setSelectedDemoRoom(null);
  }, [floorId]);

  const selectRoomFromList = useCallback((roomId: string) => {
    if (!floor) {
      return;
    }

    const room = floor.rooms.find((candidate) => candidate.id === roomId) ?? null;

    setSelectedRoomId(roomId);
    setSelectedDemoRoom(room);
    setMazeMapSelection(
      room
        ? {
            identifier: room.name,
            title: room.name,
            floor: getMazeMapZLevelForFloor(floor),
            area: room.mazeMapArea,
          }
        : null,
    );
  }, [floor]);

  const selectMazeMapRoom = useCallback((selection: MazeMapRoomSelection) => {
    if (!floor) {
      return;
    }

    const room = createDemoRoomFromMazeMap(selection);
    setMazeMapSelection(selection);
    setSelectedRoomId(room.id);
    setSelectedDemoRoom(room);
  }, [floor]);

  const clearMazeMapRoom = useCallback(() => {
    setMazeMapSelection(null);
    setSelectedRoomId(null);
    setSelectedDemoRoom(null);
  }, []);

  const selectMazeMapFloorLevel = useCallback((change: MazeMapFloorLevelChange) => {
    if (!building || !buildingId) {
      return;
    }

    const targetFloor =
      building.floors.find((candidate) =>
        getMazeMapZLevelForFloor(candidate) === change.zLevel,
      )
      ?? getBestFloorFromMazeMapCodes(building.floors, change.roomCodes);

    if (!targetFloor || targetFloor.id === floorId) {
      return;
    }

    setSelectedRoomId(null);
    setMazeMapSelection(null);
    setSelectedDemoRoom(null);
    navigate(`/building/${buildingId}/floor/${targetFloor.id}`);
  }, [building, buildingId, floorId, navigate]);

  if (!building || !floor) {
    return <Navigate to="/" replace />;
  }

  const summary = seatService.summarizeRooms(floor.rooms);
  const readingHallCards = getReadingHallCards(floor.rooms);
  const selectedMazeMapLabel = mazeMapSelection ? mazeMapRoomLabel(mazeMapSelection) : null;
  const selectedReadingSummary = selectedDemoRoom?.type === 'reading-room'
    ? summarizeReadingSeats(selectedDemoRoom.seats)
    : null;
  const selectedGroupStatus = selectedDemoRoom?.type === 'group-room'
    ? getGroupRoomStatus(selectedDemoRoom)
    : null;
  const roomDetailSearch = mazeMapSelection ? mazeMapRoomToSearchParams(mazeMapSelection).toString() : '';

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/building/${building.id}`} className="text-sm text-cyan-200 hover:text-cyan-100">
          Back to {building.name}
        </Link>
        <p className="mt-4 text-sm uppercase tracking-wide text-cyan-200">{building.name}</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">{floor.name}</h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available" value={summary.available} />
        <StatCard label="Occupied" value={summary.occupied} />
        <StatCard label="Rooms" value={floor.rooms.length} />
        <StatCard label="Occupancy" value={`${summary.occupancyPercent}%`} />
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Choose a room</h2>
            <p className="mt-1 text-sm text-slate-400">
              Click a room on MazeMap or select one from the list to inspect live seat data.
            </p>
          </div>
          <nav aria-label="Floor selector" className="flex flex-wrap gap-2">
            {building.floors.map((buildingFloor) => {
              const isCurrentFloor = buildingFloor.id === floor.id;

              return (
                <Link
                  key={buildingFloor.id}
                  to={`/building/${building.id}/floor/${buildingFloor.id}`}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                    isCurrentFloor
                      ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100'
                      : 'border-white/10 bg-surface-850 text-slate-300 hover:border-cyan-300/30 hover:text-white'
                  }`}
                  aria-current={isCurrentFloor ? 'page' : undefined}
                >
                  {buildingFloor.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <MazeMapFloorMap
            floor={floor}
            selectedRoomId={selectedRoomId}
            onSelectRoom={selectMazeMapRoom}
            onClearRoom={clearMazeMapRoom}
            onFloorLevelChange={selectMazeMapFloorLevel}
          />
          <aside className="rounded-lg border border-white/10 bg-surface-850 p-5">
            {!selectedDemoRoom ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-cyan-200">No room selected</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">Click a room</h3>
                <p className="mt-3 text-sm text-slate-400">Click a room on the map to view availability.</p>
              </div>
            ) : selectedDemoRoom.type === 'group-room' && selectedGroupStatus ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-cyan-200">Selected room</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">{selectedMazeMapLabel ?? selectedDemoRoom.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">Group room</p>
                  </div>
                  <StatusBadge status={selectedGroupStatus} kind="group-room" />
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Capacity</dt>
                    <dd className="mt-1 font-semibold text-white">{selectedDemoRoom.capacity}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Booking</dt>
                    <dd className="mt-1 font-semibold text-white">
                      {selectedDemoRoom.booking ? `${selectedDemoRoom.booking.start}-${selectedDemoRoom.booking.end}` : 'Not booked'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Presence</dt>
                    <dd className="mt-1 font-semibold text-white">
                      {selectedDemoRoom.presenceDetected ? 'Presence detected' : 'No presence detected'}
                    </dd>
                  </div>
                </dl>
                <p className="mt-5 text-sm text-slate-400">Group rooms show room-level availability only.</p>
              </>
            ) : selectedDemoRoom.type === 'reading-room' && selectedReadingSummary ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-cyan-200">Selected room</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">{selectedMazeMapLabel ?? selectedDemoRoom.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">Reading room</p>
                  </div>
                  <span className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-sm font-medium text-emerald-100">
                    {selectedReadingSummary.available} available
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  Generated demo data for {selectedDemoRoom.name}. Updated {formatRelativeTime(selectedDemoRoom.updatedAt)}.
                </p>
                <div className="mt-5">
                  <OccupancyBar occupied={selectedReadingSummary.occupied} total={selectedReadingSummary.total} />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Available</dt>
                    <dd className="mt-1 font-semibold text-emerald-200">{selectedReadingSummary.available}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Occupied</dt>
                    <dd className="mt-1 font-semibold text-rose-200">{selectedReadingSummary.occupied}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Recently used</dt>
                    <dd className="mt-1 font-semibold text-amber-100">{selectedReadingSummary.recentlyUsed}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Offline</dt>
                    <dd className="mt-1 font-semibold text-slate-300">{selectedReadingSummary.offline}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-sm font-medium text-slate-300">{selectedReadingSummary.total} total seats</p>
                <Link
                  to={`/room/${selectedDemoRoom.id}?${roomDetailSearch}`}
                  className="mt-5 inline-flex w-full justify-center rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-surface-950 transition hover:bg-cyan-200"
                >
                  View {selectedMazeMapLabel ?? selectedDemoRoom.name} seats
                </Link>
              </>
            ) : null}
          </aside>
        </div>
      </section>

      {readingHallCards.length > 0 ? (
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Reading halls</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {readingHallCards.map(({ room, summary: roomSummary }) => {
            const isSelected = room.id === selectedRoomId;

            return (
              <button
                key={room.id}
                type="button"
                onClick={() => selectRoomFromList(room.id)}
                className={`rounded-lg border p-4 text-left transition ${
                  isSelected
                    ? 'border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]'
                    : 'border-white/10 bg-surface-850 hover:border-cyan-300/40 hover:bg-surface-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-cyan-200">{floor.name}</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">{room.name}</h3>
                  </div>
                  <span className="rounded-md bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
                    {roomSummary.available} free
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  {`${roomSummary.total} seats, ${roomSummary.occupied} occupied`}
                </p>
              </button>
            );
          })}
        </div>
      </section>
      ) : null}
    </div>
  );
};

export default Floor;
