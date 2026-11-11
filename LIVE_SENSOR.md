# Live sensor integration

One physical seat sensor (ESP32-S3 + HLK-LD2410C) reports to the backend, and
the `/live` page shows it in real time. The rest of the site still uses demo
data.

```
ESP32-S3 + LD2410C ──HTTPS POST──▶ Cloudflare Tunnel ──▶ nginx (/api/*) ──▶ backend (Node)
                                                                              │
Browser /live ◀──────────── Server-Sent Events (SSE) ─────────────────────────┘
```

- **Prototype choices:** HTTPS POST rather than MQTT, and no database. Every
  event is appended to a JSON Lines file. The last 500 events per sensor are
  kept in memory and loaded back from the file at startup.
- **Production direction (not built):** MQTT over TLS with a broker and
  persistent, aggregated history.

## API

The contract is defined in `backend/src/types.ts`. It is copied to
`frontend/src/types/liveSensor.ts` and produced by `src/reading_json.cpp`
(firmware). Keep all three in sync. `backend/scripts/check-firmware-json.sh`
checks the firmware's JSON against the backend validator.

### `POST /api/sensors/:id/readings` (sensor → server)

Header: `Authorization: Bearer <device token>`. Body (JSON, max 4 KB):

| Field | Type | Notes |
| --- | --- | --- |
| `sensorId` | string | **Required.** Must equal `:id`. |
| `occupied` | `true` / `false` / `null` | **Required.** `null` = node alive but radar sends no valid frames. |
| `sentAt` | ISO 8601 string / `null` | Sensor clock when the reading was produced; `null` before NTP sync. |
| `seq` | integer ≥ 0 | Per-boot counter. Gaps = dropped/failed uploads. |
| `targetType` | 0–3 | 0 none, 1 moving, 2 stationary, 3 both. |
| `movingCm`, `stationaryCm` | 0–65535 | Radar distances. |
| `movingEnergy`, `stationaryEnergy` | 0–255 | LD2410C reports 0–100. |
| `rssi` | −127–0 | Wi-Fi signal, dBm. |
| `uptimeMs` | integer ≥ 0 | Time since node boot. |

All fields except `sensorId` and `occupied` are optional (`null` if omitted).
Unknown fields are ignored.

Responses:
- `200 {"ok":true,"receivedAt":…,"latencyMs":…}`
- `400` invalid JSON or fields (the message says which)
- `401` missing or wrong token, or unknown sensor
- `413` body too large
- `415` not JSON

Rejected uploads are logged by the backend.

### `GET /api/sensors/:id`

Latest state: every reading field, plus:
- `online`
- `lastReceivedAt` (server time)
- `latencyMs` (`lastReceivedAt − sentAt`)

`404` if the sensor is not configured.

### `GET /api/sensors/:id/events`

`{"events":[…]}`, oldest first, at most `MAX_EVENTS` (500). Each event has
`id`, `type`, `at` (server time), `latencyMs` and the reading fields.

Event types:

| Type | When it is logged |
| --- | --- |
| `online` | First reading, or the first reading after being offline. |
| `occupancy-change` | `occupied` differs from the previous reading. |
| `heartbeat` | Same occupancy as before. |
| `offline` | No reading for `OFFLINE_AFTER_MS` (30 s). The reading fields are `null`. |

### `GET /api/sensors/:id/stream` (SSE)

The stream sends these messages:
- `event: snapshot` once on connect, with `{state, event: null, pushedAt}`.
- `event: update` for every new event, with `{state, event, pushedAt}`.
- A `: keepalive` comment every 15 s.

Offline detection runs on the server every second, so viewers see `offline`
even when the sensor goes completely silent. At most `MAX_STREAM_CLIENTS` (100)
streams can be open at once; beyond that the server returns `503`.

### Also

- `GET /api/sensors` lists all configured sensors with their state.
- `GET /api/health` is used by the container health check.

### Backend configuration (environment)

