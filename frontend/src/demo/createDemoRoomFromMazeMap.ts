import type { MazeMapRoomSelection } from '../components/MazeMapFloorMap';

import type {
  GroupRoom,
  ReadingRoom,
  Room,
  RoomLayout,
  RoomType,
  Seat,
} from '../types/campus';

import { getSeatStatus } from '../utils/seatStatus';

import {
  hashToBoolean,
  hashToRange,
  pickFromHash,
  slugifyDemoId,
  stableHash,
} from './deterministicDemo';

import { getKronstadRoomMetadata } from './kronstadRoomMetadata';

import {
  classifyMazeMapRoom,
  getMazeMapRoomArea,
  getMazeMapRoomDisplayName,
  getMazeMapRoomIdentity,
} from './roomClassification';

/*
|--------------------------------------------------------------------------
| Demo configuration
|--------------------------------------------------------------------------
*/

export const DEMO_REFERENCE_NOW_MS = Date.UTC(2026, 0, 15, 10, 30, 0);

const DEMO_UPDATED_AT = new Date(
  DEMO_REFERENCE_NOW_MS - 12_000,
).toISOString();

const BOOKING_WINDOWS = [
  { start: '08:00', end: '10:00' },
  { start: '10:00', end: '12:00' },
  { start: '12:00', end: '14:00' },
  { start: '14:00', end: '16:00' },
  { start: '16:00', end: '18:00' },
];

/*
|--------------------------------------------------------------------------
| Reading-room layout configuration
|--------------------------------------------------------------------------
|
| HVL-style reading room:
|
|     S1  S2  S3  S4  S5  S6
|   ┌────────────────────────────┐
|   │       Study row            │
|   └────────────────────────────┘
|     S7  S8  S9 S10 S11 S12
|
*/

const SEATS_PER_SIDE = 6;
const SEATS_PER_ROW =
  SEATS_PER_SIDE * 2;

const RECENT_MINUTES_MIN = 1;
const RECENT_MINUTES_MAX = 9;

/*
|--------------------------------------------------------------------------
| Demo room ID
|--------------------------------------------------------------------------
*/

export const createDemoRoomId = (
  mazeRoom: Pick<
    MazeMapRoomSelection,
    'poiId' | 'identifier' | 'title' | 'floor'
  >,
) => {
  const identity =
    getMazeMapRoomIdentity(mazeRoom);

  return `maze-${slugifyDemoId(
    identity,
  )}-${stableHash(identity).toString(36)}`;
};

/*
|--------------------------------------------------------------------------
| Reading-room capacity
|--------------------------------------------------------------------------
|
| Prefer known Kronstad metadata when available.
|
| Otherwise use MazeMap room area as a rough demo estimate.
|
*/

const estimateReadingRoomCapacity = (
  seed: string,
  area?: number,
  knownCapacity?: number,
) => {
  if (
    knownCapacity !== undefined &&
    knownCapacity > 0
  ) {
    return knownCapacity;
  }

  if (area !== undefined) {
    if (area > 240) {
      return 48;
    }

    if (area > 170) {
      return 36;
    }

    if (area > 110) {
      return 24;
    }

    return 12;
  }

  /*
   * Stable deterministic fallback.
   */
  return pickFromHash(
    `${seed}:capacity`,
    [12, 24, 36, 48],
  );
};

/*
|--------------------------------------------------------------------------
| Reading-room layout
|--------------------------------------------------------------------------
|
| Instead of lots of small four-seat tables, reading rooms use long
| study benches like the actual reading halls.
|
*/

