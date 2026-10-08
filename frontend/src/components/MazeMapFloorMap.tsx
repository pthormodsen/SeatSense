import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  floorMapView,
  getMazeMapZLevelForFloor,
  KRONSTAD_CAMPUS_ID,
  mBuildingMazeMapZLevelLabels,
} from '../data/mazeMapPlacements';
import { getMazeMapRoomArea, getMazeMapRoomCode, getStableMazeMapRoomKey } from '../demo/roomClassification';
import { seatService } from '../services/seatService';
import type { Floor, Room } from '../types/campus';
import type { MazeMapFeature, MazeMapFeatureCollection, MazeMapGlobal, MazeMapInstance, MazeMapMouseEvent } from '../types/mazemap';
import { getGroupRoomStatus } from '../utils/roomStatus';
import MapLegend from './MapLegend';
import { groupRoomMapOverlayStyles } from './statusStyles';

const MAZEMAP_JS_URL = 'https://api.mazemap.com/js/v2.1.2/mazemap.min.js';
const MAZEMAP_CSS_URL = 'https://api.mazemap.com/js/v2.1.2/mazemap.min.css';
const ROOM_STATUS_SOURCE_ID = 'seatsense-room-status';
const ROOM_STATUS_FILL_LAYER_ID = 'seatsense-room-status-fill';
const ROOM_STATUS_OUTLINE_LAYER_ID = 'seatsense-room-status-outline';
const SELECTED_ROOM_SOURCE_ID = 'seatsense-selected-room';
const SELECTED_ROOM_FILL_LAYER_ID = 'seatsense-selected-room-fill';
const SELECTED_ROOM_OUTLINE_LAYER_ID = 'seatsense-selected-room-outline';
const SELECTED_ROOM_CASING_LAYER_ID = 'seatsense-selected-room-casing';
const HOVER_ROOM_SOURCE_ID = 'seatsense-hover-room';
const HOVER_ROOM_FILL_LAYER_ID = 'seatsense-hover-room-fill';
const HOVER_ROOM_OUTLINE_LAYER_ID = 'seatsense-hover-room-outline';

export interface MazeMapRoomSelection {
  poiId?: number;
  identifier?: string;
  title: string;
  floor: number;
  area?: number;
  geometry?: MazeMapFeature['geometry'];
}

export interface MazeMapFloorLevelChange {
  zLevel: number;
  roomCodes: string[];
}

// A room found on this floor's MazeMap z-level by the status-overlay refresh.
// `room` is the exact object the overlay resolved (cached for generated rooms),
// and `selection` is exactly the selection it was resolved from (room code,
// z-level, canonical polygon geometry), i.e. the same geometry the click path
// aligns to.
export interface DiscoveredMazeMapRoom {
  room: Room;
  selection: MazeMapRoomSelection;
}

interface MazeMapFloorMapProps {
  floor: Floor;
  selectedRoomId: string | null;
  // Room code (e.g. "M107") of the room selected outside the map, such as from
  // the room list. Highlighted only on an exact room-code match among the room
  // polygons currently rendered on this floor's z-level; never guessed.
  selectedRoomName?: string | null;
  onSelectRoom: (selection: MazeMapRoomSelection) => void;
  onClearRoom?: () => void;
  onFloorLevelChange?: (change: MazeMapFloorLevelChange) => void;
  // Called after an overlay refresh finds rooms on this floor's z-level that
  // were not reported before for this floor. Receives the full current batch.
  onRoomsDiscovered?: (rooms: DiscoveredMazeMapRoom[]) => void;
}

let mazemapLoadPromise: Promise<MazeMapGlobal> | null = null;

