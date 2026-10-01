import { summarizeReadingSeats } from '../demo/createDemoRoomFromMazeMap';
import type { GroupRoom, GroupRoomStatus, ReadingRoom, Room } from '../types/campus';
import { getGroupRoomStatus } from './roomStatus';

export type RoomTypeFilter = 'all' | 'reading-room' | 'group-room';
export type GroupRoomStatusFilter = 'all' | GroupRoomStatus;
export type RoomSortKey = 'availability' | 'room-number' | 'capacity';

const normalizeRoomName = (value: string) => value.trim().toLowerCase();

// Known rooms come first, unchanged. Discovered MazeMap rooms are appended only
// when they are generated group rooms not already known (by id or name).
// Generated reading rooms are skipped: large MazeMap polygons are usually
// corridors or classrooms, so only known reading rooms are listed.
export const mergeFloorRooms = (knownRooms: Room[], discoveredRooms: Room[]): Room[] => {
  const seenIds = new Set(knownRooms.map((room) => room.id));
  const seenNames = new Set(knownRooms.map((room) => normalizeRoomName(room.name)));
  const merged = [...knownRooms];

  for (const room of discoveredRooms) {
    const name = normalizeRoomName(room.name);

    if (room.type !== 'group-room' || seenIds.has(room.id) || seenNames.has(name)) {
      continue;
    }

    seenIds.add(room.id);
    seenNames.add(name);
    merged.push(room);
  }

  return merged;
};

// Natural room-code order (M205 < M210 < M1001), tie-broken by id.
export const compareRoomCode = (a: Room, b: Room): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) ||
  a.id.localeCompare(b.id);

export const filterGroupRoomsByStatus = (
  rooms: GroupRoom[],
  filter: GroupRoomStatusFilter,
): GroupRoom[] =>
  filter === 'all' ? [...rooms] : rooms.filter((room) => getGroupRoomStatus(room) === filter);

const GROUP_STATUS_ORDER: Record<GroupRoomStatus, number> = {
  available: 0,
  'booked-unused': 1,
  'booked-in-use': 2,
};

// Rooms with an unknown or invalid capacity sort last.
const capacityRank = (room: Room) =>
  Number.isFinite(room.capacity) && room.capacity > 0 ? room.capacity : -Infinity;

const compareCapacity = (a: Room, b: Room): number => {
  const rankA = capacityRank(a);
  const rankB = capacityRank(b);

  if (rankA === rankB) {
    return compareRoomCode(a, b);
  }

  return rankB > rankA ? 1 : -1;
};

export const sortGroupRooms = (rooms: GroupRoom[], sortKey: RoomSortKey): GroupRoom[] => {
  const sorted = [...rooms];

  switch (sortKey) {
    case 'availability':
      return sorted.sort(
        (a, b) =>
          GROUP_STATUS_ORDER[getGroupRoomStatus(a)] - GROUP_STATUS_ORDER[getGroupRoomStatus(b)] ||
          compareRoomCode(a, b),
      );
    case 'capacity':
      return sorted.sort(compareCapacity);
    default:
      return sorted.sort(compareRoomCode);
  }
};

export const sortReadingRooms = (rooms: ReadingRoom[], sortKey: RoomSortKey): ReadingRoom[] => {
  switch (sortKey) {
    case 'availability': {
      // Summarize once per room instead of on every comparison.
      const available = new Map<ReadingRoom, number>(
        rooms.map((room) => [room, summarizeReadingSeats(room.seats).available]),
      );

      return [...rooms].sort(
        (a, b) => (available.get(b) ?? 0) - (available.get(a) ?? 0) || compareRoomCode(a, b),
      );
    }
    case 'capacity':
      return [...rooms].sort(compareCapacity);
    default:
      return [...rooms].sort(compareRoomCode);
  }
};