const createReadingRoomLayout = (
  roomId: string,
  capacity: number,
): RoomLayout => {
  const rowCount = Math.ceil(
    capacity / SEATS_PER_ROW,
  );

  const width = 900;

  const roomSidePadding = 35;

  const deskX = 145;
  const deskWidth = 610;
  const deskHeight = 72;

  /*
   * Leave enough room above the first desk for windows +
   * the top row of seats.
   */
  const firstRowY = 145;

  /*
   * Distance between one long desk and the next.
   *
   * Needs enough space for:
   * - bottom seats
   * - walkway
   * - next top seats
   */
  const rowSpacing = 185;

  const bottomPadding = 95;

  const height =
    firstRowY +
    Math.max(0, rowCount - 1) *
      rowSpacing +
    deskHeight +
    bottomPadding;

  const desks = Array.from(
    { length: rowCount },
    (_, index) => ({
      id: `${roomId}-study-row-${
        index + 1
      }`,

      label: `Study row ${index + 1}`,

      x: deskX,

      y:
        firstRowY +
        index * rowSpacing,

      width: deskWidth,
      height: deskHeight,
    }),
  );

  return {
    width,
    height,

    boundary: {
      x: roomSidePadding,
      y: 35,

      width:
        width -
        roomSidePadding * 2,

      height: height - 70,
    },

    desks,

    features: [
      {
        id: `${roomId}-windows`,
        label: 'Windows',
        type: 'window',

        x: 180,
        y: 50,

        width: 500,
        height: 25,
      },

      {
        id: `${roomId}-door`,
        label: 'Door',
        type: 'door',

        x: width - 130,
        y: height - 82,

        width: 70,
        height: 36,
      },
    ],
  };
};

/*
|--------------------------------------------------------------------------
| Demo time helpers
|--------------------------------------------------------------------------
*/

const seatTime = (
  minutesAgo: number,
) =>
  new Date(
    Date.parse(DEMO_UPDATED_AT) -
      minutesAgo * 60 * 1000,
  ).toISOString();

/*
|--------------------------------------------------------------------------
| Individual seat creation
|--------------------------------------------------------------------------
*/

const createReadingSeat = (
  index: number,
  x: number,
  y: number,
  seed: string,
): Seat => {
  const statusRoll =
    stableHash(
      `${seed}:seat:${index}`,
    ) % 100;

  /*
   * Stable demo distribution:
   *
   * 0-5   => offline
   * 6-33  => occupied
   * 34-53 => recently used
   * 54+   => available
   */

  const sensorOnline =
    statusRoll >= 6;

  const presenceDetected =
    sensorOnline &&
    statusRoll >= 6 &&
    statusRoll < 34;

  let lastPresenceAt: string | null;

  if (!sensorOnline) {
    lastPresenceAt = null;
  } else if (presenceDetected) {
    lastPresenceAt = seatTime(0);
  } else if (statusRoll < 54) {
    lastPresenceAt = seatTime(
      hashToRange(
        `${seed}:recent:${index}`,
        RECENT_MINUTES_MIN,
        RECENT_MINUTES_MAX,
      ),
    );
  } else {
    lastPresenceAt = seatTime(
      hashToRange(
        `${seed}:old:${index}`,
        18,
        90,
      ),
    );
  }

  return {
    id: `S${index + 1}`,

    x,
    y,

    sensorOnline,
    presenceDetected,

    /*
     * Physical architecture:
     *
     * 1 ESP32
     * -> 4 LD2410C sensors
     * -> 4 seats
     *
     * S1-S4   -> node-01
     * S5-S8   -> node-02
     * S9-S12  -> node-03
     */
    nodeId: `node-${String(
      Math.floor(index / 4) + 1,
    ).padStart(2, '0')}`,

    lastPresenceAt,

    updatedAt: sensorOnline
      ? DEMO_UPDATED_AT
      : seatTime(
          hashToRange(
            `${seed}:offline:${index}`,
            12,
            120,
          ),
        ),
  };
};

/*
|--------------------------------------------------------------------------
| Reading-room seat placement
|--------------------------------------------------------------------------
|
| Each long study row contains:
|
| 6 seats on top
| 6 seats on bottom
|
| Seats are evenly distributed along the bench.
|
*/

