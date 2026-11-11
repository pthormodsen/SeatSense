#!/bin/sh
# Sends simulated sensor readings with curl, to test the backend and /live page
# without hardware.
#
#   DEVICE_TOKEN=<token> ./scripts/send-reading.sh true        # one reading: occupied
#   DEVICE_TOKEN=<token> ./scripts/send-reading.sh false       # one reading: available
#   DEVICE_TOKEN=<token> ./scripts/send-reading.sh null        # radar silent (unknown)
#   DEVICE_TOKEN=<token> ./scripts/send-reading.sh loop        # heartbeat every 10 s,
#                                                              # occupancy flips every 30 s
# Optional: SENSOR_ID (default seat-001), API_URL (default http://localhost:3001).
set -eu

: "${DEVICE_TOKEN:?Set DEVICE_TOKEN to the token configured for the sensor in DEVICE_TOKENS}"
SENSOR_ID="${SENSOR_ID:-seat-001}"
API_URL="${API_URL:-http://localhost:3001}"
SEQ=0
START=$(date +%s)

send() {
  occupied="$1"
  SEQ=$((SEQ + 1))
  case "$occupied" in
    true) target=2; stationary=$((70 + SEQ % 20)); senergy=$((40 + SEQ % 30)) ;;
    *) target=0; stationary=0; senergy=0 ;;
  esac
  if [ "$occupied" = null ]; then target=null; stationary=null; senergy=null; fi
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  uptime=$((($(date +%s) - START) * 1000))
  body=$(printf '{"sensorId":"%s","occupied":%s,"sentAt":"%s","seq":%d,"targetType":%s,"movingCm":0,"stationaryCm":%s,"movingEnergy":0,"stationaryEnergy":%s,"rssi":-58,"uptimeMs":%d}' \
    "$SENSOR_ID" "$occupied" "$now" "$SEQ" "$target" "$stationary" "$senergy" "$uptime")
  printf '%s occupied=%s -> ' "$now" "$occupied"
  curl -sS -w ' (HTTP %{http_code})\n' -X POST "$API_URL/api/sensors/$SENSOR_ID/readings" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $DEVICE_TOKEN" \
    -d "$body" || echo ' (request failed)'
}

case "${1:-true}" in
  true | false | null) send "$1" ;;
  loop)
    occupied=true
    tick=0
    while :; do
      send "$occupied"
      sleep 10
      tick=$((tick + 1))
      if [ $((tick % 3)) -eq 0 ]; then
        if [ "$occupied" = true ]; then occupied=false; else occupied=true; fi
      fi
    done
    ;;
  *) echo "usage: $0 [true|false|null|loop]" >&2; exit 2 ;;
esac