| Variable | Default | |
| --- | --- | --- |
| `DEVICE_TOKENS` | – | `seat-001:<token>,seat-002:<token>`. Only these sensors exist. Tokens ≥ 16 chars (`openssl rand -hex 24`). |
| `OFFLINE_AFTER_MS` | 30000 | |
| `MAX_EVENTS` | 500 | Per sensor. |
| `MAX_STREAM_CLIENTS` | 100 | |
| `SSE_KEEPALIVE_MS` | 15000 | |
| `PORT` | 3001 | |
| `EVENTS_FILE` | – (Docker: `/data/events.jsonl`) | Append-only event log. Empty = memory only. |

### Event log file

- **Format:** every event (`online`, `occupancy-change`, `heartbeat`,
  `offline`) is appended to `EVENTS_FILE` as one JSON line. Each line has the
  same fields as `GET /events`.
- **Never shortened:** the file is the complete pilot history. Expect roughly
  2–3 MB per sensor per day with a 10 s heartbeat.
- **At startup** the file is read line by line:
  - the newest `MAX_EVENTS` per sensor are loaded into memory
  - the latest state is rebuilt, and event ids continue after the highest one
  - invalid lines and sensors no longer in `DEVICE_TOKENS` are skipped and
    counted in the log
- **After a restart:** a sensor whose last event was a reading counts as online
  from that reading's time. If it does not report again within
  `OFFLINE_AFTER_MS`, an `offline` event is logged.
- **Write errors** are logged (`[events] … NOT being persisted`), but the API
  keeps running.
- **In Docker** the file lives on the `backend-data` volume and survives
  restarts and image rebuilds. To copy it out for analysis:

  ```sh
  docker cp seatsense-backend:/data/events.jsonl ./events.jsonl
  ```

## Firmware configuration: `include/secrets.h`

```sh
cp include/secrets.example.h include/secrets.h   # git-ignored
```

Set these values:
- `WIFI_SSID` and `WIFI_PASSWORD`: a 2.4 GHz WPA2-Personal network, e.g. a
  phone hotspot. eduroam does not work.
- `API_BASE_URL`: e.g. `https://<your-site>` (no trailing slash).
- `SENSOR_ID` and `DEVICE_TOKEN`: must match an entry in the backend's
  `DEVICE_TOKENS`.

Without `secrets.h` the firmware still builds and runs, with networking
disabled (you get a compile warning).

How the firmware works:
- **HTTPS:** the server certificate is verified against the root CAs in
  `src/root_ca.h`. These are the Let's Encrypt, Google Trust Services and
  SSL.com roots, which are the CAs Cloudflare uses. Verification is never
  disabled.
- **Plain HTTP:** `http://` URLs are allowed for local testing only, e.g. the
  backend on your laptop.
- **Radar and uploads never block each other:** the radar loop hands readings
  to a FreeRTOS network task (core 0) through a queue of 8.
- **When readings are sent:** immediately when the debounced seat state
  changes, plus a heartbeat every 10 s.
- **Queue overflow:** the oldest reading is dropped and counted.
- **Failed uploads:** retried after 2 s and then 4 s, at most 3 attempts. A
  4xx response is not retried. Every failure is printed.
- **Wi-Fi drops:** readings are queued and the node reconnects.
- **Status line:** every 30 s the serial output shows
  `[net] wifi=… ntp=… sent=… failed=… dropped=… queued=…`.

## Running locally

```sh
# Backend (terminal 1)
cd backend
npm install
cp .env.example .env                     # set DEVICE_TOKENS
npm run dev                              # http://localhost:3001

# Frontend (terminal 2); Vite proxies /api to localhost:3001
cd frontend
npm run dev                              # open /live

# Simulated sensor (terminal 3)
cd backend
DEVICE_TOKEN=<token> ./scripts/send-reading.sh true    # occupied
DEVICE_TOKEN=<token> ./scripts/send-reading.sh false   # available
DEVICE_TOKEN=<token> ./scripts/send-reading.sh null    # radar silent
DEVICE_TOKEN=<token> ./scripts/send-reading.sh loop    # heartbeat / 10 s, flips every 30 s
```

Plain curl:

