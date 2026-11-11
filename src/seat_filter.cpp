#include "seat_filter.h"

static bool hasMoving(const RadarData &r) {
  return r.targetType == TARGET_MOVING || r.targetType == TARGET_MOVING_AND_STATIONARY;
}

static bool hasStationary(const RadarData &r) {
  return r.targetType == TARGET_STATIONARY || r.targetType == TARGET_MOVING_AND_STATIONARY;
}

bool presentWithinSeat(const RadarData &r, const SeatFilterConfig &c) {
  return (hasMoving(r) && r.movingDistanceCm <= c.maxDistanceCm &&
          r.movingEnergy >= c.stayMovingMinEnergy) ||
         (hasStationary(r) && r.stationaryDistanceCm <= c.maxDistanceCm &&
          r.stationaryEnergy >= c.stayStationaryMinEnergy);
}

bool strongTargetWithinSeat(const RadarData &r, const SeatFilterConfig &c) {
  return (hasMoving(r) && r.movingDistanceCm <= c.maxDistanceCm &&
          r.movingEnergy >= c.enterMovingMinEnergy) ||
         (hasStationary(r) && r.stationaryDistanceCm <= c.maxDistanceCm &&
          r.stationaryEnergy >= c.enterStationaryMinEnergy);
}

SeatState updateSeatFilter(SeatFilter &f, const SeatFilterConfig &c, SeatState current,
                           bool dataValid, const RadarData &r, uint32_t nowMs) {
  if (!dataValid) {
    // Restart both windows: after recovery AVAILABLE needs a full releaseMs of
    // valid frames without a nearby target, OCCUPIED a full confirmation.
    f.strongRun = false;
    f.lastNearMs = nowMs;
    return SeatState::UNKNOWN;
  }

  if (presentWithinSeat(r, c)) {
    f.lastNearMs = nowMs;
  }

  if (strongTargetWithinSeat(r, c)) {
    if (!f.strongRun) {
      f.strongRun = true;
      f.strongSinceMs = nowMs;
    }
    f.lastStrongMs = nowMs;
  } else if (f.strongRun && (uint32_t)(nowMs - f.lastStrongMs) > c.enterGapToleranceMs) {
    f.strongRun = false;  // the strong target went away: start over next time
  }

  bool confirmedEnter = f.strongRun && (uint32_t)(nowMs - f.strongSinceMs) >= c.enterConfirmMs;
  bool clearForRelease = (uint32_t)(nowMs - f.lastNearMs) >= c.releaseMs;

  if (current == SeatState::OCCUPIED) {
    return clearForRelease ? SeatState::AVAILABLE : SeatState::OCCUPIED;
  }
  if (confirmedEnter) {
    return SeatState::OCCUPIED;
  }
  if (clearForRelease) {
    return SeatState::AVAILABLE;
  }
  // Between the two thresholds: AVAILABLE stays AVAILABLE, UNKNOWN waits for
  // a clear decision either way.
  return current;
}
