import type { Building, Campus, Floor, OccupancySummary, ReadingRoom, Room, RoomType, Seat } from '../types/campus';
import { createDemoRoomFromMazeMap, summarizeReadingSeats } from '../demo/createDemoRoomFromMazeMap';
import { getSeatSenseMazeMapFloorForZLevel } from './mazeMapPlacements';

const emptySummary: OccupancySummary = {
  available: 0,
  occupied: 0,
  recentlyUsed: 0,
  offline: 0,
  total: 0,
  occupancyPercent: 0,
};

// Room type is explicit for known rooms; it is never inferred from area.
const demoMazeRoom = (title: string, appFloorNumber: number, area: number, type: RoomType): Room =>
  createDemoRoomFromMazeMap(
    {
      title,
      identifier: title,
      floor: appFloorNumber,
      area,
    },
    { type },
  );

export const campus: Campus = {
  id: 'campus-kronstad',
  name: 'Campus Kronstad',
  buildings: [
    {
      id: 'kronstad',
      name: 'Kronstad',
      campusName: 'Campus Kronstad',
      description: 'Main study areas, library spaces, and group rooms.',
      floors: [
        {
          id: 'floor-1',
          name: 'Floor 1',
          buildingId: 'kronstad',
          mazeMapFloor: 'M1',
          rooms: [
            demoMazeRoom('M106', 1, 210, 'reading-room'),
            demoMazeRoom('M185', 1, 185, 'reading-room'),
          ],
        },
        {
          id: 'floor-2',
          name: 'Floor 2',
          buildingId: 'kronstad',
          mazeMapFloor: 'M2',
          rooms: [
            demoMazeRoom('M206', 2, 220, 'reading-room'),
            demoMazeRoom('M285', 2, 165, 'reading-room'),
          ],
        },
        {
          id: 'floor-3',
          name: 'Floor 3',
          buildingId: 'kronstad',
          mazeMapFloor: 'M3',
          rooms: [
            demoMazeRoom('M302', 3, 190, 'reading-room'),
            demoMazeRoom('M306', 3, 260, 'reading-room'),
          ],
        },
        {
          id: 'floor-4',
          name: 'Floor 4',
          buildingId: 'kronstad',
          mazeMapFloor: 'M4',
          rooms: [
            demoMazeRoom('M406', 4, 240, 'reading-room'),
            demoMazeRoom('M407', 4, 180, 'reading-room'),
            demoMazeRoom('M485', 4, 170, 'reading-room'),
          ],
        },
        {
          id: 'floor-5',
          name: 'Floor 5',
          buildingId: 'kronstad',
          mazeMapFloor: 'M5',
          rooms: [
            demoMazeRoom('M506', 5, 240, 'reading-room'),
            demoMazeRoom('M507', 5, 180, 'reading-room'),
          ],
        },
      ],
    },
  ],
};

export const summarizeSeats = (seats: Seat[]): OccupancySummary =>
  summarizeReadingSeats(seats);

export const summarizeReadingRooms = (rooms: ReadingRoom[]): OccupancySummary => {
  const seats = rooms.flatMap((room) => room.seats);
  return seats.length > 0 ? summarizeSeats(seats) : emptySummary;
};

export const summarizeRooms = (rooms: Room[]): OccupancySummary =>
  summarizeReadingRooms(rooms.filter((room): room is ReadingRoom => room.type === 'reading-room'));

export const summarizeFloors = (floors: Floor[]): OccupancySummary =>
  summarizeRooms(floors.flatMap((floor) => floor.rooms));

export const summarizeBuildings = (buildings: Building[]): OccupancySummary =>
  summarizeFloors(buildings.flatMap((building) => building.floors));

export const findBuilding = (buildingId: string): Building | undefined =>
  campus.buildings.find((building) => building.id === buildingId);

export const findFloor = (buildingId: string, floorId: string): Floor | undefined =>
  findBuilding(buildingId)?.floors.find((floor) => floor.id === floorId);

export const findRoom = (roomId: string): Room | undefined =>
  campus.buildings
    .flatMap((building) => building.floors)
    .flatMap((floor) => floor.rooms)
    .find((candidate) => candidate.id === roomId);

// MazeMap reports floors as z-levels (2-6); map back to the SeatSense floor via
// the central M1-M5 mapping. Never build `floor-${zLevel}` directly.
export const findFloorByMazeMapZLevel = (zLevel: number): Floor | undefined => {
  const mazeMapFloor = getSeatSenseMazeMapFloorForZLevel(zLevel);

  if (!mazeMapFloor) {
    return undefined;
  }

  return campus.buildings
    .flatMap((building) => building.floors)
    .find((floor) => floor.mazeMapFloor === mazeMapFloor);
};

export const getFloorIdForMazeMapZLevel = (zLevel: number): string | undefined =>
  findFloorByMazeMapZLevel(zLevel)?.id;
