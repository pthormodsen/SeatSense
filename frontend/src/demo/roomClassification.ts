import type { MazeMapRoomSelection } from '../components/MazeMapFloorMap';
import type { RoomType } from '../types/campus';
import type { MazeMapGeometry } from '../types/mazemap';
import { stableHash } from './deterministicDemo';
import { getKronstadRoomMetadata } from './kronstadRoomMetadata';

export const GROUP_ROOM_AREA_THRESHOLD = 75;

const isPosition = (value: unknown): value is [number, number] =>
  Array.isArray(value)
  && value.length >= 2
  && typeof value[0] === 'number'
  && typeof value[1] === 'number';

const readFirstRing = (geometry: MazeMapGeometry) => {
  if (!Array.isArray(geometry.coordinates)) {
    return null;
  }

  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    return Array.isArray(ring) && ring.every(isPosition) ? ring : null;
  }

  if (geometry.type === 'MultiPolygon') {
    const ring = geometry.coordinates[0]?.[0];
    return Array.isArray(ring) && ring.every(isPosition) ? ring : null;
  }

  return null;
};

export const getMazeMapRoomCode = (value?: string) =>
  value?.match(/\b[A-ZÆØÅ]?\d{3,4}[A-Z]?\b/i)?.[0].toUpperCase();

export const getMazeMapRoomDisplayName = (room: Pick<MazeMapRoomSelection, 'identifier' | 'title'>) =>
  getMazeMapRoomCode(room.identifier) ?? getMazeMapRoomCode(room.title) ?? room.title.trim();

export const getMazeMapRoomArea = (geometry?: MazeMapGeometry) => {
  if (!geometry) {
    return undefined;
  }

  const ring = readFirstRing(geometry);

  if (!ring || ring.length < 3) {
    return undefined;
  }

  const isLngLat = ring.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90);
  const [originLng, originLat] = ring[0];
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = Math.cos((originLat * Math.PI) / 180) * metersPerDegreeLat;
  const points = isLngLat
    ? ring.map(([lng, lat]) => ({
        x: (lng - originLng) * metersPerDegreeLng,
        y: (lat - originLat) * metersPerDegreeLat,
      }))
    : ring.map(([x, y]) => ({ x, y }));

  const doubleArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(doubleArea / 2);
};

export const getStableMazeMapRoomKey = (
  room: Pick<MazeMapRoomSelection, 'poiId' | 'identifier' | 'title' | 'floor'>,
) => {
  const roomCode = getMazeMapRoomCode(room.identifier) ?? getMazeMapRoomCode(room.title);

  if (roomCode) {
    return `${roomCode}:z${room.floor}`;
  }

  if (room.poiId !== undefined) {
    return `poi:${room.poiId}`;
  }

  const normalizedTitle = room.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedIdentifier = room.identifier?.trim().toLowerCase().replace(/\s+/g, ' ');

  return `${normalizedIdentifier ?? normalizedTitle}:z${room.floor}`;
};

export const getMazeMapRoomIdentity = getStableMazeMapRoomKey;

export const classifyMazeMapRoom = (room: MazeMapRoomSelection): RoomType => {
  const metadata = getKronstadRoomMetadata(room.title);

  if (metadata) {
    return metadata.type;
  }

  const area = room.area ?? getMazeMapRoomArea(room.geometry);

  if (area !== undefined) {
    return area < GROUP_ROOM_AREA_THRESHOLD ? 'group-room' : 'reading-room';
  }

  // Demo fallback: when MazeMap only gives a label/POI without polygon geometry,
  // use a stable identity hash so the same room always gets the same type.
  return stableHash(getMazeMapRoomIdentity(room)) % 100 < 35 ? 'group-room' : 'reading-room';
};
