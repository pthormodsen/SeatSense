#pragma once

// Plain C++ (no Arduino headers) so the JSON format can be compiled and
// checked on a computer against the backend validator; see
// backend/scripts/check-firmware-json.sh.

#include <stddef.h>
#include <stdint.h>

// One seat reading handed from the radar loop to the network task.
struct SensorReading {
  // 1 occupied, 0 available, -1 unknown (radar not delivering valid frames).
  int8_t occupied = -1;
  // false -> the radar fields below are sent as null.
  bool radarValid = false;
  uint8_t targetType = 0;
  uint16_t movingCm = 0;
  uint16_t stationaryCm = 0;
  uint8_t movingEnergy = 0;
  uint8_t stationaryEnergy = 0;

  // Filled in by networkSubmit().
  uint32_t seq = 0;
  uint32_t uptimeMs = 0;
  int64_t epochMs = 0;  // Unix time in ms, 0 until NTP has synced
};

// Writes the POST body for one reading (API contract: backend/src/types.ts).
// Returns the JSON length, or a value <= 0 or >= size if it did not fit.
int formatReadingJson(const SensorReading &reading, const char *sensorId, int rssi, char *out, size_t size);
