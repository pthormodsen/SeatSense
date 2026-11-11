// Host-side driver for check-firmware-json.sh: prints the firmware's JSON body
// (src/reading_json.cpp) for representative readings, one per line.
#include <stdio.h>

#include "../../src/reading_json.h"

int main() {
  char out[384];
  SensorReading r;

  // Occupied, stationary target, NTP synced.
  r.occupied = 1; r.radarValid = true; r.targetType = 2; r.movingCm = 0; r.stationaryCm = 80;
  r.movingEnergy = 0; r.stationaryEnergy = 30; r.seq = 1; r.uptimeMs = 123456;
  r.epochMs = 1794389400123LL;  // 2026-11-11T09:30:00.123Z
  formatReadingJson(r, "seat-001", -55, out, sizeof(out)); puts(out);

  // Available, no NTP yet.
  r.occupied = 0; r.targetType = 0; r.stationaryCm = 0; r.stationaryEnergy = 0; r.seq = 2; r.epochMs = 0;
  formatReadingJson(r, "seat-001", -70, out, sizeof(out)); puts(out);

  // Radar silent (UNKNOWN): radar fields null.
  r.occupied = -1; r.radarValid = false; r.seq = 3; r.epochMs = 1794389410000LL;
  formatReadingJson(r, "seat-001", 0, out, sizeof(out)); puts(out);

  // Extremes: max distances/energies, weakest RSSI, large counters.
  r.occupied = 1; r.radarValid = true; r.targetType = 3; r.movingCm = 65535; r.stationaryCm = 65535;
  r.movingEnergy = 255; r.stationaryEnergy = 255; r.seq = 4294967295UL; r.uptimeMs = 4294967295UL;
  int n = formatReadingJson(r, "seat-001", -127, out, sizeof(out)); puts(out);
  fprintf(stderr, "longest body: %d bytes (buffer %zu)\n", n, sizeof(out));
  return 0;
}
