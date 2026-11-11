# Deploying SeatSense

Two containers:
- `seatsense`: the frontend (`frontend/`), a static bundle served by nginx.
- `seatsense-backend`: the live sensor API (`backend/`, Node).

nginx forwards `/api/` to the backend over a private Docker network, so nginx
is the only entry point. The building, floor and room pages show demo data.
Only `/live` shows real sensor data (see `LIVE_SENSOR.md`).

| Item | Value |
| --- | --- |
| Compose service / container | `seatsense` |
| Internal port | `80` (HTTP, no TLS — Cloudflare terminates HTTPS) |
| Network | external Docker network `cloudflare`, alias `seatsense` |
| Published host ports | none |
| Cloudflare Tunnel service URL | `http://seatsense:80` |
| Backend container | `seatsense-backend`, port 3001, only on the private `internal` network |
| Backend config | `DEVICE_TOKENS` in `.env` next to `docker-compose.yml` (see `.env.example`) |
| Backend data | Event log `/data/events.jsonl` on the named volume `backend-data` |

Files: `docker-compose.yml` (repo root), `frontend/Dockerfile`,
`frontend/nginx.conf`, `frontend/.dockerignore`.

No build-time `VITE_*` environment variables are used, and no credentials or
tunnel tokens are stored in this repository. The sensor device tokens live
only in `.env` on the server, which is git-ignored, and in each sensor's
git-ignored `include/secrets.h`.

## First deploy on docker01

```bash
git clone <repo-url> SeatSense
cd SeatSense
git checkout main        # or: git checkout dev  (dev = work in progress, main = stable)

# The shared network must exist (cloudflared joins it too).
docker network inspect cloudflare >/dev/null || docker network create cloudflare

# Sensor tokens for the backend (one sensorId:token pair per physical sensor).
cp .env.example .env && nano .env        # e.g. DEVICE_TOKENS=seat-001:$(openssl rand -hex 24)

docker compose up -d --build
docker compose ps
docker compose logs -f seatsense
```

In the Cloudflare Zero Trust dashboard, set the tunnel's public hostname
service to `http://seatsense:80`. Nothing changes for the tunnel: `/api` goes
through the same hostname. The `/api/sensors/:id/stream` route is an SSE
stream; nginx disables buffering for it, and the backend sends a keepalive
every 15 s so idle streams stay open. The `cloudflared` container must be attached
to the same `cloudflare` network.

## Updating

```bash
cd SeatSense
git pull && docker compose up -d --build
```

## Testing without the tunnel

No port is published on the host. Check the container from inside the network:

```bash
docker run --rm --network cloudflare curlimages/curl -s http://seatsense/ | head
docker run --rm --network cloudflare curlimages/curl -sI http://seatsense/room/test
docker inspect --format '{{.State.Health.Status}}' seatsense
docker run --rm --network cloudflare curlimages/curl -s http://seatsense/api/health
docker inspect --format '{{.State.Health.Status}}' seatsense-backend
docker compose logs -f backend        # readings, rejected uploads, online/offline
```

If the backend is down, the site still loads and `/api` returns 502.

The event log survives `docker compose down` and `up --build`. Only
`docker compose down -v` deletes the volume, and with it the pilot history.
Back it up with:

```bash
docker cp seatsense-backend:/data/events.jsonl ./events-$(date +%F).jsonl
```

Or from inside the container itself:

```bash
docker exec seatsense wget -qO- http://127.0.0.1/ | head
```

For temporary browser access, publish a port ad hoc without editing the
committed compose file:

```bash
docker run --rm -p 8080:80 seatsense-frontend:latest   # then open http://localhost:8080
```

## Stopping

```bash
docker compose down
```
