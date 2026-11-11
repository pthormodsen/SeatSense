// Host tests for src/seat_filter.cpp: simulated LD2410C frames every 100 ms.
// Run: test/host/run.sh
#include <stdio.h>

#include <vector>

#include "../../src/seat_filter.h"

// Same values as the pilot settings at the top of src/main.cpp.
static const SeatFilterConfig CONFIG = {
    /*maxDistanceCm*/ 150,
    /*enterStationaryMinEnergy*/ 40,
    /*enterMovingMinEnergy*/ 50,
    /*enterConfirmMs*/ 3000,
    /*enterGapToleranceMs*/ 1000,
    /*stayStationaryMinEnergy*/ 25,
    /*stayMovingMinEnergy*/ 30,
    /*releaseMs*/ 5000,
};

static const uint32_t FRAME_MS = 100;
static int failures = 0;

static RadarData none() { return RadarData(); }
static RadarData stationary(uint16_t cm, uint8_t energy) {
  RadarData r;
  r.targetType = TARGET_STATIONARY;
  r.stationaryDistanceCm = cm;
  r.stationaryEnergy = energy;
  return r;
}
static RadarData moving(uint16_t cm, uint8_t energy) {
  RadarData r;
  r.targetType = TARGET_MOVING;
  r.movingDistanceCm = cm;
  r.movingEnergy = energy;
  return r;
}

struct Sim {
  SeatFilter filter;
  SeatState state;
  uint32_t now = 1000;
  int changes = 0;
  uint32_t lastChangeMs = 0;
  explicit Sim(SeatState start) : state(start) {
    // Start from a settled state: as if the current state has held for a while.
    filter.lastNearMs = start == SeatState::OCCUPIED ? now : 0;
  }
  // Feeds `frame` (or frames from `make`) for durationMs.
  template <typename F>
  void run(uint32_t durationMs, F make, bool valid = true) {
    for (uint32_t t = 0; t < durationMs; t += FRAME_MS) {
      now += FRAME_MS;
      SeatState next = updateSeatFilter(filter, CONFIG, state, valid, make(t), now);
      if (next != state) {
        changes++;
        lastChangeMs = now;
        state = next;
      }
    }
  }
  void run(uint32_t durationMs, RadarData frame, bool valid = true) {
    run(durationMs, [&](uint32_t) { return frame; }, valid);
  }
};

static const char *name(SeatState s) {
  return s == SeatState::OCCUPIED ? "OCCUPIED" : s == SeatState::AVAILABLE ? "AVAILABLE" : "UNKNOWN";
}

static void expect(const char *test, SeatState actual, SeatState expected) {
  bool ok = actual == expected;
  if (!ok) failures++;
  printf("%s %-62s %s\n", ok ? "PASS" : "FAIL", test, ok ? "" : name(actual));
}

static void expectTrue(const char *test, bool ok) {
  if (!ok) failures++;
  printf("%s %s\n", ok ? "PASS" : "FAIL", test);
}

int main() {
  {
    Sim s(SeatState::AVAILABLE);
    s.run(2000, moving(100, 80));  // someone walks past the desk
    s.run(10000, none());
    expect("passer-by within 1.5 m for 2 s does not occupy the seat", s.state, SeatState::AVAILABLE);
    expectTrue("  ...and the state never changed", s.changes == 0);
  }
  {
    Sim s(SeatState::AVAILABLE);
    s.run(20000, [](uint32_t t) { return t % 3000 < 1500 ? moving(120, 90) : none(); });
    expect("strong movement with >1 s gaps (walking back and forth)", s.state, SeatState::AVAILABLE);
  }
  {
    Sim s(SeatState::AVAILABLE);
    s.run(30000, moving(250, 100));
    s.run(30000, stationary(215, 100));
    expect("strong targets beyond 1.5 m are ignored", s.state, SeatState::AVAILABLE);
  }
  {
    Sim s(SeatState::AVAILABLE);
    s.run(60000, stationary(75, 22));
    expect("weak background reflection (75 cm, energy 22) stays AVAILABLE", s.state, SeatState::AVAILABLE);
  }
  {
    Sim s(SeatState::AVAILABLE);
    uint32_t start = s.now;
    // Sitting down: energy fluctuates around the enter threshold.
    s.run(10000, [](uint32_t t) { return stationary(60, t % 500 < 300 ? 55 : 35); });
    expect("person sits down (fluctuating 35-55 at 60 cm)", s.state, SeatState::OCCUPIED);
    expectTrue("  ...after about 3 s, not sooner", s.lastChangeMs - start >= 3000 && s.lastChangeMs - start <= 3500);
  }
  {
    Sim s(SeatState::OCCUPIED);
    s.run(120000, [](uint32_t t) { return stationary(65, t % 1000 < 500 ? 28 : 33); });
    expect("person sitting very still (energy 28-33) keeps the seat", s.state, SeatState::OCCUPIED);
  }
  {
    Sim s(SeatState::OCCUPIED);
    s.run(3000, none());  // signal drops briefly
    s.run(5000, stationary(60, 45));
    expect("3 s dropout while seated does not release the seat", s.state, SeatState::OCCUPIED);
    expectTrue("  ...and the state never changed", s.changes == 0);
  }
  {
    Sim s(SeatState::OCCUPIED);
    s.run(1000, stationary(60, 60));
    uint32_t left = s.now;
    s.run(10000, none());
    expect("person leaves: AVAILABLE", s.state, SeatState::AVAILABLE);
    expectTrue("  ...after SEAT_RELEASE_MS (5 s)", s.lastChangeMs - left >= 5000 && s.lastChangeMs - left <= 5100);
  }
  {
    Sim s(SeatState::OCCUPIED);
    s.run(1000, stationary(60, 60));
    s.run(30000, stationary(75, 22));  // person gone, chair reflection remains
    expect("person leaves, weak clutter remains: AVAILABLE (not stuck)", s.state, SeatState::AVAILABLE);
  }
  {
    Sim s(SeatState::OCCUPIED);
    s.run(1000, stationary(60, 60));
    s.run(30000, stationary(200, 80));  // person moved to the next desk
    expect("person moves out of range (2 m): AVAILABLE", s.state, SeatState::AVAILABLE);
  }
  {
    Sim s(SeatState::AVAILABLE);
    s.run(500, none(), false);
    expect("no valid frames: UNKNOWN at once", s.state, SeatState::UNKNOWN);
    s.run(4800, stationary(75, 22));
    expect("  recovery, quiet seat, < 5 s: still UNKNOWN", s.state, SeatState::UNKNOWN);
    s.run(500, stationary(75, 22));
    expect("  recovery, quiet seat, 5 s: AVAILABLE", s.state, SeatState::AVAILABLE);
  }
  {
    Sim s(SeatState::UNKNOWN);
    s.run(5000, stationary(60, 70));
    expect("boot with a person present: OCCUPIED", s.state, SeatState::OCCUPIED);
  }

  printf(failures ? "\n%d FAILED\n" : "\nall seat filter tests passed\n", failures);
  return failures ? 1 : 0;
}
