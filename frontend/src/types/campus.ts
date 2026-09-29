export type RoomType = 'group-room' | 'reading-room';
export type SeatStatus = 'available' | 'occupied' | 'recently-used' | 'offline';
export type GroupRoomStatus = 'available' | 'booked-unused' | 'booked-in-use';

export interface Seat {
  id: string;
  x: number;
  y: number;
  sensorOnline: boolean;
  presenceDetected: boolean;
  nodeId: string;
  lastPresenceAt: string | null;
  updatedAt: string;
}

export interface RoomDesk {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomFeature {
  id: string;
  label: string;
  type: 'door' | 'whiteboard' | 'window' | 'quiet-zone';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomLayout {
  width: number;
  height: number;
  boundary: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  desks: RoomDesk[];
  features: RoomFeature[];
}

interface BaseRoom {
  id: string;
  name: string;
  buildingId: string;
  floorId: string;
  capacity: number;
  updatedAt: string;
  mazeMapPoiId?: number;
  mazeMapIdentifier?: string;
  mazeMapArea?: number;
}

export interface GroupRoom extends BaseRoom {
  type: 'group-room';
  booked: boolean;
  presenceDetected: boolean;
  booking?: {
    start: string;
    end: string;
  };
}

export interface ReadingRoom extends BaseRoom {
  type: 'reading-room';
  seats: Seat[];
  layout: RoomLayout;
}

export type Room = GroupRoom | ReadingRoom;

export interface Floor {
  id: string;
  name: string;
  buildingId: string;
  mazeMapZLevel?: number;
  rooms: Room[];
}

export interface Building {
  id: string;
  name: string;
  campusName: string;
  description: string;
  floors: Floor[];
}

export interface Campus {
  id: string;
  name: string;
  buildings: Building[];
}

export interface OccupancySummary {
  available: number;
  occupied: number;
  recentlyUsed: number;
  offline: number;
  total: number;
  occupancyPercent: number;
}
