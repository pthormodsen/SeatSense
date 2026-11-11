#pragma once

// Seat occupancy decision from LD2410C readings. Plain C++ (no Arduino
// headers) so it can be tested on a computer: test/host/run.sh.

#include <stdint.h>

const uint8_t TARGET_NONE = 0;
const uint8_t TARGET_MOVING = 1;
const uint8_t TARGET_STATIONARY = 2;
const uint8_t TARGET_MOVING_AND_STATIONARY = 3;

// Target fields of one LD2410C report (basic and engineering frames).
struct RadarData {
  uint8_t targetType = 0;
  uint16_t movingDistanceCm = 0;
  uint8_t movingEnergy = 0;
  uint16_t stationaryDistanceCm = 0;
  uint8_t stationaryEnergy = 0;
  uint16_t detectionDistanceCm = 0;
};

enum class SeatState { UNKNOWN, AVAILABLE, OCCUPIED };

struct SeatFilterConfig {
  // Targets farther away than this are ignored (other people, walkway,
  // neighbouring seats).
  uint16_t maxDistanceCm;
  // AVAILABLE -> OCCUPIED needs a target within maxDistanceCm with at least
  // this energy (0-100)...
  uint8_t enterStationaryMinEnergy;
  uint8_t enterMovingMinEnergy;
  // ...seen for this long without a gap longer than enterGapToleranceMs.
  uint32_t enterConfirmMs;
  uint32_t enterGapToleranceMs;
  // A seat stays OCCUPIED while a target within maxDistanceCm has at least
  // this (lower) energy. Weaker reflections count as background, so static
  // clutter cannot hold a seat forever.
  uint8_t stayStationaryMinEnergy;
  uint8_t stayMovingMinEnergy;
  // OCCUPIED -> AVAILABLE after this long without such a target.
  uint32_t releaseMs;
};

// Detection history; zero-initialise and keep one per sensor.
struct SeatFilter {
  bool strongRun = false;     // a strong nearby target is currently being confirmed
  uint32_t strongSinceMs = 0;
  uint32_t lastStrongMs = 0;
  uint32_t lastNearMs = 0;
};

// A target within maxDistanceCm strong enough to keep a seat occupied.
bool presentWithinSeat(const RadarData &radar, const SeatFilterConfig &config);
// A target within maxDistanceCm strong enough to make a free seat occupied.
bool strongTargetWithinSeat(const RadarData &radar, const SeatFilterConfig &config);

// Call on every loop with the latest frame. `dataValid` is false when there is
// no recent valid frame; the result is then UNKNOWN at once. Returns the new
// stable state (may equal `current`).
//
// Hysteresis: entering OCCUPIED is strict (strong target, sustained), staying
// OCCUPIED is more lenient (lower energy, short dips allowed by releaseMs), so
// a person sitting still with a fluctuating signal keeps the seat while a
// passer-by or weak background reflections do not take it.
SeatState updateSeatFilter(SeatFilter &filter, const SeatFilterConfig &config, SeatState current,
                           bool dataValid, const RadarData &radar, uint32_t nowMs);