const loadMazeMap = () => {
  if (window.Mazemap) {
    return Promise.resolve(window.Mazemap);
  }

  if (mazemapLoadPromise) {
    return mazemapLoadPromise;
  }

  mazemapLoadPromise = new Promise<MazeMapGlobal>((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAZEMAP_CSS_URL}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = MAZEMAP_CSS_URL;
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${MAZEMAP_JS_URL}"]`);
    const script = existingScript ?? document.createElement('script');

    script.addEventListener('load', () => {
      if (window.Mazemap) {
        resolve(window.Mazemap);
      } else {
        reject(new Error('MazeMap loaded without exposing window.Mazemap'));
      }
    });
    script.addEventListener('error', () => reject(new Error('Could not load MazeMap JS API')));

    if (!existingScript) {
      script.src = MAZEMAP_JS_URL;
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return mazemapLoadPromise;
};

const readString = (properties: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = properties[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number') {
      return String(value);
    }
  }

  return undefined;
};

const getRoomCode = (value?: string) =>
  getMazeMapRoomCode(value);

const normalizeRoomCode = (value?: string) =>
  getRoomCode(value);

const getRoomLikeText = (properties: Record<string, unknown>) => {
  const value = readString(properties, [
    'title',
    'name',
    'label',
    'displayName',
    'display_name',
    'identifier',
    'poiIdentifier',
    'poi_identifier',
    'reference',
    'ref',
    'roomId',
    'room_id',
    'text',
    'text_en',
    'name_en',
  ]);

  if (!value) {
    return undefined;
  }

  const roomCode = getRoomCode(value);
  return roomCode ?? value;
};

const readNumber = (properties: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = properties[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
};

const getFeatureZLevel = (feature: MazeMapFeature) =>
  readNumber(feature.properties ?? {}, ['zLevel', 'zlevel', 'floor']);

const hasConflictingZLevel = (feature: MazeMapFeature, activeZLevel: number) => {
  const featureZLevel = getFeatureZLevel(feature);
  return featureZLevel !== undefined && featureZLevel !== activeZLevel;
};

const emptyFeatureCollection: MazeMapFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

type MapPoint = [number, number];
type RoomLabelFeature = {
  code: string;
  center: { x: number; y: number };
  feature: MazeMapFeature;
  poiId: number | undefined;
};

const isMapPoint = (value: unknown): value is MapPoint =>
  Array.isArray(value)
  && value.length >= 2
  && typeof value[0] === 'number'
  && typeof value[1] === 'number';

const readGeometryPoints = (value: unknown): MapPoint[] => {
  if (isMapPoint(value)) {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(readGeometryPoints);
};

const getGeometryCenter = (feature: MazeMapFeature) => {
  const points = readGeometryPoints(feature.geometry?.coordinates);

  if (points.length === 0) {
    return null;
  }

  const sum = points.reduce(
    (result, [x, y]) => ({
      x: result.x + x,
      y: result.y + y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
};

const getFeaturePoiId = (feature: MazeMapFeature) =>
  readNumber(feature.properties ?? {}, ['poiId', 'poi_id', 'poiIdValue', 'poi_id_value', 'id'])
  ?? (typeof feature.id === 'number' ? feature.id : undefined);

const getFirstPolygonRing = (feature: MazeMapFeature): MapPoint[] | null => {
  const geometry = feature.geometry;

  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    return Array.isArray(ring) && ring.every(isMapPoint) ? ring : null;
  }

  if (geometry.type === 'MultiPolygon') {
    const ring = geometry.coordinates[0]?.[0];
    return Array.isArray(ring) && ring.every(isMapPoint) ? ring : null;
  }

  return null;
};

const getPolygonArea = (feature: MazeMapFeature) => {
  const ring = getFirstPolygonRing(feature);

  if (!ring || ring.length < 3) {
    return Number.POSITIVE_INFINITY;
  }

  const doubleArea = ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);

  return Math.abs(doubleArea / 2);
};

const isPointInRing = (point: { x: number; y: number }, ring: MapPoint[]) => {
  let inside = false;

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previousIndex];
    const crossesY = yi > point.y !== yj > point.y;
    const xAtY = ((xj - xi) * (point.y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (crossesY && point.x < xAtY) {
      inside = !inside;
    }
  }

  return inside;
};

const getPointDistance = (first: { x: number; y: number }, second: { x: number; y: number }) =>
  Math.hypot(first.x - second.x, first.y - second.y);

const isSeatSenseFeature = (feature: MazeMapFeature) => {
  const layerId = feature.layer?.id?.toLowerCase() ?? '';
  const sourceId = feature.source?.toLowerCase() ?? '';

  return layerId.startsWith('seatsense-') || sourceId.startsWith('seatsense-');
};

const isRoomPolygonFeature = (feature: MazeMapFeature) => {
  const layerId = feature.layer?.id?.toLowerCase() ?? '';
  const geometryType = feature.geometry?.type.toLowerCase() ?? '';

  return !isSeatSenseFeature(feature)
    && geometryType.includes('polygon')
    && (layerId.includes('room') || layerId === 'mm-rooms');
};

const getRoomPolygonFeatures = (features: MazeMapFeature[]) =>
  features.filter(isRoomPolygonFeature);

const getRoomLabelFeatures = (features: MazeMapFeature[]): RoomLabelFeature[] =>
  features.reduce<RoomLabelFeature[]>((labels, feature) => {
    const code = normalizeRoomCode(getRoomLikeText(feature.properties ?? {}));
    const center = getGeometryCenter(feature);

    if (code && center && !isSeatSenseFeature(feature)) {
      labels.push({
        code,
        center,
        feature,
        poiId: getFeaturePoiId(feature),
      });
    }

    return labels;
  }, []);

// How a polygon got its room code: 0 = its own title, 1 = a label with the same
// POI id inside the polygon, 2 = another label inside the polygon. Lower is
// more trustworthy.
type PolygonRoomCodeMatch = { code: string; tier: 0 | 1 | 2 };

const getRoomCodeMatchFromPolygon = (
  polygonFeature: MazeMapFeature,
  allLabels: RoomLabelFeature[],
  activeZLevel: number,
): PolygonRoomCodeMatch | undefined => {
  const ownTitle = getRoomCode(getRoomLikeText(polygonFeature.properties ?? {}));

  if (ownTitle) {
    return { code: ownTitle, tier: 0 };
  }

  const ring = getFirstPolygonRing(polygonFeature);
  const polygonCenter = getGeometryCenter(polygonFeature);

  if (!ring || !polygonCenter) {
    return undefined;
  }

  const polygonPoiId = getFeaturePoiId(polygonFeature);
  const labels = allLabels
    .filter((candidate) =>
      !hasConflictingZLevel(candidate.feature, activeZLevel)
      && isPointInRing(candidate.center, ring),
    )
    .sort((first, second) => {
      const firstPoiMatch = polygonPoiId !== undefined && first.poiId === polygonPoiId ? 0 : 1;
      const secondPoiMatch = polygonPoiId !== undefined && second.poiId === polygonPoiId ? 0 : 1;

      return firstPoiMatch - secondPoiMatch
        || getPointDistance(first.center, polygonCenter) - getPointDistance(second.center, polygonCenter);
    });
  const best = labels[0];

  if (!best) {
    return undefined;
  }

  return { code: best.code, tier: polygonPoiId !== undefined && best.poiId === polygonPoiId ? 1 : 2 };
};

const getRoomCodeFromClickedPolygon = (
  polygonFeature: MazeMapFeature,
  features: MazeMapFeature[],
  activeZLevel: number,
) => getRoomCodeMatchFromPolygon(polygonFeature, getRoomLabelFeatures(features), activeZLevel)?.code;

// One representative MazeMap polygon per room code on the active z-level.
// queryRenderedFeatures can return the same room several times (split across
// vector-tile boundaries) and label-less polygons can pick up a code from a
// label inside them. Both the status overlay and the click selection use this
// polygon's geometry, so a room's area (and therefore its generated type and
// data) is the same whether it is coloured or clicked. Preference: best code
// tier (own title > POI-matched label > other label), then the largest piece.
const getCanonicalRoomPolygons = (
  renderedFeatures: MazeMapFeature[],
  activeZLevel: number,
) => {
  const labels = getRoomLabelFeatures(renderedFeatures);
  const canonical = new Map<string, { feature: MazeMapFeature; tier: number; area: number }>();

  getRoomPolygonFeatures(renderedFeatures).forEach((feature) => {
    if (!feature.geometry || hasConflictingZLevel(feature, activeZLevel)) {
      return;
    }

    const match = getRoomCodeMatchFromPolygon(feature, labels, activeZLevel);

    if (!match) {
      return;
    }

    const area = getPolygonArea(feature);
    const current = canonical.get(match.code);

    if (!current || match.tier < current.tier || (match.tier === current.tier && area > current.area)) {
      canonical.set(match.code, { feature, tier: match.tier, area });
    }
  });

  return canonical;
};

// Generated (unknown) rooms are a pure function of identity + polygon area, so
// they are cached to avoid regenerating every demo room (including reading-room
// seat layouts) on each overlay refresh (idle/moveend). Known rooms are never
// cached; they always come fresh from seatService.
const GENERATED_ROOM_CACHE_LIMIT = 1000;
const generatedRoomCache = new Map<string, Room>();

const resolveOverlayRoom = (selection: MazeMapRoomSelection): Room => {
  const cacheKey = `${getStableMazeMapRoomKey(selection)}|${getMazeMapRoomArea(selection.geometry) ?? 'none'}`;
  const cached = generatedRoomCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const room = seatService.resolveMazeMapRoom(selection);

  if (!seatService.findKnownMazeMapRoom(selection)) {
    if (generatedRoomCache.size >= GENERATED_ROOM_CACHE_LIMIT) {
      generatedRoomCache.clear();
    }

    generatedRoomCache.set(cacheKey, room);
  }

  return room;
};

const getVisibleRoomCodes = (
  map: MazeMapInstance,
  mapElement: HTMLElement | null,
) => {
  if (!mapElement || !map.queryRenderedFeatures) {
    return [];
  }

  const renderedFeatures = map.queryRenderedFeatures([
    [0, 0],
    [mapElement.clientWidth, mapElement.clientHeight],
  ]);
  const activeZLevel = map.getZLevel?.();

  return Array.from(
    new Set(
      renderedFeatures
        .filter((feature) => typeof activeZLevel !== 'number' || !hasConflictingZLevel(feature, activeZLevel))
        .map((feature) => normalizeRoomCode(getRoomLikeText(feature.properties ?? {})))
        .filter((code): code is string => Boolean(code)),
    ),
  );
};

const getRoomCodeFromFeature = (feature: MazeMapFeature) =>
  normalizeRoomCode(getRoomLikeText(feature.properties ?? {}));

const getRoomCodeFromPolygon = (
  polygonFeature: MazeMapFeature,
  labels: Array<{ code: string; center: { x: number; y: number } }>,
) => {
  const ownCode = getRoomCodeFromFeature(polygonFeature);

  if (ownCode) {
    return ownCode;
  }

  const ring = getFirstPolygonRing(polygonFeature);

  if (!ring) {
    return undefined;
  }

  return labels.find((label) => isPointInRing(label.center, ring))?.code;
};

type ResolvedOverlayRoom = DiscoveredMazeMapRoom & { geometry: MazeMapFeature['geometry'] };

type RoomStatusRefreshResult = {
  zLevel: number;
  rooms: ResolvedOverlayRoom[];
};

// Resolves every canonical room polygon rendered in the viewport on the active
// z-level to a SeatSense room. Shared by the status overlay and room discovery
// so both see the same room objects and selections.
const resolveRenderedRooms = (
  map: MazeMapInstance,
  floor: Floor,
  mapElement: HTMLElement | null,
): RoomStatusRefreshResult => {
  const currentZLevel = map.getZLevel?.() ?? getMazeMapZLevelForFloor(floor);

  if (!mapElement || !map.queryRenderedFeatures) {
    return { zLevel: currentZLevel, rooms: [] };
  }

  const renderedFeatures = map.queryRenderedFeatures([
    [0, 0],
    [mapElement.clientWidth, mapElement.clientHeight],
  ]);

  const rooms = Array.from(getCanonicalRoomPolygons(renderedFeatures, currentZLevel))
    .reduce<ResolvedOverlayRoom[]>((resolved, [roomCode, { feature }]) => {
      if (!feature.geometry) {
        return resolved;
      }

      // The selection fields (code, z-level, canonical polygon geometry) match
      // what the click handler sends, so a room resolves to the same room
      // whether it is coloured, listed or clicked.
      const selection: MazeMapRoomSelection = {
        title: roomCode,
        identifier: roomCode,
        floor: currentZLevel,
        geometry: feature.geometry,
      };

      resolved.push({ room: resolveOverlayRoom(selection), selection, geometry: feature.geometry });
      return resolved;
    }, []);

  return { zLevel: currentZLevel, rooms };
};

const createRoomStatusFeatureCollection = (rooms: ResolvedOverlayRoom[]): MazeMapFeatureCollection => {
  const overlayFeatures = rooms.reduce<MazeMapFeatureCollection['features']>((features, { room, geometry }) => {
    // The overlay shows group-room booking/presence state for every room on
    // this z-level that resolves to a group room: known SeatSense group rooms
    // and generated rooms classified as group rooms by polygon area. Reading
    // rooms (known or generated) are never coloured. Every room stays
    // clickable because click resolution uses MazeMap's own room polygons,
    // never this overlay.
    if (
      room.type !== 'group-room'
      || !geometry
      || features.some((item) => item.properties.roomName === room.name)
    ) {
      return features;
    }

    const roomStatus = getGroupRoomStatus(room);
    const style = groupRoomMapOverlayStyles[roomStatus];

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        roomId: room.id,
        roomName: room.name,
        roomKind: room.type,
        status: roomStatus,
        fillColor: style.fillColor,
        lineColor: style.lineColor,
        statusLabel: style.label,
      },
    });

    return features;
  }, []);

  return {
    type: 'FeatureCollection',
    features: overlayFeatures,
  };
};

// Refreshes the status overlay and returns the resolved rooms. Rooms are always
// resolved (for discovery), even when status colours are off; then the overlay
// is simply published empty.
const setRoomStatusOverlay = (
  map: MazeMapInstance,
  floor: Floor,
  mapElement: HTMLElement | null,
  enabled: boolean,
): RoomStatusRefreshResult => {
  const result = resolveRenderedRooms(map, floor, mapElement);
  const data = enabled ? createRoomStatusFeatureCollection(result.rooms) : emptyFeatureCollection;
  const existingSource = map.getSource?.(ROOM_STATUS_SOURCE_ID);

  if (existingSource?.setData) {
    existingSource.setData(data);
    return result;
  }

  if (!enabled) {
    return result;
  }

  if (map.isStyleLoaded?.() === false || map.loaded?.() === false || !map.addSource || !map.addLayer) {
    return result;
  }

  // Keep the selected-room highlight above the status overlay even if the
  // highlight layers happened to be added first.
  const beforeId = map.getLayer?.(HOVER_ROOM_FILL_LAYER_ID)
    ? HOVER_ROOM_FILL_LAYER_ID
    : map.getLayer?.(SELECTED_ROOM_CASING_LAYER_ID)
      ? SELECTED_ROOM_CASING_LAYER_ID
      : undefined;

  try {
    map.addSource(ROOM_STATUS_SOURCE_ID, {
      type: 'geojson',
      data,
    });

    map.addLayer({
      id: ROOM_STATUS_FILL_LAYER_ID,
      type: 'fill',
      source: ROOM_STATUS_SOURCE_ID,
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': 0.55,
      },
    }, beforeId);

    map.addLayer({
      id: ROOM_STATUS_OUTLINE_LAYER_ID,
      type: 'line',
      source: ROOM_STATUS_SOURCE_ID,
      paint: {
        'line-color': ['get', 'lineColor'],
        'line-opacity': 1,
        'line-width': 2.5,
      },
    }, beforeId);
  } catch {
    // MazeMap can still be settling its Mapbox style immediately after initialization.
  }

  return result;
};

