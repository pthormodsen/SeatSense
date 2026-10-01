import type { Floor, MazeMapFloor } from '../types/campus';

export const KRONSTAD_CAMPUS_ID = 9;

export const floorMapView = {
  center: { lng: 5.34972, lat: 60.36976 },
  zoom: 17,
};

// MazeMap campus 9, Kronstad 2 (building 1001232) floor metadata.
export const mBuildingMazeMapFloorZLevels: Record<MazeMapFloor, number> = {
  M1: 2,
  M2: 3,
  M3: 4,
  M4: 5,
  M5: 6,
};

export const mBuildingMazeMapZLevelLabels: Record<number, MazeMapFloor> = Object.fromEntries(
  Object.entries(mBuildingMazeMapFloorZLevels).map(([floor, zLevel]) => [zLevel, floor]),
) as Record<number, MazeMapFloor>;

export const getMazeMapZLevelForFloor = (floor: Pick<Floor, 'mazeMapFloor'>) =>
  mBuildingMazeMapFloorZLevels[floor.mazeMapFloor];

export const getSeatSenseMazeMapFloorForZLevel = (zLevel: number) =>
  mBuildingMazeMapZLevelLabels[zLevel];
