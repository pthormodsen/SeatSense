# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

SeatSense is a study-seat occupancy system with three parts:

1. **Firmware** (repo root, PlatformIO): an ESP32-S3 reads an HLK-LD2410C 24 GHz mmWave presence sensor over UART, prints the seat state to serial and (if `include/secrets.h` exists) uploads readings over HTTPS.
2. **Backend** (`backend/`): a small Node/TypeScript live-sensor API with no dependencies. It appends every event to a JSON Lines file (`EVENTS_FILE`, a Docker volume; no database), keeps the latest state and the last 500 events per sensor in memory (restored from the file at startup) and pushes them to browsers over SSE.
3. **Frontend** (`frontend/`): a React + Vite + Tailwind dashboard for Campus Kronstad (building → floor → room → seat). Everything except `/live` is **mock/demo data** via `seatService`; `/live` shows one real sensor via `liveSensorService`.

The live sensor contract is documented in `LIVE_SENSOR.md`. It is defined in `backend/src/types.ts`, copied to `frontend/src/types/liveSensor.ts` and produced by `src/reading_json.cpp`; change all three together. Do not add MQTT, a database or other infrastructure unless asked.

## Workflow

- Do development on the `dev` branch, not `main`.
- Do not commit or push unless asked.
- Commits: small, logical steps. The repository owner is the only author: no `Co-Authored-By` trailers or any other Claude/AI attribution in commit messages.
- A change is not finished until it passes the validation below.

## Validation

Only the backend has automated tests. At minimum:

- Backend changes: `npm test` in `backend/` must succeed. Contract changes: also `backend/scripts/check-firmware-json.sh`.
- Firmware changes: `pio run` must succeed, and `test/host/run.sh` if `seat_filter` changed (it builds without `include/secrets.h`, with networking disabled). If the frame format or chip changed, recompile the chip and check `OCCUPIED`/`AVAILABLE` output in Wokwi.
- Frontend changes: `npm run build` in `frontend/` must succeed (this runs the TypeScript check).
- A change that touches both parts must pass both.

## Do not change casually

These values match real hardware, MazeMap, or demo behavior that people depend on. Change them only when asked, and update every place that depends on them:

- UART pins (`LD2410C_RX_PIN = 17`, `LD2410C_TX_PIN = 18`) and baud rate (256000) in `src/main.cpp`. They match the physical wiring and the LD2410C default.
- The 23-byte LD2410C frame format. It is shared between `src/main.cpp` and `chips/ld2410c.chip.c`.
- MazeMap floor mapping (`M1`–`M5` → z-levels 2–6), campus id 9, and the map center in `frontend/src/data/mazeMapPlacements.ts`.
- Deterministic demo behavior: the hash functions in `deterministicDemo.ts`, `DEMO_REFERENCE_NOW_MS`, the hash seed strings, and `GROUP_ROOM_AREA_THRESHOLD`. Changing them alters every generated room, so room links that have already been shared would show different data.

## Commands

### Firmware (run from repo root)

```sh
pio run                     # build for env esp32-s3-devkitm-1
pio run --target upload     # flash real hardware
pio device monitor          # serial monitor, 115200 baud
wokwi-cli chip compile chips/ld2410c.chip.c -o chips/ld2410c.chip.wasm   # rebuild custom sim chip
```

Simulation: build firmware and compile the chip, then start Wokwi from `diagram.json` in VS Code. `wokwi.toml` points at `.pio/build/esp32-s3-devkitm-1/firmware.{bin,elf}` and `chips/ld2410c.chip.wasm`. Wokwi uses an ESP32-S3 DevKitC-1 board because it has no DevKitM-1 part; the firmware still targets `esp32-s3-devkitm-1`.

### Frontend (run from `frontend/`)

```sh
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build (this is the type check)
npm run preview
```

### Backend (run from `backend/`)

```sh
npm install
npm run dev       # reads .env (DEVICE_TOKENS), listens on 3001
npm test          # tsc + node:test API tests
DEVICE_TOKEN=... ./scripts/send-reading.sh loop   # simulated sensor
```

### Deployment

Production is k3s (namespace `apps`). GitHub Actions builds `ghcr.io/pthormodsen/seatsense` and `-backend` on push to `main`. The backend manifest is in `k8s/seatsense-backend.yaml`; the frontend Deployment lives outside this repo and needs `SEATSENSE_BACKEND_URL`. `frontend/nginx.conf.template` takes its resolver and backend URL from the environment, so the same image works in k3s and Compose. See `DEPLOYMENT.md`.

For local or single-host testing (run from repo root), `docker compose up -d --build` builds `frontend/Dockerfile` (nginx, no published ports, joins external network `cloudflare` as `seatsense`) and `backend/Dockerfile` (private `internal` network only; nginx proxies `/api/`). `DEVICE_TOKENS` comes from `.env`. See `DEPLOYMENT.md`.

