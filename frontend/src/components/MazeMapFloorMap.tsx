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

const getRoomFeaturePriority = (feature: MazeMapFeature) => {
  const layerId = feature.layer?.id?.toLowerCase() ?? '';
  const properties = feature.properties ?? {};
  const geometryType = feature.geometry?.type.toLowerCase() ?? '';
  const roomLikeText = getRoomLikeText(properties);
  const roomCode = getRoomCode(roomLikeText);

  if (layerId === 'mm-rooms' && geometryType.includes('polygon')) {
    return 1;
  }

  if (layerId.includes('room') && geometryType.includes('polygon')) {
    return 2;
  }

  if (layerId.includes('room') && roomCode) {
    return 3;
  }

  if (layerId.includes('poi') && roomCode) {
    return 4;
  }

  return Number.POSITIVE_INFINITY;
};

const getRoomSelectionFromFeature = (feature: MazeMapFeature, fallbackFloor: number): MazeMapRoomSelection | null => {
  const properties = feature.properties ?? {};
  const poiId = readNumber(properties, ['poiId', 'poi_id', 'poiIdValue', 'poi_id_value', 'id'])
    ?? (typeof feature.id === 'number' ? feature.id : undefined);
  const identifier = readString(properties, ['identifier', 'poiIdentifier', 'poi_identifier', 'reference', 'ref', 'roomId', 'room_id']);
  const title = getRoomLikeText(properties);
  const floor = readNumber(properties, ['zLevel', 'zlevel', 'floor']) ?? fallbackFloor;

  if (!title && !identifier && poiId === undefined) {
    return null;
  }

  return {
    poiId,
    identifier,
    title: title ?? identifier ?? `Room ${poiId}`,
    floor,
    geometry: feature.geometry,
  };
};

const getRoomFeaturesByPriority = (features: MazeMapFeature[]) =>
  features
    .map((feature) => ({ feature, priority: getRoomFeaturePriority(feature) }))
    .filter((item) => Number.isFinite(item.priority))
    .sort((a, b) => a.priority - b.priority)
    .map((item) => item.feature);

const getBestRoomTitleFromFeatures = (features: MazeMapFeature[]) =>
  features
    .map((feature) => getRoomLikeText(feature.properties ?? {}))
    .find((title) => getRoomCode(title));

const getNearbyRenderedFeatures = (map: MazeMapInstance, point: { x: number; y: number }) => {
  const padding = 52;

  return map.queryRenderedFeatures?.([
    [point.x - padding, point.y - padding],
    [point.x + padding, point.y + padding],
  ]) ?? [];
};

const emptyFeatureCollection: MazeMapFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

type MapPoint = [number, number];

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

const getRoomPolygonFeatures = (features: MazeMapFeature[]) =>
  features.filter((feature) => {
    const layerId = feature.layer?.id?.toLowerCase() ?? '';
    const geometryType = feature.geometry?.type.toLowerCase() ?? '';

    return geometryType.includes('polygon') && (layerId.includes('room') || layerId === 'mm-rooms');
  });

const getRoomLabelFeatures = (features: MazeMapFeature[]) =>
  features
    .map((feature) => ({
      code: normalizeRoomCode(getRoomLikeText(feature.properties ?? {})),
      center: getGeometryCenter(feature),
    }))
    .filter((label): label is { code: string; center: { x: number; y: number } } =>
      Boolean(label.code && label.center),
    );

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

  return Array.from(
    new Set(
      renderedFeatures
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

const syncMapViewToFloor = (map: MazeMapInstance, zLevel: number) => {
  map.resize?.();

  if (Number.isFinite(zLevel)) {
    map.setZLevel?.(zLevel);
  }

  map.setCenter?.(floorMapView.center);
  map.setZoom?.(floorMapView.zoom);
};

const MazeMapFloorMap = ({ floor, selectedRoomId, onSelectRoom, onFloorLevelChange }: MazeMapFloorMapProps) => {
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

          syncMapViewToFloor(map, floorZLevel);
          setRoomStatusOverlay(map, floor, document.getElementById(mapId), showGroupRoomColorsRef.current);
          setStatus('ready');
        };

        window.requestAnimationFrame(() => syncMapViewToFloor(map, floorZLevel));
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

    const handleClick = async (event: MazeMapMouseEvent) => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      const currentZLevel = map.getZLevel?.() ?? floorZLevel;
      const features = map.queryRenderedFeatures?.(event.point) ?? event.features ?? [];
      const nearbyFeatures = getNearbyRenderedFeatures(map, event.point);
      const exactCandidateTitle = getBestRoomTitleFromFeatures([...features, ...nearbyFeatures]);

      for (const selectedFeature of getRoomFeaturesByPriority(features)) {
        const baseSelection = getRoomSelectionFromFeature(selectedFeature, currentZLevel);

        if (!baseSelection) {
          continue;
        }

        let enrichedFeature: MazeMapFeature | undefined;

        if (baseSelection.poiId && mazemapRef.current?.Data?.getPoi) {
          try {
            const result = await mazemapRef.current.Data.getPoi(baseSelection.poiId);
            enrichedFeature = result && typeof result === 'object' ? result : undefined;
          } catch {
            enrichedFeature = undefined;
          }
        }

        const enrichedSelection = enrichedFeature ? getRoomSelectionFromFeature(enrichedFeature, currentZLevel) : null;
        const displaySelection = {
          ...baseSelection,
          ...enrichedSelection,
          geometry: enrichedSelection?.geometry ?? baseSelection.geometry,
          title:
            enrichedSelection?.title && !/^room \d+$/i.test(enrichedSelection.title)
              ? enrichedSelection.title
              : exactCandidateTitle ?? baseSelection.title,
        };

        if (!getRoomCode(displaySelection.title)) {
          continue;
        }

        setSelectedRoomHighlight(map, selectedFeature);
        onSelectRoom(displaySelection);
        return;
      }
    };

    mapRef.current.on?.('click', handleClick);

    return () => {
      mapRef.current?.off?.('click', handleClick);
    };
  }, [floorZLevel, onSelectRoom, status]);

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

      if (typeof zLevel !== 'number' || !Number.isFinite(zLevel) || zLevel === lastObservedZLevelRef.current) {
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

    syncMapViewToFloor(map, floorZLevel);
    refreshRoomStatusOverlay();
    window.requestAnimationFrame(() => {
      syncMapViewToFloor(map, floorZLevel);
      refreshRoomStatusOverlay();
    });
    const timeoutIds = [
      window.setTimeout(() => {
        syncMapViewToFloor(map, floorZLevel);
        refreshRoomStatusOverlay();
      }, 400),
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
