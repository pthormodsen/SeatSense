import type { MazeMapRoomSelection } from '../components/MazeMapFloorMap';
import type { Floor, Room } from '../types/campus';
import {
  campus,
  findBuilding,
  findFloor,
  findFloorByMazeMapZLevel,
  findRoom,
  getFloorIdForMazeMapZLevel,
  summarizeBuildings,
  summarizeFloors,
  summarizeRooms,
  summarizeSeats,
} from '../data/mockCampus';
import {
  createDemoRoomFromMazeMap,
  mazeMapRoomFromSearchParams,
} from '../demo/createDemoRoomFromMazeMap';
import { getPopularTimesWeek, getTypicalStayText } from '../demo/popularTimes';

const normalizeRoomName = (value?: string) => value?.trim().toLowerCase() ?? '';

// Looks up a MazeMap selection among rooms known to SeatSense (by floor and
// title/identifier). Only known rooms get a map overlay; the generated demo
// fallback in resolveMazeMapRoom is for click details only.
// `selection.floor` is a MazeMap z-level, not an app floor number.
export const findKnownMazeMapRoom = (
  selection: MazeMapRoomSelection,
  floor?: Floor,
): Room | undefined => {
  const resolvedFloor = floor ?? findFloorByMazeMapZLevel(selection.floor);
  const names = [selection.title, selection.identifier]
    .map(normalizeRoomName)
    .filter((name) => name.length > 0);

  return resolvedFloor?.rooms.find((room) => names.includes(normalizeRoomName(room.name)));
};

// Turns a MazeMap click into a SeatSense room. A known room is returned as-is
// (same id and data as its card); otherwise a demo room is generated with the
// correct SeatSense floor id.
const resolveMazeMapRoom = (selection: MazeMapRoomSelection, floor?: Floor): Room => {
  const knownRoom = findKnownMazeMapRoom(selection, floor);

  if (knownRoom) {
    return knownRoom;
  }

  const resolvedFloor = floor ?? findFloorByMazeMapZLevel(selection.floor);

  return createDemoRoomFromMazeMap(
    selection,
    resolvedFloor ? { floorId: resolvedFloor.id } : undefined,
  );
};

// Fallback for /room/:roomId when getRoom misses: rebuild the room from the
// MazeMap search params (whose `floor` is a z-level).
const resolveRoomFromSearchParams = (roomId: string, params: URLSearchParams): Room =>
  resolveMazeMapRoom(mazeMapRoomFromSearchParams(roomId, params));

export const seatService = {
  getCampus: () => campus,
  getBuilding: findBuilding,
  getFloor: findFloor,
  getRoom: findRoom,
  findFloorByMazeMapZLevel,
  getFloorIdForMazeMapZLevel,
  findKnownMazeMapRoom,
  resolveMazeMapRoom,
  resolveRoomFromSearchParams,
  summarizeSeats,
  summarizeRooms,
  summarizeFloors,
  summarizeBuildings,
  // Synthetic demo history for reading rooms (not measured data).
  getPopularTimes: getPopularTimesWeek,
  getTypicalStayText,
};
