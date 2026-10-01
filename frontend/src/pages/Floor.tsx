import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import MazeMapFloorMap, {
  type DiscoveredMazeMapRoom,
  type MazeMapFloorLevelChange,
  type MazeMapRoomSelection,
} from '../components/MazeMapFloorMap';
import DemoDataBadge from '../components/DemoDataBadge';
import FloorSummary from '../components/FloorSummary';
import RoomCard from '../components/RoomCard';
import RoomListControls, { GroupStatusControl } from '../components/RoomListControls';
import SelectedRoomPanel from '../components/SelectedRoomPanel';
import { mazeMapRoomToSearchParams, summarizeReadingSeats } from '../demo/createDemoRoomFromMazeMap';
import { getMazeMapZLevelForFloor } from '../data/mazeMapPlacements';
import { seatService } from '../services/seatService';
import type { GroupRoom, ReadingRoom, Room } from '../types/campus';
import { getGroupRoomStatus } from '../utils/roomStatus';
import {
  filterGroupRoomsByStatus,
  mergeFloorRooms,
  sortGroupRooms,
  sortReadingRooms,
  type GroupRoomStatusFilter,
  type RoomSortKey,
  type RoomTypeFilter,
} from '../utils/roomListing';

const isReadingRoom = (room: Room): room is ReadingRoom =>
  room.type === 'reading-room';

const isGroupRoom = (room: Room): room is GroupRoom =>
  room.type === 'group-room';

const MAX_QUICK_PICKS = 3;

// Suggestions for the empty panel: reading rooms with the most free seats,
// then available group rooms. Independent of the list filters and sort.
const getQuickPicks = (readingRooms: ReadingRoom[], groupRooms: GroupRoom[]): Room[] => {
  const readingPicks = sortReadingRooms(readingRooms, 'availability')
    .filter((room) => summarizeReadingSeats(room.seats).available > 0)
    .slice(0, 2);
  const groupPicks = sortGroupRooms(groupRooms, 'availability')
    .filter((room) => getGroupRoomStatus(room) === 'available');

  return [...readingPicks, ...groupPicks].slice(0, MAX_QUICK_PICKS);
};

const READING_ROOMS_LIST_ID = 'reading-rooms-list';
const GROUP_ROOMS_LIST_ID = 'group-rooms-list';

const EmptySectionMessage = ({ children }: { children: string }) => (
  <p className="rounded-lg border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400">{children}</p>
);

interface SectionToggleButtonProps {
  expanded: boolean;
  controlsId: string;
  label: string;
  onToggle: () => void;
}

// Subtle chevron button for collapsing a list section.
const SectionToggleButton = ({ expanded, controlsId, label, onToggle }: SectionToggleButtonProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={expanded}
    aria-controls={controlsId}
    className="rounded-md border border-white/10 p-1.5 text-slate-400 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
  >
    <span className="sr-only">{expanded ? `Collapse ${label}` : `Expand ${label}`}</span>
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  </button>
);

interface ListSectionHeaderProps {
  headingId: string;
  title: string;
  count: number | string;
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
}