const featureCollectionForHighlight = (feature: MazeMapFeature): MazeMapFeatureCollection =>
  feature.geometry
    ? {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: feature.geometry,
            properties: {},
          },
        ],
      }
    : emptyFeatureCollection;

const setSelectedRoomHighlight = (map: MazeMapInstance, feature: MazeMapFeature | null) => {
  const data = feature ? featureCollectionForHighlight(feature) : emptyFeatureCollection;
  const existingSource = map.getSource?.(SELECTED_ROOM_SOURCE_ID);

  if (existingSource?.setData) {
    existingSource.setData(data);
    return;
  }

  // Only the style needs to be ready to add layers; map.loaded() also waits for
  // tiles, which can stay false for a long time while panning.
  if (!feature || map.isStyleLoaded?.() === false) {
    return;
  }

  if (!map.addSource || !map.addLayer) {
    return;
  }

  try {
    map.addSource(SELECTED_ROOM_SOURCE_ID, {
      type: 'geojson',
      data,
    });

    // Hover layers (if any) sit below; the selection is always the top-most
    // overlay. Dark ink on a white casing reads on both the pale map and any
    // status colour underneath, which stays visible through the light tint.
    map.addLayer({
      id: SELECTED_ROOM_CASING_LAYER_ID,
      type: 'line',
      source: SELECTED_ROOM_SOURCE_ID,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': 9,
        'line-opacity': 0.95,
      },
    });

    map.addLayer({
      id: SELECTED_ROOM_FILL_LAYER_ID,
      type: 'fill',
      source: SELECTED_ROOM_SOURCE_ID,
      paint: {
        'fill-color': '#0b0f14',
        'fill-opacity': 0.12,
      },
    });

    map.addLayer({
      id: SELECTED_ROOM_OUTLINE_LAYER_ID,
      type: 'line',
      source: SELECTED_ROOM_SOURCE_ID,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#0b0f14',
        'line-width': 4.5,
      },
    });
  } catch {
    // MazeMap can still be settling its Mapbox style immediately after initialization.
  }
};

