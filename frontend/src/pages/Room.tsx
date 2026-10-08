import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import AvailabilitySummary from '../components/AvailabilitySummary';
import GroupRoomOverview from '../components/GroupRoomOverview';
import NotFound from '../components/NotFound';
import PageHeader from '../components/PageHeader';
import PopularTimes from '../components/PopularTimes';
import RoomMap from '../components/RoomMap';
import SeatDetails from '../components/SeatDetails';
import { useToast } from '../components/Toast';
import { cardClass, secondaryButtonClass } from '../components/uiStyles';
import { DEMO_REFERENCE_NOW_MS, summarizeReadingSeats } from '../demo/createDemoRoomFromMazeMap';
import { getDemoWeekdayAndHour } from '../demo/popularTimes';
import { seatService } from '../services/seatService';
import type { ReadingRoom, Room as RoomType, Seat } from '../types/campus';
import { formatDemoSnapshotDateTime } from '../utils/demoTime';
import { getSeatStatus } from '../utils/seatStatus';

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

  return seatService.resolveRoomFromSearchParams(roomId, searchParams);
};

// Status is derived against the fixed demo clock (same as the Floor side panel),
// so the page renders identically on every load.
const getRoomStatusNowMs = () => DEMO_REFERENCE_NOW_MS;

// Each simulation step advances the demo clock by a fixed amount instead of
// reading the real clock, keeping the simulation deterministic.
const SIMULATION_STEP_MS = 60 * 1000;

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
  const [nowMs, setNowMs] = useState(getRoomStatusNowMs());
  const { showToast } = useToast();

  // Popular times only exist for reading rooms; recomputed per room id only.
  const readingRoomId = room?.type === 'reading-room' ? room.id : null;
  const popularTimes = useMemo(
    () =>
      readingRoomId
        ? { days: seatService.getPopularTimes(readingRoomId), typicalStayText: seatService.getTypicalStayText(readingRoomId) }
        : null,
    [readingRoomId],
  );

  useEffect(() => {
    setRoom(routeRoom);
    setSeats(routeRoom?.type === 'reading-room' ? routeRoom.seats : []);
    setSelectedSeatId(routeRoom?.type === 'reading-room' ? routeRoom.seats[0]?.id ?? null : null);
    setNowMs(getRoomStatusNowMs());
  }, [routeRoom]);

  if (!room) {
    return <NotFound title="Room not found" message="This room link doesn’t match a room SeatSense knows about." />;
  }

  const building = seatService.getBuilding(room.buildingId);
  const floor = seatService.getFloor(room.buildingId, room.floorId);
  const selectedSeat = seats.find((seat) => seat.id === selectedSeatId) ?? null;
  const readingSummary = room.type === 'reading-room' ? summarizeReadingSeats(seats, nowMs) : null;
  const demoNow = getDemoWeekdayAndHour(nowMs);
  const breadcrumbs = [
    ...(building ? [{ label: building.campusName, to: '/' }, { label: building.name, to: `/building/${building.id}` }] : []),
    ...(floor ? [{ label: floor.name, to: `/building/${room.buildingId}/floor/${room.floorId}` }] : []),
    { label: room.name },
  ];

  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Room link copied', 'success');
    } catch {
      showToast('Couldn’t copy the link. Copy it from the address bar instead.');
    }
  };

  const simulateOccupancy = () => {
    const updatedAt = new Date(nowMs + SIMULATION_STEP_MS);

    if (room.type === 'reading-room') {
      const updatedSeats = seats.map((seat, index) => rotateSeatState(seat, index, updatedAt));
      const changedCount = updatedSeats.filter((seat, index) => seat !== seats[index]).length;
      showToast(
        changedCount > 0
          ? `Simulated update: ${changedCount} seat${changedCount === 1 ? '' : 's'} changed`
          : 'Simulated update: no seats changed',
        'info',
      );
      setSeats(updatedSeats);
      setRoom((currentRoom) =>
        currentRoom?.type === 'reading-room'
          ? { ...currentRoom, seats: updatedSeats, updatedAt: updatedAt.toISOString() }
          : currentRoom,
      );
    } else {
      showToast('Simulated update: room state changed', 'info');
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

    setNowMs(updatedAt.getTime());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={`Room ${room.name}`}
        description={`${room.type === 'reading-room' ? 'Reading room' : 'Group room'} · ${formatDemoSnapshotDateTime(nowMs)}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyRoomLink} className={secondaryButtonClass}>
              Copy link
            </button>
            <button type="button" onClick={simulateOccupancy} className={secondaryButtonClass}>
              Simulate occupancy
            </button>
          </div>
        )}
      />

      {room.type === 'group-room' ? <GroupRoomOverview room={room} /> : null}

      {room.type === 'reading-room' && readingSummary ? (
        <>
          <section aria-label="Seat availability" className={`${cardClass} p-5`}>
            <AvailabilitySummary summary={readingSummary} showAllStates />
            <p className="mt-3 text-xs text-slate-500">
              Recently used means the seat is currently empty, but presence was detected recently.
            </p>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <RoomMap room={{ ...(room as ReadingRoom), seats }} seats={seats} selectedSeat={selectedSeat} nowMs={nowMs} onSelectSeat={(seat) => setSelectedSeatId(seat.id)} />
            <SeatDetails seat={selectedSeat} nowMs={nowMs} />
            {popularTimes ? (
              <PopularTimes
                key={room.id}
                days={popularTimes.days}
                typicalStayText={popularTimes.typicalStayText}
                nowWeekday={demoNow.weekday}
                nowHour={demoNow.hour}
                className="xl:col-start-1"
              />
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
};

export default Room;