const createReadingRoomSeats = (
  layout: RoomLayout,
  seed: string,
  capacity: number,
): Seat[] => {
  const positions: Array<{
    x: number;
    y: number;
  }> = [];

  for (const desk of layout.desks) {
    /*
     * Keep the first and last seats slightly away from the ends.
     */
    const horizontalPadding = 42;

    const usableWidth =
      desk.width -
      horizontalPadding * 2;

    const seatSpacing =
      usableWidth /
      (SEATS_PER_SIDE - 1);

    /*
     * Top side
     */
    for (
      let index = 0;
      index < SEATS_PER_SIDE;
      index++
    ) {
      positions.push({
        x:
          desk.x +
          horizontalPadding +
          index * seatSpacing -
          17,

        y: desk.y - 40,
      });
    }

    /*
     * Bottom side
     */
    for (
      let index = 0;
      index < SEATS_PER_SIDE;
      index++
    ) {
      positions.push({
        x:
          desk.x +
          horizontalPadding +
          index * seatSpacing -
          17,

        y:
          desk.y +
          desk.height +
          8,
      });
    }
  }

  return positions
    .slice(0, capacity)
    .map((position, index) =>
      createReadingSeat(
        index,
        position.x,
        position.y,
        seed,
      ),
    );
};

/*
|--------------------------------------------------------------------------
| Group room
|--------------------------------------------------------------------------
*/

const createDemoGroupRoom = (
  mazeRoom: MazeMapRoomSelection,
  seed: string,
  floorId?: string,
): GroupRoom => {
  const name =
    getMazeMapRoomDisplayName(
      mazeRoom,
    );

  const booked =
    hashToBoolean(
      `${seed}:booked`,
      62,
    );

  const presenceDetected =
    booked &&
    hashToBoolean(
      `${seed}:presence`,
      48,
    );

  const capacity =
    pickFromHash(
      `${seed}:capacity`,
      [4, 4, 6, 6, 8, 10],
    );

  return {
    id:
      createDemoRoomId(
        mazeRoom,
      ),

    name,

    type: 'group-room',

    buildingId: 'kronstad',

    floorId:
      floorId ??
      `floor-${Math.max(
        1,
        mazeRoom.floor,
      )}`,

    capacity,

    updatedAt:
      DEMO_UPDATED_AT,

    mazeMapPoiId:
      mazeRoom.poiId,

    mazeMapIdentifier:
      mazeRoom.identifier,

    mazeMapArea:
      mazeRoom.area ??
      getMazeMapRoomArea(
        mazeRoom.geometry,
      ),

    booked,

    presenceDetected,

    booking: booked
      ? pickFromHash(
          `${seed}:booking`,
          BOOKING_WINDOWS,
        )
      : undefined,
  };
};

/*
|--------------------------------------------------------------------------
| Reading room
|--------------------------------------------------------------------------
*/

const createDemoReadingRoom = (
  mazeRoom: MazeMapRoomSelection,
  seed: string,
  floorId?: string,
): ReadingRoom => {
  const name =
    getMazeMapRoomDisplayName(
      mazeRoom,
    );

  const area =
    mazeRoom.area ??
    getMazeMapRoomArea(
      mazeRoom.geometry,
    );

  /*
   * If we know the actual room capacity from Kronstad metadata,
   * use it.
   */
  const metadata =
    getKronstadRoomMetadata(
      mazeRoom.title,
    );

  const targetCapacity =
    metadata?.capacity;

  /*
   * Otherwise derive a sensible capacity from room size.
   */
  const capacity =
    estimateReadingRoomCapacity(
      seed,
      area,
      targetCapacity,
    );

  const id =
    createDemoRoomId(
      mazeRoom,
    );

  /*
   * Layout is now generated from seat capacity rather than from
   * a number of small tables.
   */
  const layout =
    createReadingRoomLayout(
      id,
      capacity,
    );

  const seats =
    createReadingRoomSeats(
      layout,
      seed,
      capacity,
    );

  return {
    id,

    name,

    type: 'reading-room',

    buildingId: 'kronstad',

    floorId:
      floorId ??
      `floor-${Math.max(
        1,
        mazeRoom.floor,
      )}`,

    capacity: seats.length,

    updatedAt:
      DEMO_UPDATED_AT,

    mazeMapPoiId:
      mazeRoom.poiId,

    mazeMapIdentifier:
      mazeRoom.identifier,

    mazeMapArea: area,

    layout,

    seats,
  };
};