// Soft outline under the pointer so rooms read as clickable. Sits below the
// selection layers, above the status overlay.
const setHoverRoomHighlight = (map: MazeMapInstance, feature: MazeMapFeature | null) => {
  const data = feature ? featureCollectionForHighlight(feature) : emptyFeatureCollection;
  const existingSource = map.getSource?.(HOVER_ROOM_SOURCE_ID);

  if (existingSource?.setData) {
    existingSource.setData(data);
    return;
  }

  // Only the style needs to be ready to add layers; map.loaded() also waits for
  // tiles, which can stay false for a long time while panning.
  if (!feature || map.isStyleLoaded?.() === false) {
    return;
  }

  if (!map.addSource || !map.addLayer) {
    return;
  }

  const beforeId = map.getLayer?.(SELECTED_ROOM_CASING_LAYER_ID) ? SELECTED_ROOM_CASING_LAYER_ID : undefined;

  try {
    map.addSource(HOVER_ROOM_SOURCE_ID, {
      type: 'geojson',
      data,
    });

    map.addLayer({
      id: HOVER_ROOM_FILL_LAYER_ID,
      type: 'fill',
      source: HOVER_ROOM_SOURCE_ID,
      paint: {
        'fill-color': '#0b0f14',
        'fill-opacity': 0.08,
      },
    }, beforeId);

    map.addLayer({
      id: HOVER_ROOM_OUTLINE_LAYER_ID,
      type: 'line',
      source: HOVER_ROOM_SOURCE_ID,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#0b0f14',
        'line-width': 2,
        'line-opacity': 0.7,
      },
    }, beforeId);
  } catch {
    // MazeMap can still be settling its Mapbox style immediately after initialization.
  }
};