Only the backend has tests; there are no linters (`test/` is the PlatformIO placeholder).

## Firmware architecture

- `src/main.cpp` holds the radar part of the firmware. It byte-syncs on the LD2410C frame header `F4 F3 F2 F1`, buffers fixed 23-byte frames, validates the footer `F8 F7 F6 F5`, data length 13, and the `0x02 0xAA ... 0x55 0x00` markers, then parses target type, moving/stationary distance (little-endian u16) and energy.
- Networking is in `src/network.cpp`: a FreeRTOS task on core 0 that takes readings from a queue, so it never blocks UART parsing. It handles Wi-Fi, NTP, and HTTPS verified against `src/root_ca.h`. `main.cpp` queues the debounced seat state on every change and as a 10 s heartbeat. The JSON body is built in `src/reading_json.cpp`. Credentials are in the git-ignored `include/secrets.h` (template: `include/secrets.example.h`).
- Seat state is decided in `src/seat_filter.cpp`, which has no Arduino dependencies and is host-tested with `test/host/run.sh`. Only targets within `SEAT_MAX_DISTANCE_CM` (150) count. AVAILABLE → OCCUPIED needs a target at or above the ENTER energy for `OCCUPIED_CONFIRM_MS`. It stays OCCUPIED while a target is at or above the lower STAY energy, and is released after `SEAT_RELEASE_MS`. The pilot settings are at the top of `main.cpp`. The raw radar values are uploaded unchanged. Output is printed only when occupancy or radar values change.
- UART pins: `LD2410C_RX_PIN = 17`, `LD2410C_TX_PIN = 18` at 256000 baud (sensor TX → GPIO17, sensor RX → GPIO18).
- `chips/ld2410c.chip.c` is a Wokwi custom chip that emits the same 23-byte frame every 250 ms from runtime attributes (`presence`, `targetType`, `movingDistance`, `stationaryDistance`, `movingEnergy`, `stationaryEnergy`). **If the frame format changes, update both the chip and `main.cpp`**, and recompile the `.wasm` (it is committed).

## Frontend architecture

- **Routes** (`src/App.tsx`): `/`, `/building/:buildingId`, `/building/:buildingId/floor/:floorId`, `/room/:roomId`, `/live`.
- **Live sensor** (`pages/Live.tsx`, `services/liveSensorService.ts`): fetches the state and event log from `/api`, then follows the SSE stream (it reconnects by itself). It shows status, raw radar values, an event timeline, ground-truth notes and a CSV export. In development, Vite proxies `/api` to `localhost:3001`.
- **Data access** goes through `src/services/seatService.ts`, a thin facade over `src/data/mockCampus.ts`. Swapping in a real backend should happen behind this service.
- **Domain types** live in `src/types/campus.ts`. `Room` is a discriminated union on `type`: `group-room` (booking + single presence flag, no seats) vs. `reading-room` (seats + a `RoomLayout`). Seat status (`available | occupied | recently-used | offline`) is derived, not stored — see `utils/seatStatus.ts` (recently-used window = 10 min) and `utils/roomStatus.ts` for group rooms.
- **MazeMap integration** (`components/MazeMapFloorMap.tsx`): loads the MazeMap JS SDK v2.1.2 from CDN at runtime, shows Kronstad (campus id 9), overlays room-status GeoJSON layers, and reports room clicks / floor-level changes. App floors `M1`–`M5` map to MazeMap z-levels 2–6 in `data/mazeMapPlacements.ts`.
- **Demo room generation** (`src/demo/`): any room clicked on the map — not only those in `mockCampus` — becomes a full `Room` via `createDemoRoomFromMazeMap`. Everything is **deterministic**: values come from FNV-style hashes of the room id (`deterministicDemo.ts`) and a fixed clock `DEMO_REFERENCE_NOW_MS` (2026-01-15 10:30 UTC), so the same room always renders identically. Room type for known rooms is explicit (`type` in `mockCampus.ts`); generated rooms use `classifyMazeMapRoom` (`roomClassification.ts`): `kronstadRoomMetadata.ts` first, else polygon area (< `GROUP_ROOM_AREA_THRESHOLD` = 75 m² → `group-room`, else `reading-room`), else a stable hash. The map overlay resolves every labelled polygon via `seatService.resolveMazeMapRoom` and colours only rooms whose `type === 'group-room'` (booking/presence state); reading rooms are never coloured but stay clickable. Rooms not in mock data are passed to `/room/:roomId` through URL search params (`mazeMapRoomToSearchParams` / `mazeMapRoomFromSearchParams`); `Room.tsx` falls back to regenerating from those params when `seatService.getRoom` misses.
- Status colors/classes are centralized in `components/statusStyles.ts`.
