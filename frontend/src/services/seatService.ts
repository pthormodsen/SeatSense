import {
  campus,
  findBuilding,
  findFloor,
  findRoom,
  summarizeBuildings,
  summarizeFloors,
  summarizeRooms,
  summarizeSeats,
} from '../data/mockCampus';

export const seatService = {
  getCampus: () => campus,
  getBuilding: findBuilding,
  getFloor: findFloor,
  getRoom: findRoom,
  summarizeSeats,
  summarizeRooms,
  summarizeFloors,
  summarizeBuildings,
};