```sh
curl -X POST http://localhost:3001/api/sensors/seat-001/readings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -d '{"sensorId":"seat-001","occupied":true,"sentAt":"2026-11-11T09:30:00Z","targetType":2,"stationaryCm":80,"stationaryEnergy":30}'
```

Stop sending and `/live` shows **Offline** after 30 s.

## Tests

```sh
cd backend && npm test                     # 19 tests (API + event log)
cd backend && ./scripts/check-firmware-json.sh  # firmware JSON vs backend validator
cd frontend && npm run build               # type check
pio run                                    # firmware, with and without secrets.h
```

The backend tests cover:
- valid and minimal readings
- invalid, oversized and wrongly-typed bodies
- missing, wrong and cross-sensor tokens
- latest state and the event log (classification and the 500 cap)
- SSE snapshot and updates, per-sensor filtering, and the client limit
- offline detection and reconnection
- shutdown closing open streams
- config validation
- the event log: appending every event, restoring the last `MAX_EVENTS` per
  sensor with state and ids after a restart, offline after restart, skipping
  invalid lines and removed sensors

The backend Docker image runs the tests during the build.

### Wokwi

Wokwi runs in the cloud, so it cannot reach a backend on `localhost`. Use a
public `https://` URL (the deployed site) in `secrets.h`. Set
`WIFI_SSID "Wokwi-GUEST"` and an empty password. Then:

```sh
pio run
WOKWI_CLI_TOKEN=<your token> wokwi-cli --timeout 60000 .
```

Expect `[net] Wi-Fi connected`, then readings arriving on `/live`. This has
**not been run yet**: it needs your Wokwi token.

## Hardware test with a phone hotspot

1. Turn on a 2.4 GHz hotspot. On iPhone, enable "Maximise Compatibility".
2. Fill in `include/secrets.h`:
   - **Deployed site:** `API_BASE_URL "https://<site>"`, using the token from
     the server's `.env`.
   - **Laptop backend:** connect the laptop to the same hotspot, run
     `npm run dev` in `backend/`, and use `API_BASE_URL "http://<laptop-ip>:3001"`.
     Find the IP with `ipconfig getifaddr en0`. Allow incoming connections for
     node if macOS asks.
3. `pio run --target upload && pio device monitor`. Check the serial output
   for:
   - `[net] Wi-Fi connected, IP …`
   - no `[net] … rejected` or `failed` lines
   - `sent=` increasing in the status line
4. Open `/live` and check:
   - status, raw values and the timeline update within ~1 s of the serial
     `[SeatSense]` line
   - RSSI and uptime look right
   - sensor → server latency is shown once NTP has synced
5. Turn the hotspot off. The page should show **Offline** after 30 s and
   **Online** again after you turn it back on.

### Reading-room pilot

During the pilot:
- Add ground-truth notes ("Person sat down", "bag on chair, no person") with
  the buttons on `/live`.
- Use **Export CSV** before closing the tab. The CSV holds every event
  (including heartbeats with raw radar values) and every note. The notes exist
  only in the tab, but the events are also in the server's event log file.
- Compare `occupancy` against your notes to count false positives and false
  negatives.

Scenarios to cover:
- a person sitting still
- a short absence
- movement at the neighbouring desk
- a bag or jacket without a person
- different desk layouts

## Known limitations

- **Not tested on real hardware yet:** Wi-Fi, TLS and NTP in the firmware have
  only been checked by compiling. The JSON format and every backend and
  frontend path are tested.
- **The event file is never rotated:** it grows by roughly 2–3 MB per sensor
  per day. The API returns only the last 500 events; the full history is in
  the file. The browser tab keeps up to 5,000 events while it is open.
- **Clock comparisons:** the latency figures compare clocks on different
  machines (NTP), so expect tens of ms of error. Server → browser assumes the
  viewer's clock is synced.
- **One shared token per device, over HTTPS:** no rotation and no rate
  limiting. MQTT over TLS with per-device credentials is the production
  direction.
- **Notes stay in the browser:** they are not stored on the server.
- **Short release time:** the firmware releases a seat after 5 s without a
  target (`AVAILABLE_CONFIRM_MS`). This is a prototype value; a real "coffee
  break" grace period is longer.
