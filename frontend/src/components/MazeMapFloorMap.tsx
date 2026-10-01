import { useEffect, useId, useRef, useState } from 'react';
import { floorMapView, getMazeMapZLevelForFloor, KRONSTAD_CAMPUS_ID } from '../data/mazeMapPlacements';
import { createDemoRoomFromMazeMap } from '../demo/createDemoRoomFromMazeMap';
import { getMazeMapRoomCode } from '../demo/roomClassification';
import type { Floor } from '../types/campus';
import type { MazeMapFeature, MazeMapFeatureCollection, MazeMapGlobal, MazeMapInstance, MazeMapMouseEvent } from '../types/mazemap';
import { getGroupRoomStatus } from '../utils/roomStatus';
import { groupRoomMapOverlayStyles } from './statusStyles';

const MAZEMAP_JS_URL = 'https://api.mazemap.com/js/v2.1.2/mazemap.min.js';
const MAZEMAP_CSS_URL = 'https://api.mazemap.com/js/v2.1.2/mazemap.min.css';
const ROOM_STATUS_SOURCE_ID = 'seatsense-room-status';
const ROOM_STATUS_FILL_LAYER_ID = 'seatsense-room-status-fill';
const ROOM_STATUS_OUTLINE_LAYER_ID = 'seatsense-room-status-outline';
const SELECTED_ROOM_SOURCE_ID = 'seatsense-selected-room';
const SELECTED_ROOM_FILL_LAYER_ID = 'seatsense-selected-room-fill';
const SELECTED_ROOM_OUTLINE_LAYER_ID = 'seatsense-selected-room-outline';

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