// Heading row for a collapsible room-list section. Collapsing is view-only and
// never touches the current selection.
const ListSectionHeader = ({ headingId, title, count, expanded, controlsId, onToggle }: ListSectionHeaderProps) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h3 id={headingId} className="text-base font-semibold text-white">
      {title} <span className="font-normal text-slate-500">({count})</span>
    </h3>
    <SectionToggleButton
      expanded={expanded}
      controlsId={controlsId}
      label={title.toLowerCase()}
      onToggle={onToggle}
    />
  </div>
);

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
  // List clicks and map clicks both store the resolved SeatSense room here, so
  // the selected card, the map highlight and the side panel share one source.
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  // Only kept for map-generated rooms, whose detail link needs the MazeMap params.
  const [mazeMapSelection, setMazeMapSelection] = useState<MazeMapRoomSelection | null>(null);
  // Rooms the map has reported, keyed by room id and tagged with the floor they
  // belong to. Accumulated while panning/zooming; a set tagged with another
  // floor is ignored, so changing floors starts fresh without an effect that
  // could wipe a batch the map reported first.
  const [discovered, setDiscovered] = useState<{ floorId?: string; rooms: Map<string, DiscoveredMazeMapRoom> }>(
    () => ({ rooms: new Map() }),
  );
  const floorIdRef = useRef(floorId);
  floorIdRef.current = floorId;
  const discoveredRooms = useMemo(
    () => (discovered.floorId === floorId ? discovered.rooms : new Map<string, DiscoveredMazeMapRoom>()),
    [discovered, floorId],
  );
  const [typeFilter, setTypeFilter] = useState<RoomTypeFilter>('all');
  const [groupStatusFilter, setGroupStatusFilter] = useState<GroupRoomStatusFilter>('all');
  const [sortKey, setSortKey] = useState<RoomSortKey>('availability');
  // View-only; kept across floor changes and independent of selection.
  const [isReadingRoomsExpanded, setIsReadingRoomsExpanded] = useState(true);
  const [isGroupRoomsExpanded, setIsGroupRoomsExpanded] = useState(true);
  const selectedRoomId = selectedRoom?.id ?? null;
  const panelRef = useRef<HTMLElement>(null);
  // Read by the map click handler so it can stay stable across discoveries.
  const discoveredRoomsRef = useRef(discoveredRooms);
  discoveredRoomsRef.current = discoveredRooms;

  useEffect(() => {
    setSelectedRoom(null);
    setMazeMapSelection(null);
  }, [floorId]);

  const addDiscoveredRooms = useCallback((batch: DiscoveredMazeMapRoom[]) => {
    const currentFloorId = floorIdRef.current;

    setDiscovered((previous) => {
      const previousRooms = previous.floorId === currentFloorId ? previous.rooms : new Map<string, DiscoveredMazeMapRoom>();
      const additions = batch.filter(({ room }) => !previousRooms.has(room.id));

      if (additions.length === 0 && previous.floorId === currentFloorId) {
        return previous;
      }

      const next = new Map(previousRooms);
      additions.forEach((entry) => next.set(entry.room.id, entry));
      return { floorId: currentFloorId, rooms: next };
    });
  }, []);

  const rooms = useMemo(
    () => (floor
      ? mergeFloorRooms(floor.rooms, [...discoveredRooms.values()].map(({ room }) => room))
      : []),
    [floor, discoveredRooms],
  );

  const selectRoomFromList = useCallback((roomId: string) => {
    const room = rooms.find((candidate) => candidate.id === roomId) ?? null;

    setSelectedRoom(room);
    // Generated rooms need their MazeMap selection for the detail link.
    setMazeMapSelection(discoveredRooms.get(roomId)?.selection ?? null);
  }, [rooms, discoveredRooms]);

  const selectMazeMapRoom = useCallback((selection: MazeMapRoomSelection) => {
    // The floor is derived from the selection's z-level, so this stays correct
    // even if the user changed level inside the map.
    const resolvedRoom = seatService.resolveMazeMapRoom(selection);
    // Reuse the discovered object so list, map and panel share one instance.
    const room = discoveredRoomsRef.current.get(resolvedRoom.id)?.room ?? resolvedRoom;
    setSelectedRoom(room);
    setMazeMapSelection(selection);

    // On narrow screens the panel sits below the map, so bring it into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => {
        panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }, []);

  const clearMazeMapRoom = useCallback(() => {
    setMazeMapSelection(null);
    setSelectedRoom(null);
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

    setSelectedRoom(null);
    setMazeMapSelection(null);
    navigate(`/building/${buildingId}/floor/${targetFloor.id}`);
  }, [building, buildingId, floorId, navigate]);

  if (!building || !floor) {
    return <Navigate to="/" replace />;
  }

  // Seat totals only cover known reading rooms with tracked seats.
  const summary = seatService.summarizeRooms(floor.rooms);
  const readingRooms = rooms.filter(isReadingRoom);
  const groupRooms = rooms.filter(isGroupRoom);
  const groupRoomsAvailable = groupRooms.filter((room) => getGroupRoomStatus(room) === 'available').length;
  const quickPicks = getQuickPicks(readingRooms, groupRooms);

  const showReadingRooms = typeFilter !== 'group-room';
  const showGroupRooms = typeFilter !== 'reading-room';
  const listedReadingRooms = sortReadingRooms(readingRooms, sortKey);
  const listedGroupRooms = sortGroupRooms(filterGroupRoomsByStatus(groupRooms, groupStatusFilter), sortKey);

  const isKnownSelectedRoom = selectedRoom ? seatService.getRoom(selectedRoom.id) !== undefined : false;
  const roomDetailSearch = !isKnownSelectedRoom && mazeMapSelection
    ? `?${mazeMapRoomToSearchParams(mazeMapSelection).toString()}`
    : '';
  const roomDetailHref = selectedRoom ? `/room/${selectedRoom.id}${roomDetailSearch}` : null;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-400">
            <li>
              <Link to="/" className="hover:text-cyan-100">Campus</Link>
            </li>
            <li aria-hidden="true">›</li>
            <li>
              <Link to={`/building/${building.id}`} className="text-cyan-200 hover:text-cyan-100">
                {building.name}
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li aria-current="page" className="text-slate-300">{floor.name}</li>
          </ol>
        </nav>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl font-semibold text-white">{floor.name}</h1>
            <span className="rounded border border-white/10 px-1.5 py-0.5 text-xs font-medium text-slate-400">
              {floor.mazeMapFloor}
            </span>
          </div>
          <nav aria-label="Floor selector" className="flex flex-wrap gap-1.5">
            {building.floors.map((buildingFloor) => {
              const isCurrentFloor = buildingFloor.id === floor.id;

              return (
                <Link
                  key={buildingFloor.id}
                  to={`/building/${building.id}/floor/${buildingFloor.id}`}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                    isCurrentFloor
                      ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-100'
                      : 'border-white/10 text-slate-300 hover:border-white/20 hover:text-white'
                  }`}
                  aria-current={isCurrentFloor ? 'page' : undefined}
                >
                  {buildingFloor.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <FloorSummary
        summary={summary}
        groupRoomsAvailable={groupRoomsAvailable}
        groupRoomsTotal={groupRooms.length}
        trailing={<DemoDataBadge />}
      />

      <section aria-label="Floor map" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <MazeMapFloorMap
            floor={floor}
            selectedRoomId={selectedRoomId}
            selectedRoomName={selectedRoom?.name ?? null}
            onSelectRoom={selectMazeMapRoom}
            onClearRoom={clearMazeMapRoom}
            onFloorLevelChange={selectMazeMapFloorLevel}
            onRoomsDiscovered={addDiscoveredRooms}
          />
        </div>
        <div className="min-w-0">
          <SelectedRoomPanel
            ref={panelRef}
            room={selectedRoom}
            detailHref={roomDetailHref}
            quickPicks={quickPicks}
            onSelectRoom={selectRoomFromList}
          />
        </div>
      </section>

      <section aria-labelledby="rooms-heading" className="space-y-6 border-t border-white/10 pt-8">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h2 id="rooms-heading" className="text-xl font-semibold text-white">Rooms on {floor.name}</h2>
            {rooms.length > 0 ? (
              <RoomListControls
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                sortKey={sortKey}
                onSortKeyChange={setSortKey}
              />
            ) : null}
          </div>
          <p className="text-xs text-slate-500">Includes rooms found on the map. Pan to find more.</p>
        </div>

        {rooms.length === 0 ? (
          <p className="text-sm text-slate-400">No rooms are listed for this floor yet. Click a room on the map to inspect it.</p>
        ) : (
          <>
            {showReadingRooms ? (
              <section aria-labelledby="reading-rooms-heading">
                <ListSectionHeader
                  headingId="reading-rooms-heading"
                  title="Reading rooms"
                  count={listedReadingRooms.length}
                  expanded={isReadingRoomsExpanded}
                  controlsId={READING_ROOMS_LIST_ID}
                  onToggle={() => setIsReadingRoomsExpanded((expanded) => !expanded)}
                />
                <div id={READING_ROOMS_LIST_ID} hidden={!isReadingRoomsExpanded}>
                  {isReadingRoomsExpanded ? (
                    listedReadingRooms.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {listedReadingRooms.map((room) => (
                          <RoomCard
                            key={room.id}
                            room={room}
                            selected={room.id === selectedRoomId}
                            onSelect={selectRoomFromList}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptySectionMessage>No reading rooms on this floor.</EmptySectionMessage>
                    )
                  ) : null}
                </div>
              </section>
            ) : null}

            {showGroupRooms ? (
              <section aria-labelledby="group-rooms-heading">
                <ListSectionHeader
                  headingId="group-rooms-heading"
                  title="Group rooms"
                  count={groupStatusFilter === 'all' || groupRooms.length === 0
                    ? `${groupRooms.length}`
                    : `${listedGroupRooms.length} of ${groupRooms.length}`}
                  expanded={isGroupRoomsExpanded}
                  controlsId={GROUP_ROOMS_LIST_ID}
                  onToggle={() => setIsGroupRoomsExpanded((expanded) => !expanded)}
                />
                <div id={GROUP_ROOMS_LIST_ID} hidden={!isGroupRoomsExpanded}>
                  {isGroupRoomsExpanded ? (
                    <>
                      {groupRooms.length > 0 ? (
                        <div className="mb-3">
                          <GroupStatusControl value={groupStatusFilter} onChange={setGroupStatusFilter} />
                        </div>
                      ) : null}
                      {listedGroupRooms.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                          {listedGroupRooms.map((room) => (
                            <RoomCard
                              key={room.id}
                              room={room}
                              selected={room.id === selectedRoomId}
                              onSelect={selectRoomFromList}
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptySectionMessage>
                          {groupRooms.length === 0
                            ? 'No group rooms found yet. Pan the map to find more.'
                            : 'No group rooms match this filter.'}
                        </EmptySectionMessage>
                      )}
                    </>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
};

export default Floor;
