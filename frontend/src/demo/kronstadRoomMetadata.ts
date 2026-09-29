import type { RoomType } from '../types/campus';

export interface KronstadRoomMetadata {
  type: RoomType;
  capacity: number;
  access?: string;
}

export const kronstadRoomMetadata: Record<string, KronstadRoomMetadata> = {
  M206: { type: 'reading-room', capacity: 54, access: 'Tilrettelagt lesesalsplass' },
  M302: { type: 'reading-room', capacity: 48, access: 'Masterlesesal' },
  M306: { type: 'reading-room', capacity: 52, access: 'Masterlesesal, bookbar i TimeEdit' },
  M406: { type: 'reading-room', capacity: 52, access: 'Fri lesesal' },
  M407: { type: 'reading-room', capacity: 48, access: 'Fri lesesal' },
  M506: { type: 'reading-room', capacity: 52, access: 'Fri lesesal' },
  M507: { type: 'reading-room', capacity: 48, access: 'Fri lesesal' },
};

export const getKronstadRoomMetadata = (roomName: string) =>
  kronstadRoomMetadata[roomName.toUpperCase()];