interface MazeMapFloorMapProps {
  floor: Floor;
  selectedRoomId: string | null;
  onSelectRoom: (selection: MazeMapRoomSelection) => void;
  onClearRoom?: () => void;
  onFloorLevelChange?: (change: MazeMapFloorLevelChange) => void;
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

const getRoomCodeFromClickedPolygon = (
  polygonFeature: MazeMapFeature,
  features: MazeMapFeature[],
  activeZLevel: number,
) => {
  const ownTitle = getRoomCode(getRoomLikeText(polygonFeature.properties ?? {}));

  if (ownTitle) {
    return ownTitle;
  }

  const ring = getFirstPolygonRing(polygonFeature);
  const polygonCenter = getGeometryCenter(polygonFeature);

  if (!ring || !polygonCenter) {
    return undefined;
  }

  const polygonPoiId = getFeaturePoiId(polygonFeature);
  const labels = getRoomLabelFeatures(features)
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

  return labels[0]?.code;
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

const createRoomStatusFeatureCollection = (
  map: MazeMapInstance,
  floor: Floor,
  mapElement: HTMLElement | null,
): MazeMapFeatureCollection => {
  if (!mapElement || !map.queryRenderedFeatures) {
    return emptyFeatureCollection;
  }

  const roomByCode = new Map(
    floor.rooms.map((room) => [room.name.toUpperCase(), room]),
  );

  const renderedFeatures = map.queryRenderedFeatures([
    [0, 0],
    [mapElement.clientWidth, mapElement.clientHeight],
  ]);
  const currentZLevel = map.getZLevel?.() ?? floor.mazeMapZLevel ?? getMazeMapZLevelForFloor(floor.name);
  const labels = getRoomLabelFeatures(renderedFeatures);
  const polygonFeatures = getRoomPolygonFeatures(renderedFeatures);

  const overlayFeatures = polygonFeatures
    .reduce<MazeMapFeatureCollection['features']>((features, feature) => {
      const roomCode = getRoomCodeFromPolygon(feature, labels);
      const knownRoom = roomCode ? roomByCode.get(roomCode) : undefined;
      const room = knownRoom ?? (roomCode ? createDemoRoomFromMazeMap({
        title: roomCode,
        identifier: roomCode,
        floor: currentZLevel,
        geometry: feature.geometry,
      }) : undefined);

      if (
        !room
        || room.type !== 'group-room'
        || !feature.geometry
        || features.some((item) => item.properties.roomName === room.name)
      ) {
        return features;
      }

      const style = groupRoomMapOverlayStyles[getGroupRoomStatus(room)];

      features.push({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          roomId: room.id,
          roomName: room.name,
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

const setRoomStatusOverlay = (
  map: MazeMapInstance,
  floor: Floor,
  mapElement: HTMLElement | null,
  enabled: boolean,
) => {
  const data = enabled ? createRoomStatusFeatureCollection(map, floor, mapElement) : emptyFeatureCollection;
  const existingSource = map.getSource?.(ROOM_STATUS_SOURCE_ID);

  if (existingSource?.setData) {
    existingSource.setData(data);
    return;
  }

  if (!enabled) {
    return;
  }

  if (map.isStyleLoaded?.() === false || map.loaded?.() === false || !map.addSource || !map.addLayer) {
    return;
  }

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
        'fill-opacity': 0.38,
      },
    });

    map.addLayer({
      id: ROOM_STATUS_OUTLINE_LAYER_ID,
      type: 'line',
      source: ROOM_STATUS_SOURCE_ID,
      paint: {
        'line-color': ['get', 'lineColor'],
        'line-opacity': 0.92,
        'line-width': 2,
      },
    });
  } catch {
    // MazeMap can still be settling its Mapbox style immediately after initialization.
  }
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

  if (!feature || map.isStyleLoaded?.() === false || map.loaded?.() === false) {
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

    map.addLayer({
      id: SELECTED_ROOM_FILL_LAYER_ID,
      type: 'fill',
      source: SELECTED_ROOM_SOURCE_ID,
      paint: {
        'fill-color': '#67e8f9',
        'fill-opacity': 0.28,
      },
    });

    map.addLayer({
      id: SELECTED_ROOM_OUTLINE_LAYER_ID,
      type: 'line',
      source: SELECTED_ROOM_SOURCE_ID,
      paint: {
        'line-color': '#a5f3fc',
        'line-width': 3,
      },
    });
  } catch {
    // MazeMap can still be settling its Mapbox style immediately after initialization.
  }
};

const syncMapToFloor = (map: MazeMapInstance, zLevel: number) => {
  map.resize?.();

  if (Number.isFinite(zLevel) && map.getZLevel?.() !== zLevel) {
    map.setZLevel?.(zLevel);
  }
};

const syncInitialMapView = (map: MazeMapInstance, zLevel: number) => {
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

const MazeMapFloorMap = ({ floor, selectedRoomId, onSelectRoom, onClearRoom, onFloorLevelChange }: MazeMapFloorMapProps) => {
  const rawId = useId();
  const mapId = `mazemap-floor-${rawId.replace(/:/g, '')}`;
  const mapRef = useRef<MazeMapInstance | null>(null);
  const mazemapRef = useRef<MazeMapGlobal | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showGroupRoomColors, setShowGroupRoomColors] = useState(true);
  const showGroupRoomColorsRef = useRef(showGroupRoomColors);
  const floorZLevel = floor.mazeMapZLevel ?? getMazeMapZLevelForFloor(floor.name);
  const lastObservedZLevelRef = useRef(floorZLevel);

  showGroupRoomColorsRef.current = showGroupRoomColors;

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
          zLevelUpdater: true,
        });
        mapRef.current = map;

        const markReady = () => {
          if (!isMounted) {
            return;
          }

          syncInitialMapView(map, floorZLevel);
          setRoomStatusOverlay(map, floor, document.getElementById(mapId), showGroupRoomColorsRef.current);
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
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [mapId]);

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
      const trace = features.map((feature) =>
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

      console.groupCollapsed('[SeatSense MazeMap click]', {
        point: event.point,
        activeZ: currentZLevel,
        routeFloorId: floor.id,
        routeFloorName: floor.name,
        expectedZ: floorZLevel,
      });

      if (selectedFeature) {
        const roomCode = getRoomCodeFromClickedPolygon(selectedFeature, visibleFeatures, currentZLevel);

        if (roomCode) {
          const displaySelection = {
            poiId: getFeaturePoiId(selectedFeature),
            identifier: roomCode,
            title: roomCode,
            floor: currentZLevel,
            geometry: selectedFeature.geometry,
          };

          console.table(trace);
          console.debug('[SeatSense MazeMap final selection]', displaySelection);
          console.groupEnd();
          setSelectedRoomHighlight(map, selectedFeature);
          onSelectRoom(displaySelection);
          return;
        }
      }

      console.table(trace);
      console.debug('[SeatSense MazeMap final selection]', null);
      console.groupEnd();
      setSelectedRoomHighlight(map, null);
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
    const refreshRoomStatusOverlay = () => setRoomStatusOverlay(map, floor, mapElement, showGroupRoomColorsRef.current);

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

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      map.off?.('idle', refreshRoomStatusOverlay);
      map.off?.('moveend', refreshRoomStatusOverlay);
    };
  }, [floor, floor.name, floorZLevel, mapId, status]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) {
      return;
    }

    setRoomStatusOverlay(
      mapRef.current,
      floor,
      document.getElementById(mapId),
      showGroupRoomColors,
    );
  }, [floor, mapId, showGroupRoomColors, status]);

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
      <div id={mapId} className="h-[420px] min-h-[420px] w-full bg-surface-850" />
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-white/10 bg-surface-950/90 px-3 py-2 text-xs text-slate-300 shadow-lg">
        <span className="font-medium text-white">MazeMap</span>
        <span className="ml-2 text-slate-400">{selectedRoomId ? 'Room selected' : 'Click a room'}</span>
      </div>
      <button
        type="button"
        onClick={() => setShowGroupRoomColors((isVisible) => !isVisible)}
        className={`absolute right-4 top-4 z-10 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-sm transition ${
          showGroupRoomColors
            ? 'border-cyan-400/50 bg-cyan-50 text-cyan-800 shadow-cyan-900/5'
            : 'border-slate-300 bg-white/95 text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900'
        }`}
        aria-pressed={showGroupRoomColors}
      >
        Group room colors {showGroupRoomColors ? 'on' : 'off'}
      </button>
      {showGroupRoomColors ? (
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-surface-950/90 px-3 py-2 text-xs text-slate-200 shadow-lg">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-yellow-300" />
          Booked empty
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />
          In use
        </span>
      </div>
      ) : null}

      {status === 'loading' ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface-950/80 text-sm text-slate-300">
          Loading MazeMap...
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface-950/90 p-6 text-center">
          <div>
            <p className="text-lg font-semibold text-white">MazeMap could not be loaded</p>
            <p className="mt-2 text-sm text-slate-400">Use the room list below to choose a room and open the seat overview.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MazeMapFloorMap;
