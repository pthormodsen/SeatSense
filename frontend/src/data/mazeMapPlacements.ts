export const KRONSTAD_CAMPUS_ID = 9;

export const floorMapView = {
  center: { lng: 5.34972, lat: 60.36976 },
  zoom: 17,
  zLevel: 1,
};

export const getMazeMapZLevelForFloor = (floorName: string) => {
  const floorNumber = Number(floorName.match(/\d+/)?.[0] ?? 1);
  return Number.isFinite(floorNumber) ? floorNumber : floorMapView.zLevel;
};