// Finds the rendered MazeMap room polygon whose room code is exactly `roomCode`
// on the active z-level, using the same code extraction as the status overlay.
// Returns null when there is no exact match (not rendered, other level, etc.).
const findRenderedRoomPolygonByCode = (
  map: MazeMapInstance,
  mapElement: HTMLElement | null,
  roomCode: string,
  activeZLevel: number,
) => {
  if (!mapElement || !map.queryRenderedFeatures) {
    return null;
  }

  const renderedFeatures = map.queryRenderedFeatures([
    [0, 0],
    [mapElement.clientWidth, mapElement.clientHeight],
  ]);
  const labels = getRoomLabelFeatures(renderedFeatures)
    .filter((label) => !hasConflictingZLevel(label.feature, activeZLevel));
  const matches = getRoomPolygonFeatures(renderedFeatures)
    .filter((feature) =>
      Boolean(feature.geometry)
      && !hasConflictingZLevel(feature, activeZLevel)
      && getRoomCodeFromPolygon(feature, labels) === roomCode,
    )
    .sort((first, second) => getPolygonArea(first) - getPolygonArea(second));

  return matches[0] ?? null;
};

const normalizeSelectedRoomName = (value?: string | null) => {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
};

const syncMapToFloor = (map: MazeMapInstance, zLevel: number) => {
  map.resize?.();

  if (Number.isFinite(zLevel) && map.getZLevel?.() !== zLevel) {
    map.setZLevel?.(zLevel);
  }
};

const syncMBuildingFloorControl = (map: MazeMapInstance) => {
  map.zLevelControl?.setZLevels?.(mBuildingMazeMapZLevelLabels);
};

const syncInitialMapView = (map: MazeMapInstance, zLevel: number) => {
  syncMBuildingFloorControl(map);
  syncMapToFloor(map, zLevel);
  map.setCenter?.(floorMapView.center);
  map.setZoom?.(floorMapView.zoom);
};

