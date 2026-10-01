export interface MazeMapGlobal {
  Map: new (options: {
    container: string | HTMLElement;
    campuses: number;
    center: { lng: number; lat: number };
    zoom: number;
    zLevel: number;
    zLevelUpdater?: boolean;
    zLevelUpdaterType?: 'buildingsInView' | 'buildingClosestToCenter' | 'userFocused';
    zLevelControl?: boolean;
  }) => MazeMapInstance;
  Data?: {
    getPoi?: (poiId: number | string) => Promise<MazeMapFeature | false>;
  };
  MazeMarker?: new (options: { zLevel: number; element?: HTMLElement }) => MazeMapMarker;
}

export type MazeMapGeometry = {
  type: string;
  coordinates: unknown;
};

export interface MazeMapFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: MazeMapGeometry;
    properties: Record<string, unknown>;
  }>;
}

export interface MazeMapFeature {
  id?: string | number;
  type: 'Feature';
  layer?: {
    id?: string;
    source?: string;
  };
  geometry?: MazeMapGeometry;
  properties?: Record<string, unknown>;
  source?: string;
  sourceLayer?: string;
}

export interface MazeMapMouseEvent {
  lngLat: { lng: number; lat: number };
  point: { x: number; y: number };
  features?: MazeMapFeature[];
}

export interface MazeMapInstance {
  addLayer?: (layer: Record<string, unknown>, beforeId?: string) => void;
  addSource?: (id: string, source: Record<string, unknown>) => void;
  getLayer?: (id: string) => unknown;
  getSource?: (id: string) => { setData?: (data: MazeMapFeatureCollection) => void } | undefined;
  zLevelControl?: {
    setZLevels?: (zLevels: Record<number, string>) => void;
  };
  isStyleLoaded?: () => boolean;
  loaded?: () => boolean;
  getZLevel?: () => number;
  remove?: () => void;
  removeLayer?: (id: string) => void;
  removeSource?: (id: string) => void;
  resize?: () => void;
  setCenter?: (center: { lng: number; lat: number }) => void;
  setZoom?: (zoom: number) => void;
  setZLevel?: (zLevel: number) => void;
  off?: (type: string, listener: (event: MazeMapMouseEvent) => void) => void;
  on?: (type: string, listener: (event: MazeMapMouseEvent) => void) => void;
  once?: (type: string, listener: () => void) => void;
  queryRenderedFeatures?: (
    point: { x: number; y: number } | [[number, number], [number, number]],
    options?: { layers?: string[] },
  ) => MazeMapFeature[];
}

export interface MazeMapMarker {
  addTo: (map: MazeMapInstance) => MazeMapMarker;
  remove: () => void;
  setLngLat: (lngLat: { lng: number; lat: number }) => MazeMapMarker;
}

declare global {
  interface Window {
    Mazemap?: MazeMapGlobal;
  }
}
