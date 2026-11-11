# Deploying SeatSense

Two images, both built by GitHub Actions (`.github/workflows/docker.yml`) on
every push to `main`:

| Image | Source | What it is |
| --- | --- | --- |
| `ghcr.io/pthormodsen/seatsense` | `frontend/` | Static React build served by nginx. nginx also forwards `/api/` to the backend. |
| `ghcr.io/pthormodsen/seatsense-backend` | `backend/` | Live sensor API (Node). Its tests run during the image build. |

The building, floor and room pages show demo data. Only `/live` shows real
sensor data (see `LIVE_SENSOR.md`). Cloudflare terminates HTTPS. Everything
behind it is plain HTTP.

No credentials or tunnel tokens are stored in this repository. The sensor
device tokens live only in a Kubernetes Secret (or `.env` for Compose) and in
each sensor's git-ignored `include/secrets.h`.

## nginx configuration (both setups)

`frontend/nginx.conf.template` is rendered when the container starts. Two
values are filled in:
- **Resolver:** taken from the container's `/etc/resolv.conf`
  (`NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`). That is 127.0.0.11 in Docker and the
  cluster DNS in k3s.
- **Backend address:** `SEATSENSE_BACKEND_URL`. The default is
  `http://backend:3001` (Compose). In k3s it must be the full service name,
  because nginx's resolver ignores DNS search domains.

The backend is looked up per request. If it is down, the site still loads and
`/api` returns 502. `/api/sensors/:id/stream` is an SSE stream; nginx does not
buffer it, and the backend sends a keepalive every 15 s.

## k3s (production)

Traffic flow:

```
Cloudflare Tunnel → Service seatsense (2 nginx pods)
                    → /api → Service seatsense-backend (1 pod) → PVC /data
```

Backend manifest: `k8s/seatsense-backend.yaml`. It contains a PVC, a
Deployment and a Service in namespace `apps`.

### First deploy

1. **Image visibility.** After the first push to `main` that builds the
   backend, open the new `seatsense-backend` package on GitHub (Packages). Give
   it the same visibility as `seatsense`: new GHCR packages are private by
   default, and the cluster pulls without an image pull secret.
2. **Secret with the sensor tokens** (never in git):

   ```bash
   kubectl -n apps create secret generic seatsense-backend \
     --from-literal=DEVICE_TOKENS="seat-001:$(openssl rand -hex 24)"
   kubectl -n apps get secret seatsense-backend -o jsonpath='{.data.DEVICE_TOKENS}' | base64 -d; echo
   ```

   Put the token after `seat-001:` into the sensor's `include/secrets.h` as
   `DEVICE_TOKEN`.
3. **Backend:**

   ```bash
   kubectl apply -f k8s/seatsense-backend.yaml
   kubectl -n apps rollout status deploy/seatsense-backend
   ```

4. **Frontend Deployment:** add the backend address to the `seatsense`
   container:

   ```yaml
          env:
            - name: SEATSENSE_BACKEND_URL
              value: http://seatsense-backend.apps.svc.cluster.local:3001
   ```

   Then `kubectl -n apps rollout restart deploy/seatsense` to pull the new
   `:latest`. The Cloudflare Tunnel needs no changes: `/api` uses the same
   hostname.

### Why the backend runs differently from the frontend

- **One replica, `Recreate`, no PodDisruptionBudget.** State is in memory and
  the event log is a single file, so a second replica would disagree. A PDB
  with `minAvailable: 1` would block node drains.
- **The Service uses the default `Cluster` traffic policy, not `Local`.**
  Frontend pods on every node must reach the single backend pod.
- **The volume is tied to one node.** The PVC uses k3s's default `local-path`
  storage, which lives on one node, so the backend always runs there. If that
  node is down, `/live` shows 502 until it is back. The demo pages are not
  affected.

### Updating

Push to `main`, wait for the "Build images" workflow, then:

```bash
kubectl -n apps rollout restart deploy/seatsense deploy/seatsense-backend
```

### Checking

```bash
kubectl -n apps get pods -l 'app in (seatsense, seatsense-backend)' -o wide
kubectl -n apps logs -f deploy/seatsense-backend      # readings, rejected uploads, online/offline
kubectl -n apps exec deploy/seatsense -- wget -qO- http://127.0.0.1/api/health
```

### Event log backup

The log survives restarts and redeploys. Deleting the PVC deletes the pilot
history. To copy it out:

```bash
kubectl -n apps exec deploy/seatsense-backend -- cat /data/events.jsonl > events-$(date +%F).jsonl
```

## Docker Compose (local testing, or a single Docker host)

`docker-compose.yml` runs the same two images, built from source:

- The frontend joins the external `cloudflare` network as `seatsense`. The
  tunnel service URL is `http://seatsense:80`.
- The backend is only on the private `internal` network.
- The event log lives on the `backend-data` volume.
- No host ports are published.

```bash
docker network inspect cloudflare >/dev/null || docker network create cloudflare
cp .env.example .env && nano .env        # DEVICE_TOKENS=seat-001:$(openssl rand -hex 24)
docker compose up -d --build
docker compose ps                        # both containers should become healthy
docker compose logs -f backend
```

Check from inside the network, or publish a port temporarily:

```bash
docker run --rm --network cloudflare curlimages/curl -s http://seatsense/api/health
docker run --rm -p 8080:80 seatsense-frontend:latest   # site only; /api needs the backend network
```

`docker compose down -v` deletes the event log volume. Back it up first:

```bash
docker cp seatsense-backend:/data/events.jsonl ./events-$(date +%F).jsonl
```