/*
|--------------------------------------------------------------------------
| Main MazeMap -> SeatSense adapter
|--------------------------------------------------------------------------
*/

export interface CreateDemoRoomOptions {
  /*
   * SeatSense floor id (e.g. 'floor-1'). Pass this when the caller knows
   * the app floor, because `mazeRoom.floor` may be a MazeMap z-level.
   * Not part of any seed, so it never changes generated values.
   */
  floorId?: string;

  /*
   * Explicit room type (e.g. from known room data). Overrides metadata-based
   * classification. Not part of any seed.
   */
  type?: RoomType;
}

export const createDemoRoomFromMazeMap = (
  mazeRoom: MazeMapRoomSelection,
  options: CreateDemoRoomOptions = {},
): Room => {
  const seed =
    getMazeMapRoomIdentity(
      mazeRoom,
    );

  const type =
    options.type ??
    classifyMazeMapRoom(
      mazeRoom,
    );

  return type === 'group-room'
    ? createDemoGroupRoom(
        mazeRoom,
        seed,
        options.floorId,
      )
    : createDemoReadingRoom(
        mazeRoom,
        seed,
        options.floorId,
      );
};

/*
|--------------------------------------------------------------------------
| Reading-room occupancy summary
|--------------------------------------------------------------------------
*/

export const summarizeReadingSeats = (
  seats: Seat[],
  nowMs = DEMO_REFERENCE_NOW_MS,
) => {
  const available =
    seats.filter(
      (seat) =>
        getSeatStatus(
          seat,
          nowMs,
        ) === 'available',
    ).length;

  const occupied =
    seats.filter(
      (seat) =>
        getSeatStatus(
          seat,
          nowMs,
        ) === 'occupied',
    ).length;

  const recentlyUsed =
    seats.filter(
      (seat) =>
        getSeatStatus(
          seat,
          nowMs,
        ) ===
        'recently-used',
    ).length;

  const offline =
    seats.filter(
      (seat) =>
        getSeatStatus(
          seat,
          nowMs,
        ) === 'offline',
    ).length;

  const total =
    seats.length;

  const occupancyPercent =
    total > 0
      ? Math.round(
          (occupied / total) *
            100,
        )
      : 0;

  return {
    available,
    occupied,
    recentlyUsed,
    offline,
    total,
    occupancyPercent,
  };
};

/*
|--------------------------------------------------------------------------
| MazeMap room -> URL search params
|--------------------------------------------------------------------------
*/

export const mazeMapRoomToSearchParams = (
  room: MazeMapRoomSelection,
) => {
  const params =
    new URLSearchParams({
      title: room.title,
      floor: String(
        room.floor,
      ),
    });

  if (
    room.poiId !== undefined
  ) {
    params.set(
      'poiId',
      String(room.poiId),
    );
  }

  if (room.identifier) {
    params.set(
      'identifier',
      room.identifier,
    );
  }

  const area =
    room.area ??
    getMazeMapRoomArea(
      room.geometry,
    );

  if (
    area !== undefined
  ) {
    params.set(
      'area',
      String(area),
    );
  }

  return params;
};

/*
|--------------------------------------------------------------------------
| URL search params -> MazeMap room
|--------------------------------------------------------------------------
*/

export const mazeMapRoomFromSearchParams = (
  roomId: string,
  params: URLSearchParams,
): MazeMapRoomSelection => ({
  poiId:
    params.get('poiId')
      ? Number(
          params.get(
            'poiId',
          ),
        )
      : undefined,

  identifier:
    params.get(
      'identifier',
    ) ?? roomId,

  title:
    params.get(
      'title',
    ) ?? roomId,

  floor: Number(
    params.get(
      'floor',
    ) ?? 1,
  ),

  area:
    params.get('area')
      ? Number(
          params.get(
            'area',
          ),
        )
      : undefined,
});