const traceRoomCandidate = (
  feature: MazeMapFeature,
  activeZLevel: number,
  result: 'ACCEPT' | 'REJECT',
  reason: string,
) => {
  const properties = feature.properties ?? {};

  return {
    result,
    reason,
    featureTitle: getRoomLikeText(properties),
    identifier: readString(properties, ['identifier', 'poiIdentifier', 'poi_identifier', 'reference', 'ref', 'roomId', 'room_id']),
    poiId: readNumber(properties, ['poiId', 'poi_id', 'poiIdValue', 'poi_id_value', 'id']) ?? feature.id,
    geometryType: feature.geometry?.type,
    layerId: feature.layer?.id,
    sourceId: feature.source,
    sourceLayer: feature.sourceLayer,
    zLevel: getFeatureZLevel(feature),
    activeZLevel,
  };
};

const MazeMapFloorMap = ({
  floor,
  selectedRoomId,
  selectedRoomName,
  onSelectRoom,
  onClearRoom,
  onFloorLevelChange,
  onRoomsDiscovered,
}: MazeMapFloorMapProps) => {
  const rawId = useId();
  const mapId = `mazemap-floor-${rawId.replace(/:/g, '')}`;
  const mapRef = useRef<MazeMapInstance | null>(null);
  const mazemapRef = useRef<MazeMapGlobal | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showGroupRoomColors, setShowGroupRoomColors] = useState(true);
  const showGroupRoomColorsRef = useRef(showGroupRoomColors);
  const floorZLevel = getMazeMapZLevelForFloor(floor);
  const lastObservedZLevelRef = useRef(floorZLevel);
  // Room code currently drawn in the selected-room highlight (null = none).
  const highlightedRoomCodeRef = useRef<string | null>(null);

  // Room discovery: the callback is held in a ref so refreshes never depend on
  // its identity; reported ids are tracked per floor to avoid render loops.
  const onRoomsDiscoveredRef = useRef(onRoomsDiscovered);
  const currentFloorIdRef = useRef(floor.id);
  const discoveryRef = useRef<{ floorId: string; reportedRoomIds: Set<string> }>({
    floorId: floor.id,
    reportedRoomIds: new Set(),
  });

  showGroupRoomColorsRef.current = showGroupRoomColors;
  onRoomsDiscoveredRef.current = onRoomsDiscovered;
  currentFloorIdRef.current = floor.id;

  // Single entry point for every overlay refresh (initial, idle, moveend,
  // timed, toggle). Refreshes the overlay, then reports discovered rooms only
  // when the map shows this floor's z-level and the batch has a new room id.
  const refreshRoomStatus = useCallback((
    map: MazeMapInstance,
    sourceFloor: Floor,
    mapElement: HTMLElement | null,
    enabled: boolean,
  ) => {
    const result = setRoomStatusOverlay(map, sourceFloor, mapElement, enabled);

    // Ignore refreshes from closures that captured an older floor.
    if (sourceFloor.id !== currentFloorIdRef.current) {
      return;
    }

    if (discoveryRef.current.floorId !== sourceFloor.id) {
      discoveryRef.current = { floorId: sourceFloor.id, reportedRoomIds: new Set() };
    }

    const callback = onRoomsDiscoveredRef.current;

    if (!callback || result.rooms.length === 0 || result.zLevel !== getMazeMapZLevelForFloor(sourceFloor)) {
      return;
    }

    const { reportedRoomIds } = discoveryRef.current;

    if (!result.rooms.some(({ room }) => !reportedRoomIds.has(room.id))) {
      return;
    }

    result.rooms.forEach(({ room }) => reportedRoomIds.add(room.id));
    callback(result.rooms.map(({ room, selection }) => ({ room, selection })));
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadMazeMap()
      .then((Mazemap) => {
        if (!isMounted) {
          return;
        }

        mazemapRef.current = Mazemap;
        const map = new Mazemap.Map({
          container: mapId,
          campuses: KRONSTAD_CAMPUS_ID,
          center: floorMapView.center,
          zoom: floorMapView.zoom,
          zLevel: floorZLevel,
          zLevelUpdater: false,
        });
        mapRef.current = map;

        const markReady = () => {
          if (!isMounted) {
            return;
          }

          syncInitialMapView(map, floorZLevel);
          refreshRoomStatus(map, floor, document.getElementById(mapId), showGroupRoomColorsRef.current);
          setStatus('ready');
        };

        window.requestAnimationFrame(() => syncInitialMapView(map, floorZLevel));
        map.once?.('idle', markReady);
        map.once?.('load', markReady);
        window.setTimeout(markReady, 1800);
      })
      .catch(() => {
        if (isMounted) {
          setStatus('error');
        }
      });

    return () => {
      isMounted = false;

      try {
        mapRef.current?.remove?.();
      } catch {
        // A map torn down mid-load can throw; never let that unmount the page.
      }

      mapRef.current = null;
    };
  }, [mapId]);

  // Hover feedback: outline the room under the pointer and show a pointer cursor.
  useEffect(() => {
    const map = mapRef.current;

    if (status !== 'ready' || !map) {
      return undefined;
    }

    const canvas = document.getElementById(mapId)?.querySelector('canvas');
    let hoveredPoint = '';

    const handleMove = (event: MazeMapMouseEvent) => {
      const key = `${Math.round(event.point.x)}:${Math.round(event.point.y)}`;

      if (key === hoveredPoint) {
        return;
      }

      hoveredPoint = key;
      const currentZLevel = map.getZLevel?.() ?? floorZLevel;
      const room = getRoomPolygonFeatures(map.queryRenderedFeatures?.(event.point) ?? [])
        .filter((feature) => !hasConflictingZLevel(feature, currentZLevel))
        .sort((first, second) => getPolygonArea(first) - getPolygonArea(second))[0] ?? null;

      setHoverRoomHighlight(map, room);

      if (canvas) {
        canvas.style.cursor = room ? 'pointer' : '';
      }
    };

    const clearHover = () => {
      hoveredPoint = '';

      try {
        setHoverRoomHighlight(map, null);
      } catch {
        // The map may already be removed (this also runs on cleanup).
      }

      if (canvas) {
        canvas.style.cursor = '';
      }
    };

    map.on?.('mousemove', handleMove);
    map.on?.('mouseout', clearHover);

    return () => {
      // Cleanup can run after the map-creation effect removed the map, so
      // everything here is guarded.
      try {
        map.off?.('mousemove', handleMove);
        map.off?.('mouseout', clearHover);
      } catch {
        // Already removed.
      }

      if (canvas) {
        canvas.style.cursor = '';
      }
    };
  }, [floorZLevel, mapId, status]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) {
      return undefined;
    }

    const handleClick = (event: MazeMapMouseEvent) => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      const currentZLevel = map.getZLevel?.() ?? floorZLevel;
      const features = map.queryRenderedFeatures?.(event.point) ?? event.features ?? [];
      const mapElement = document.getElementById(mapId);
      const visibleFeatures = mapElement && map.queryRenderedFeatures
        ? map.queryRenderedFeatures([
            [0, 0],
            [mapElement.clientWidth, mapElement.clientHeight],
          ])
        : features;
      const roomPolygons = getRoomPolygonFeatures(features)
        .filter((feature) => !hasConflictingZLevel(feature, currentZLevel))
        .sort((first, second) => getPolygonArea(first) - getPolygonArea(second));
      const selectedFeature = roomPolygons[0];
      // Debug trace is only built and printed in development builds.
      const trace = !import.meta.env.DEV ? [] : features.map((feature) =>
        traceRoomCandidate(
          feature,
          currentZLevel,
          selectedFeature === feature ? 'ACCEPT' : 'REJECT',
          selectedFeature === feature
            ? 'smallest exact room polygon under click'
            : isSeatSenseFeature(feature)
              ? 'SeatSense overlay is not clickable room source'
              : !isRoomPolygonFeature(feature)
                ? 'not a room polygon'
                : hasConflictingZLevel(feature, currentZLevel)
                  ? 'wrong z-level'
                  : 'larger overlapping room polygon',
        ),
      );

      if (import.meta.env.DEV) {
        console.groupCollapsed('[SeatSense MazeMap click]', {
          point: event.point,
          activeZ: currentZLevel,
          routeFloorId: floor.id,
          routeFloorName: floor.name,
          expectedZ: floorZLevel,
        });
      }

      if (selectedFeature) {
        const roomCode = getRoomCodeFromClickedPolygon(selectedFeature, visibleFeatures, currentZLevel);

        if (roomCode) {
          // Use the same representative polygon as the status overlay for the
          // room's geometry/area, so a coloured room opens with the same
          // generated type and data. Identity (code + z-level) and known-room
          // lookup do not depend on geometry. The highlight still uses the
          // clicked polygon.
          const canonicalFeature = getCanonicalRoomPolygons(visibleFeatures, currentZLevel)
            .get(roomCode)?.feature;
          const displaySelection = {
            poiId: getFeaturePoiId(selectedFeature),
            identifier: roomCode,
            title: roomCode,
            floor: currentZLevel,
            geometry: canonicalFeature?.geometry ?? selectedFeature.geometry,
          };

          if (import.meta.env.DEV) {
            console.table(trace);
            console.debug('[SeatSense MazeMap final selection]', displaySelection);
            console.groupEnd();
          }
          setSelectedRoomHighlight(map, selectedFeature);
          highlightedRoomCodeRef.current = normalizeSelectedRoomName(roomCode);
          onSelectRoom(displaySelection);
          return;
        }
      }

      if (import.meta.env.DEV) {
        console.table(trace);
        console.debug('[SeatSense MazeMap final selection]', null);
        console.groupEnd();
      }
      setSelectedRoomHighlight(map, null);
      highlightedRoomCodeRef.current = null;
      onClearRoom?.();
    };

    mapRef.current.on?.('click', handleClick);

    return () => {
      mapRef.current?.off?.('click', handleClick);
    };
  }, [floor.id, floor.name, floorZLevel, mapId, onClearRoom, onSelectRoom, status]);

  useEffect(() => {
    lastObservedZLevelRef.current = floorZLevel;
  }, [floorZLevel]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !onFloorLevelChange) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const map = mapRef.current;
      const zLevel = map?.getZLevel?.();

      if (!map || typeof zLevel !== 'number' || !Number.isFinite(zLevel) || zLevel === lastObservedZLevelRef.current) {
        return;
      }

      lastObservedZLevelRef.current = zLevel;
      onFloorLevelChange({
        zLevel,
        roomCodes: getVisibleRoomCodes(map, document.getElementById(mapId)),
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [floorZLevel, mapId, onFloorLevelChange, status]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const mapElement = document.getElementById(mapId);
    const refreshRoomStatusOverlay = () => refreshRoomStatus(map, floor, mapElement, showGroupRoomColorsRef.current);

    syncMapToFloor(map, floorZLevel);
    refreshRoomStatusOverlay();
    window.requestAnimationFrame(refreshRoomStatusOverlay);
    const timeoutIds = [
      window.setTimeout(refreshRoomStatusOverlay, 400),
      window.setTimeout(refreshRoomStatusOverlay, 1200),
      window.setTimeout(refreshRoomStatusOverlay, 2400),
    ];

    map.on?.('idle', refreshRoomStatusOverlay);
    map.on?.('moveend', refreshRoomStatusOverlay);

    setSelectedRoomHighlight(mapRef.current, null);
    highlightedRoomCodeRef.current = null;

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      map.off?.('idle', refreshRoomStatusOverlay);
      map.off?.('moveend', refreshRoomStatusOverlay);
    };
  }, [floor, floor.name, floorZLevel, mapId, refreshRoomStatus, status]);

  // List -> map highlight sync. Declared after the floor-sync effect so a floor
  // change clears first and then re-applies the selection if it matches.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) {
      return undefined;
    }

    const map = mapRef.current;
    const wantedCode = normalizeSelectedRoomName(selectedRoomName);

    if (!wantedCode) {
      if (highlightedRoomCodeRef.current !== null) {
        setSelectedRoomHighlight(map, null);
        highlightedRoomCodeRef.current = null;
      }
      return undefined;
    }

    const applyHighlight = () => {
      // Already highlighted (e.g. the click handler just drew it): no-op.
      if (highlightedRoomCodeRef.current === wantedCode) {
        return;
      }

      const activeZLevel = map.getZLevel?.() ?? floorZLevel;
      const match = activeZLevel === floorZLevel
        ? findRenderedRoomPolygonByCode(map, document.getElementById(mapId), wantedCode, activeZLevel)
        : null;

      setSelectedRoomHighlight(map, match);
      highlightedRoomCodeRef.current = match ? wantedCode : null;
    };

    // The polygon may not be rendered yet (map still loading/panning); retry
    // when the map settles, but only while nothing is highlighted, so a newer
    // map click is never overwritten by this older list selection.
    const retryHighlight = () => {
      if (highlightedRoomCodeRef.current === null) {
        applyHighlight();
      }
    };

    applyHighlight();
    map.on?.('idle', retryHighlight);

    return () => {
      map.off?.('idle', retryHighlight);
    };
  }, [floor, floorZLevel, mapId, selectedRoomName, status]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) {
      return;
    }

    refreshRoomStatus(
      mapRef.current,
      floor,
      document.getElementById(mapId),
      showGroupRoomColors,
    );
  }, [floor, mapId, refreshRoomStatus, showGroupRoomColors, status]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) {
      return;
    }

    window.setTimeout(() => {
      mapRef.current?.resize?.();
    });
  }, [status]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-surface-900">
      <div id={mapId} className="h-[60vh] min-h-[360px] w-full bg-surface-850 lg:h-[min(680px,calc(100vh-220px))]" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[60%] truncate rounded-md border border-white/10 bg-surface-950/90 px-2.5 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur-sm">
        {selectedRoomId && selectedRoomName ? (
          <span className="font-medium text-white">{selectedRoomName}</span>
        ) : (
          <span className="text-slate-300">Click a room</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowGroupRoomColors((isVisible) => !isVisible)}
        className={`absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border bg-surface-950/90 px-2.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
          showGroupRoomColors
            ? 'border-cyan-300/40 text-cyan-100'
            : 'border-white/10 text-slate-300 hover:text-white'
        }`}
        aria-pressed={showGroupRoomColors}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${showGroupRoomColors ? 'bg-cyan-300' : 'bg-slate-500'}`}
        />
        Status colours
      </button>
      {showGroupRoomColors ? <MapLegend className="absolute bottom-8 right-3 z-10" /> : null}

      {status === 'loading' ? (
        <div role="status" className="skeleton absolute inset-0 z-20 grid place-items-center bg-surface-900 text-sm text-slate-300">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300" />
            Loading map…
          </div>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface-950/90 p-6 text-center">
          <div>
            <p className="text-lg font-semibold text-white">MazeMap could not be loaded</p>
            <p className="mt-2 text-sm text-slate-400">Check your connection, then reload the page. You can still use the room list below to choose a room and open the seat overview.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex items-center rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/5">
              Reload page
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MazeMapFloorMap;
