# Deploying the SeatSense frontend

The frontend (`frontend/`) is built into a static bundle and served by nginx in a
single container. There is no backend; all occupancy data is demo data.

| Item | Value |
| --- | --- |
| Compose service / container | `seatsense` |
| Internal port | `80` (HTTP, no TLS — Cloudflare terminates HTTPS) |
| Network | external Docker network `cloudflare`, alias `seatsense` |
| Published host ports | none |
| Cloudflare Tunnel service URL | `http://seatsense:80` |

Files: `docker-compose.yml` (repo root), `frontend/Dockerfile`,
`frontend/nginx.conf`, `frontend/.dockerignore`.

No build-time `VITE_*` environment variables are used, and no credentials or
tunnel tokens are stored in this repository.

## First deploy on docker01

```bash
git clone <repo-url> SeatSense
cd SeatSense
git checkout main        # or: git checkout dev  (dev = work in progress, main = stable)

# The shared network must exist (cloudflared joins it too).
docker network inspect cloudflare >/dev/null || docker network create cloudflare

docker compose up -d --build
docker compose ps
docker compose logs -f seatsense
```

In the Cloudflare Zero Trust dashboard, set the tunnel's public hostname
service to `http://seatsense:80`. The `cloudflared` container must be attached
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
