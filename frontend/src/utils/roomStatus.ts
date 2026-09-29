import type { GroupRoom, GroupRoomStatus } from '../types/campus';

export const getGroupRoomStatus = (room: GroupRoom): GroupRoomStatus => {
  if (!room.booked) {
    return 'available';
  }

  return room.presenceDetected ? 'booked-in-use' : 'booked-unused';
};
