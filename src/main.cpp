#include <Arduino.h>

#include "network.h"

// ===========================================================================
// SEAT RELEASE TIME (pilot setting)
// How long the radar must report no target before an OCCUPIED seat becomes
// AVAILABLE again. Deliberately SHORT (5 s) for the pilot, so tests such as
// "person leaves the seat" give a result quickly. A real deployment needs a
// grace period of a few minutes (coffee break, short absence), e.g.
// 3 * 60 * 1000UL. The change reaches the backend within ~1 s of this delay.
// ===========================================================================
const uint32_t SEAT_RELEASE_MS = 5000;

// Logging verbosity:
// 0 = silent (no serial output)
// 1 = boot information and occupancy state changes only (recommended)
// 2 = level 1 + concise sensor status every 10 seconds
// 3 = level 2 + full engineering gate peaks and UART diagnostics
#define LOG_LEVEL 2

// Preserve both original diagnostic systems and engineering mode at ALL levels.
// LOG_LEVEL controls only what is printed, not sensor functionality.
#define LD2410C_DIAGNOSTICS 1
#define LD2410C_ENGINEERING_DIAGNOSTICS 1

const uint32_t STATUS_PRINT_INTERVAL_MS = 5000;

// ESP32-S3 UART pins connected to the HLK-LD2410C.
// Sensor TX connects to ESP32 RX, and sensor RX connects to ESP32 TX.
const uint8_t LD2410C_RX_PIN = 17;
const uint8_t LD2410C_TX_PIN = 18;
const uint32_t LD2410C_BAUD_RATE = 256000;
// Max time setup() waits for a host to open the USB serial port (ms).
const uint32_t SERIAL_HOST_WAIT_MS = 2000;
// No valid frame for this long -> UNKNOWN (sensor silent, unplugged, wiring or
// UART fault). The real sensor reports several times per second, so a few
// seconds is well above the normal frame gap.
const uint32_t SENSOR_DATA_TIMEOUT_MS = 3000;
// Debounce of the seat state (firmware-side, independent of the LD2410C's own
// "unmanned duration", which is not configured by this firmware). Every frame
// is still read and parsed; only the reported seat state is debounced.
// A target must be reported continuously this long before AVAILABLE -> OCCUPIED
// (filters single spurious frames / someone briefly passing).
const uint32_t OCCUPIED_CONFIRM_MS = 1000;
// OCCUPIED -> AVAILABLE uses SEAT_RELEASE_MS (top of this file).
// The (debounced) seat state is uploaded immediately when it changes, and at
// least this often otherwise so the backend can tell the node is alive.
const uint32_t HEARTBEAT_INTERVAL_MS = 10000;
// Default is 256 bytes (~11 basic frames). Larger so a slow loop() iteration,
// e.g. while serial output is blocked, cannot overflow it. Networking runs in
// its own task and never blocks the radar loop.
const size_t LD2410C_RX_BUFFER_SIZE = 1024;
#if LD2410C_DIAGNOSTICS
const uint32_t LD2410C_DIAG_INTERVAL_MS = 2000;
const size_t LD2410C_DIAG_HEX_DUMP_BYTES = 48;
#endif
#if LD2410C_ENGINEERING_DIAGNOSTICS
const uint32_t LD2410C_ENG_INTERVAL_MS = 1000;
// Max wait for the ACK of one command. Data frames are still parsed meanwhile.
const uint32_t LD2410C_ACK_TIMEOUT_MS = 300;
// No engineering frame for this long while basic frames arrive -> the sensor is
// in basic mode (e.g. it was power-cycled); retry at most this often.
const uint32_t LD2410C_ENG_MISSING_MS = 2000;
// Commands are only sent while data frames are flowing (one within this
// window), never to a sensor that has gone quiet.
const uint32_t LD2410C_DATA_FLOWING_MS = 1000;
const uint32_t LD2410C_ENG_RETRY_INTERVAL_MS = 10000;
#endif
HardwareSerial ld2410cSerial(1);
// LD2410C serial protocol (HLK-LD2410C serial communication protocol V1.07;
// offsets cross-checked against ESPHome's ld2410 component). All fields are
// little-endian. "data" below means the intra-frame data after the length.
//
// Data frame (sensor -> ESP32):
//   F4 F3 F2 F1 | len (u16) | data[len] | F8 F7 F6 F5
//   data[0] type (0x02 basic, 0x01 engineering), data[1] 0xAA,
//   data[2] target state, data[3..4] moving distance cm, data[5] moving energy,
//   data[6..7] stationary distance cm, data[8] stationary energy,
//   data[9..10] detection distance cm, ..., data[len-2] 0x55, data[len-1] 0x00.
// Basic report: len 13 -> 23 bytes total.
// Engineering report adds after data[10]:
//   data[11] max moving gate, data[12] max stationary gate,
//   data[13..21] moving energy of gates 0..8, data[22..30] stationary energy of
//   gates 0..8, then M bytes of extra info (LD2410C: data[31] light sensor
//   value, data[32] OUT pin state) before 55 00. The manual's example has
//   len 35 (0x23) -> 45 bytes total.
//
// Command frame (ESP32 -> sensor) and ACK frame (sensor -> ESP32):
//   FD FC FB FA | len (u16) | data[len] | 04 03 02 01
//   Command data: command word (u16) + value. ACK data: command word | 0x0100
//   (u16) + status (u16, 0 = success) + return values.
const uint8_t FRAME_HEADER[] = {0xF4, 0xF3, 0xF2, 0xF1};
const uint8_t FRAME_FOOTER[] = {0xF8, 0xF7, 0xF6, 0xF5};
const uint8_t ACK_FRAME_HEADER[] = {0xFD, 0xFC, 0xFB, 0xFA};
const uint8_t ACK_FRAME_FOOTER[] = {0x04, 0x03, 0x02, 0x01};
const size_t FRAME_HEADER_SIZE = sizeof(FRAME_HEADER);
const size_t FRAME_LENGTH_FIELD_SIZE = 2;
const size_t FRAME_FOOTER_SIZE = sizeof(FRAME_FOOTER);
const size_t FRAME_OVERHEAD = FRAME_HEADER_SIZE + FRAME_LENGTH_FIELD_SIZE + FRAME_FOOTER_SIZE;
const uint16_t BASIC_REPORT_DATA_LENGTH = 13;
// Basic fields + 2 max-gate bytes + 2 x 9 gate energies + 55 00 (no extra info).
const uint16_t ENGINEERING_MIN_DATA_LENGTH = 33;
// Shortest ACK: command word + status.
const uint16_t ACK_MIN_DATA_LENGTH = 4;
// Upper bound on accepted data length, so a corrupted length field cannot make
// the parser swallow a long stretch of the stream. Engineering frames are
// well below this.
const uint16_t MAX_FRAME_DATA_LENGTH = 54;
const size_t MAX_FRAME_SIZE = FRAME_OVERHEAD + MAX_FRAME_DATA_LENGTH;
const uint8_t DATA_TYPE_ENGINEERING = 0x01;
const uint8_t DATA_TYPE_BASIC = 0x02;
// Distance gates 0..8. Each gate covers 0.75 m (resolution index 0, factory
// default) or 0.2 m (index 1).
const uint8_t LD2410C_GATE_COUNT = 9;
const uint8_t ENG_MAX_MOVING_GATE_OFFSET = 11;
const uint8_t ENG_MAX_STATIONARY_GATE_OFFSET = 12;
const uint8_t ENG_MOVING_ENERGY_OFFSET = 13;
const uint8_t ENG_STATIONARY_ENERGY_OFFSET = ENG_MOVING_ENERGY_OFFSET + LD2410C_GATE_COUNT;
const uint8_t ENG_EXTRA_INFO_OFFSET = ENG_STATIONARY_ENERGY_OFFSET + LD2410C_GATE_COUNT;
// Command words used by this firmware. None of them writes a persistent
// setting: FF/FE only open/close a config session, 61/AB are read-only
// queries, 62 enables engineering mode until the sensor loses power.
const uint8_t CMD_ENABLE_CONFIG = 0xFF;          // value 01 00, ACK returns protocol version + buffer size
const uint8_t CMD_END_CONFIG = 0xFE;             // sensor resumes reporting
const uint8_t CMD_READ_PARAMETERS = 0x61;        // max gates, per-gate thresholds, no-one duration
const uint8_t CMD_ENABLE_ENGINEERING = 0x62;     // volatile
const uint8_t CMD_READ_DISTANCE_RESOLUTION = 0xAB;
// Not used yet. These WRITE PERSISTENT settings (kept across power loss) and
// must only be sent deliberately, inside an FF ... FE config session:
//   0x60 max gates + no-one duration, value (18 bytes):
//        00 00 <maxMovingGate u32> 01 00 <maxStationaryGate u32> 02 00 <seconds u32>
//        (gates 2..8, seconds 0..65535)
//   0x64 gate sensitivity, value (18 bytes):
//        00 00 <gate u32, FFFF = all gates> 01 00 <moving 0..100 u32> 02 00 <stationary 0..100 u32>
//   0xAA distance resolution (takes effect after a sensor restart).
// 0x63 disables engineering mode (volatile).
const uint8_t TARGET_NONE = 0;
const uint8_t TARGET_MOVING = 1;
const uint8_t TARGET_STATIONARY = 2;
const uint8_t TARGET_MOVING_AND_STATIONARY = 3;
struct RadarData {
  uint8_t targetType = 0;
  uint16_t movingDistanceCm = 0;
  uint8_t movingEnergy = 0;
  uint16_t stationaryDistanceCm = 0;
  uint8_t stationaryEnergy = 0;
  uint16_t detectionDistanceCm = 0;
};
// Extra fields of an engineering report.
struct EngineeringData {
  uint8_t maxMovingGate = 0;
  uint8_t maxStationaryGate = 0;
  uint8_t movingEnergy[LD2410C_GATE_COUNT] = {};
  uint8_t stationaryEnergy[LD2410C_GATE_COUNT] = {};
  bool hasExtraInfo = false;  // light sensor value + OUT pin state present
  uint8_t lightValue = 0;
  uint8_t outPin = 0;
};
enum class SeatState { UNKNOWN, AVAILABLE, OCCUPIED };
enum class FrameResult { BASIC, ENGINEERING, BAD_FOOTER, BAD_MARKERS, UNKNOWN_TYPE };
// All per-sensor state lives here so more sensors per node can be added later.
struct Ld2410cSensor {
  HardwareSerial &serial;
  uint8_t frame[MAX_FRAME_SIZE];
  size_t frameIndex = 0;
  size_t frameSize = 0;  // total expected size, known once the length field is read
  bool frameIsAck = false;  // current frame started with the ACK header FD FC FB FA
  RadarData latest;
  bool hasValidFrame = false;
  uint32_t lastValidFrameMs = 0;
  SeatState state = SeatState::UNKNOWN;       // stable (debounced) seat state
  SeatState candidateState = SeatState::UNKNOWN;  // raw state waiting to be confirmed
  uint32_t candidateSinceMs = 0;               // when candidateState was first seen
  uint32_t lastReportMs = 0;                   // last reading handed to the network task
#if LD2410C_ENGINEERING_DIAGNOSTICS
  // Command/ACK handshake: only an ACK for pendingCommand is accepted.
  uint8_t pendingCommand = 0;
  bool ackReceived = false;
  uint16_t ackStatus = 0;
  // Results of the read-only queries (CMD_READ_PARAMETERS / _DISTANCE_RESOLUTION).
  bool hasParameters = false;
  uint8_t paramMaxMovingGate = 0;
  uint8_t paramMaxStationaryGate = 0;
  uint8_t movingThreshold[LD2410C_GATE_COUNT] = {};
  uint8_t stationaryThreshold[LD2410C_GATE_COUNT] = {};
  uint16_t noOneDurationS = 0;
  bool hasResolution = false;
  uint16_t resolutionIndex = 0;
  bool engineeringAttempted = false;
  uint32_t lastEngineeringAttemptMs = 0;
  bool hasEngineeringFrame = false;
  uint32_t lastEngineeringFrameMs = 0;
  // Per print window: latest engineering frame + per-gate peaks over the window.
  EngineeringData engLatest;
  uint8_t engPeakMoving[LD2410C_GATE_COUNT] = {};
  uint8_t engPeakStationary[LD2410C_GATE_COUNT] = {};
  uint16_t engWindowFrames = 0;
  uint16_t engWindowTargetFrames = 0;
  uint32_t lastEngPrintMs = 0;
#endif
#if LD2410C_DIAGNOSTICS
  uint32_t bytesReceived = 0;
  uint32_t basicFrames = 0;
  uint32_t engineeringFrames = 0;
  uint32_t ackFrames = 0;
  uint32_t badAckFrames = 0;
  uint32_t badLengthFrames = 0;
  uint32_t badFooterFrames = 0;
  uint32_t badMarkerFrames = 0;
  uint32_t unknownTypeFrames = 0;
  uint32_t totalBytesReceived = 0;
  uint32_t totalValidFrames = 0;
  uint8_t hexDump[LD2410C_DIAG_HEX_DUMP_BYTES];
  size_t hexDumpLength = 0;
  bool hexDumpPrinted = false;
  uint32_t lastDiagMs = 0;
#endif
  explicit Ld2410cSensor(HardwareSerial &uart) : serial(uart) {}
};
Ld2410cSensor radar(ld2410cSerial);
const char *targetTypeName(uint8_t targetType) {
  switch (targetType) {
    case TARGET_NONE:
      return "none";
    case TARGET_MOVING:
      return "moving";
    case TARGET_STATIONARY:
      return "stationary";
    case TARGET_MOVING_AND_STATIONARY:
      return "moving + stationary";
    default:
      return "invalid";
  }
}
uint16_t readLittleEndian16(const uint8_t *data) {
  return data[0] | (data[1] << 8);
}
// frame holds a complete data frame of frameSize bytes with a valid header and
// a length field that matches frameSize. engData is filled for ENGINEERING only.
FrameResult parseRadarFrame(const uint8_t *frame, size_t frameSize, RadarData &radarData,
                            EngineeringData &engData) {
  for (size_t i = 0; i < FRAME_FOOTER_SIZE; i++) {
    if (frame[frameSize - FRAME_FOOTER_SIZE + i] != FRAME_FOOTER[i]) {
      return FrameResult::BAD_FOOTER;
    }
  }
  uint16_t dataLength = readLittleEndian16(&frame[4]);
  const uint8_t *data = &frame[FRAME_HEADER_SIZE + FRAME_LENGTH_FIELD_SIZE];
  uint8_t dataType = data[0];
  if (dataType != DATA_TYPE_BASIC && dataType != DATA_TYPE_ENGINEERING) {
    return FrameResult::UNKNOWN_TYPE;
  }
  if (dataLength < BASIC_REPORT_DATA_LENGTH ||
      (dataType == DATA_TYPE_BASIC && dataLength != BASIC_REPORT_DATA_LENGTH) ||
      (dataType == DATA_TYPE_ENGINEERING && dataLength < ENGINEERING_MIN_DATA_LENGTH) ||
      data[1] != 0xAA || data[dataLength - 2] != 0x55 || data[dataLength - 1] != 0x00) {
    return FrameResult::BAD_MARKERS;
  }
  if (data[2] > TARGET_MOVING_AND_STATIONARY) {
    return FrameResult::BAD_MARKERS;
  }
  radarData.targetType = data[2];
  radarData.movingDistanceCm = readLittleEndian16(&data[3]);
  radarData.movingEnergy = data[5];
  radarData.stationaryDistanceCm = readLittleEndian16(&data[6]);
  radarData.stationaryEnergy = data[8];
  radarData.detectionDistanceCm = readLittleEndian16(&data[9]);
  if (dataType == DATA_TYPE_BASIC) {
    return FrameResult::BASIC;
  }
  engData.maxMovingGate = data[ENG_MAX_MOVING_GATE_OFFSET];
  engData.maxStationaryGate = data[ENG_MAX_STATIONARY_GATE_OFFSET];
  for (uint8_t gate = 0; gate < LD2410C_GATE_COUNT; gate++) {
    engData.movingEnergy[gate] = data[ENG_MOVING_ENERGY_OFFSET + gate];
    engData.stationaryEnergy[gate] = data[ENG_STATIONARY_ENERGY_OFFSET + gate];
  }
  // Extra info sits between the stationary energies and 55 00.
  engData.hasExtraInfo = dataLength >= ENG_EXTRA_INFO_OFFSET + 2 + 2;
  if (engData.hasExtraInfo) {
    engData.lightValue = data[ENG_EXTRA_INFO_OFFSET];
    engData.outPin = data[ENG_EXTRA_INFO_OFFSET + 1];
  }
  return FrameResult::ENGINEERING;
}
const char *seatStateName(SeatState state) {
  switch (state) {
    case SeatState::OCCUPIED:
      return "OCCUPIED";
    case SeatState::AVAILABLE:
      return "AVAILABLE";
    default:
      return "UNKNOWN";
  }
}
void printRadarDetails(const RadarData &radarData) {
  Serial.print("Target: ");
  Serial.println(targetTypeName(radarData.targetType));
  if (radarData.targetType == TARGET_MOVING ||
      radarData.targetType == TARGET_MOVING_AND_STATIONARY) {
    Serial.print("Moving distance: ");
    Serial.print(radarData.movingDistanceCm);
    Serial.print(" cm, energy: ");
    Serial.println(radarData.movingEnergy);
  }
  if (radarData.targetType == TARGET_STATIONARY ||
      radarData.targetType == TARGET_MOVING_AND_STATIONARY) {
    Serial.print("Stationary distance: ");
    Serial.print(radarData.stationaryDistanceCm);
    Serial.print(" cm, energy: ");
    Serial.println(radarData.stationaryEnergy);
  }
}
// Derives the debounced seat state from the latest valid frame and its age.
// - No valid frame yet, or none for SENSOR_DATA_TIMEOUT_MS -> UNKNOWN at once
//   (no debounce). No data is never AVAILABLE.
// - Otherwise the raw state from the latest frame (target -> OCCUPIED,
//   TARGET_NONE -> AVAILABLE) must hold continuously for OCCUPIED_CONFIRM_MS /
//   SEAT_RELEASE_MS before it becomes the stable state. Leaving UNKNOWN
//   uses the same confirmation windows, so AVAILABLE is only reached after
//   SEAT_RELEASE_MS of valid TARGET_NONE frames.
// Hands the stable seat state and the latest radar values to the network task
// (non-blocking, see network.h).
void reportSeatState(Ld2410cSensor &sensor, uint32_t nowMs) {
  SensorReading reading;
  reading.occupied = sensor.state == SeatState::OCCUPIED    ? 1
                     : sensor.state == SeatState::AVAILABLE ? 0
                                                            : -1;
  // UNKNOWN can mean no recent valid frame, so the last values may be stale.
  reading.radarValid = sensor.state != SeatState::UNKNOWN;
  reading.targetType = sensor.latest.targetType;
  reading.movingCm = sensor.latest.movingDistanceCm;
  reading.stationaryCm = sensor.latest.stationaryDistanceCm;
  reading.movingEnergy = sensor.latest.movingEnergy;
  reading.stationaryEnergy = sensor.latest.stationaryEnergy;
  networkSubmit(reading);
  sensor.lastReportMs = nowMs;
}

void updateSeatState(Ld2410cSensor &sensor, uint32_t nowMs) {
  SeatState newState = sensor.state;
  bool timedOut = false;
  if (!sensor.hasValidFrame) {
    newState = SeatState::UNKNOWN;
    sensor.candidateState = SeatState::UNKNOWN;
  } else if ((uint32_t)(nowMs - sensor.lastValidFrameMs) >= SENSOR_DATA_TIMEOUT_MS) {
    newState = SeatState::UNKNOWN;
    sensor.candidateState = SeatState::UNKNOWN;  // restart confirmation after recovery
    timedOut = true;
  } else {
    SeatState rawState =
        sensor.latest.targetType != TARGET_NONE ? SeatState::OCCUPIED : SeatState::AVAILABLE;
    if (rawState == sensor.state) {
      sensor.candidateState = sensor.state;  // nothing pending
    } else if (rawState != sensor.candidateState) {
      sensor.candidateState = rawState;  // start the confirmation window
      sensor.candidateSinceMs = nowMs;
    } else {
      uint32_t confirmMs =
          rawState == SeatState::OCCUPIED ? OCCUPIED_CONFIRM_MS : SEAT_RELEASE_MS;
      if ((uint32_t)(nowMs - sensor.candidateSinceMs) >= confirmMs) {
        newState = rawState;
      }
    }
  }
  if (newState == sensor.state) {
    return;
  }
  sensor.state = newState;
  reportSeatState(sensor, nowMs);
#if LOG_LEVEL >= 1
  Serial.print("[SeatSense] ");
  Serial.print(seatStateName(newState));
  if (timedOut) {
    Serial.print(" | sensor timeout (");
    Serial.print(SENSOR_DATA_TIMEOUT_MS);
    Serial.print("ms without valid data)");
  } else if (newState == SeatState::OCCUPIED) {
    Serial.print(" | target=");
    Serial.print(targetTypeName(sensor.latest.targetType));
    Serial.print(" | distance=");
    const bool moving = sensor.latest.targetType == TARGET_MOVING ||
                        sensor.latest.targetType == TARGET_MOVING_AND_STATIONARY;
    Serial.print(moving ? sensor.latest.movingDistanceCm : sensor.latest.stationaryDistanceCm);
    Serial.print("cm | energy=");
    Serial.print(moving ? sensor.latest.movingEnergy : sensor.latest.stationaryEnergy);
  }
  Serial.println();
#endif
}
// ACK frames never touch the seat state or the sensor-health timestamp: only
// data frames prove that the sensor is reporting.
void handleAckFrame(Ld2410cSensor &sensor) {
  const uint8_t *data = &sensor.frame[FRAME_HEADER_SIZE + FRAME_LENGTH_FIELD_SIZE];
  uint16_t dataLength = readLittleEndian16(&sensor.frame[FRAME_HEADER_SIZE]);
  bool footerOk = true;
  for (size_t i = 0; i < FRAME_FOOTER_SIZE; i++) {
    if (sensor.frame[sensor.frameSize - FRAME_FOOTER_SIZE + i] != ACK_FRAME_FOOTER[i]) {
      footerOk = false;
    }
  }
  if (!footerOk || data[1] != 0x01) {
#if LD2410C_DIAGNOSTICS
    sensor.badAckFrames++;
#endif
    return;
  }
#if LD2410C_DIAGNOSTICS
  sensor.ackFrames++;
#endif
#if LD2410C_ENGINEERING_DIAGNOSTICS
  uint8_t command = data[0];
  if (sensor.pendingCommand == 0 || command != sensor.pendingCommand) {
    return;  // stale or unsolicited ACK
  }
  sensor.ackReceived = true;
  sensor.ackStatus = readLittleEndian16(&data[2]);
  if (sensor.ackStatus != 0) {
    return;
  }
  // Read parameters: 61 01 | 00 00 | AA | N | max moving gate | max stationary
  // gate | moving thresholds gates 0..N | stationary thresholds 0..N | duration.
  if (command == CMD_READ_PARAMETERS && dataLength >= 8 + 2 * LD2410C_GATE_COUNT + 2 &&
      data[4] == 0xAA) {
    sensor.paramMaxMovingGate = data[6];
    sensor.paramMaxStationaryGate = data[7];
    for (uint8_t gate = 0; gate < LD2410C_GATE_COUNT; gate++) {
      sensor.movingThreshold[gate] = data[8 + gate];
      sensor.stationaryThreshold[gate] = data[8 + LD2410C_GATE_COUNT + gate];
    }
    sensor.noOneDurationS = readLittleEndian16(&data[8 + 2 * LD2410C_GATE_COUNT]);
    sensor.hasParameters = true;
  } else if (command == CMD_READ_DISTANCE_RESOLUTION && dataLength >= 6) {
    sensor.resolutionIndex = readLittleEndian16(&data[4]);
    sensor.hasResolution = true;
  }
#else
  (void)dataLength;
#endif
}
void handleCompleteFrame(Ld2410cSensor &sensor, uint32_t nowMs) {
  if (sensor.frameIsAck) {
    handleAckFrame(sensor);
    return;
  }
  RadarData radarData;
  EngineeringData engData;
  FrameResult result = parseRadarFrame(sensor.frame, sensor.frameSize, radarData, engData);
#if LD2410C_DIAGNOSTICS
  switch (result) {
    case FrameResult::BASIC:
      sensor.basicFrames++;
      break;
    case FrameResult::ENGINEERING:
      sensor.engineeringFrames++;
      break;
    case FrameResult::BAD_FOOTER:
      sensor.badFooterFrames++;
      break;
    case FrameResult::BAD_MARKERS:
      sensor.badMarkerFrames++;
      break;
    case FrameResult::UNKNOWN_TYPE:
      sensor.unknownTypeFrames++;
      break;
  }
#endif
  if (result == FrameResult::BASIC || result == FrameResult::ENGINEERING) {
    sensor.latest = radarData;
    sensor.hasValidFrame = true;
    sensor.lastValidFrameMs = nowMs;
#if LD2410C_DIAGNOSTICS
    sensor.totalValidFrames++;
#endif
  }
#if LD2410C_ENGINEERING_DIAGNOSTICS
  if (result == FrameResult::ENGINEERING) {
    sensor.hasEngineeringFrame = true;
    sensor.lastEngineeringFrameMs = nowMs;
    sensor.engLatest = engData;
    for (uint8_t gate = 0; gate < LD2410C_GATE_COUNT; gate++) {
      if (engData.movingEnergy[gate] > sensor.engPeakMoving[gate]) {
        sensor.engPeakMoving[gate] = engData.movingEnergy[gate];
      }
      if (engData.stationaryEnergy[gate] > sensor.engPeakStationary[gate]) {
        sensor.engPeakStationary[gate] = engData.stationaryEnergy[gate];
      }
    }
    sensor.engWindowFrames++;
    if (radarData.targetType != TARGET_NONE) {
      sensor.engWindowTargetFrames++;
    }
  }
#endif
}
// Byte-wise state machine: sync on a 4-byte header (data F4 F3 F2 F1 or ACK
// FD FC FB FA), read the length field, then buffer exactly that many data
// bytes plus the footer. Each frame kind is validated against its own footer,
// so an ACK can never be taken for a data frame or vice versa.
void feedRadarByte(Ld2410cSensor &sensor, uint8_t byte, uint32_t nowMs) {
  if (sensor.frameIndex < FRAME_HEADER_SIZE) {
    const uint8_t *header = sensor.frameIsAck ? ACK_FRAME_HEADER : FRAME_HEADER;
    if (sensor.frameIndex > 0 && byte == header[sensor.frameIndex]) {
      sensor.frame[sensor.frameIndex++] = byte;
    } else {
      sensor.frameIndex = 0;
      if (byte == FRAME_HEADER[0] || byte == ACK_FRAME_HEADER[0]) {
        sensor.frameIsAck = byte == ACK_FRAME_HEADER[0];
        sensor.frame[sensor.frameIndex++] = byte;
      }
    }
    return;
  }
  sensor.frame[sensor.frameIndex++] = byte;
  if (sensor.frameIndex == FRAME_HEADER_SIZE + FRAME_LENGTH_FIELD_SIZE) {
    uint16_t dataLength = readLittleEndian16(&sensor.frame[FRAME_HEADER_SIZE]);
    uint16_t minLength = sensor.frameIsAck ? ACK_MIN_DATA_LENGTH : BASIC_REPORT_DATA_LENGTH;
    if (dataLength < minLength || dataLength > MAX_FRAME_DATA_LENGTH) {
#if LD2410C_DIAGNOSTICS
      sensor.badLengthFrames++;
#endif
      sensor.frameIndex = 0;
      return;
    }
    sensor.frameSize = FRAME_OVERHEAD + dataLength;
    return;
  }
  if (sensor.frameIndex > FRAME_HEADER_SIZE + FRAME_LENGTH_FIELD_SIZE &&
      sensor.frameIndex == sensor.frameSize) {
    handleCompleteFrame(sensor, nowMs);
    sensor.frameIndex = 0;
  }
}
void readRadarData(Ld2410cSensor &sensor) {
  while (sensor.serial.available() > 0) {
    uint8_t byte = sensor.serial.read();
#if LD2410C_DIAGNOSTICS
    sensor.bytesReceived++;
    sensor.totalBytesReceived++;
    if (sensor.hexDumpLength < LD2410C_DIAG_HEX_DUMP_BYTES) {
      sensor.hexDump[sensor.hexDumpLength++] = byte;
    }
#endif
    feedRadarByte(sensor, byte, millis());
  }
}
#if LD2410C_DIAGNOSTICS
void printDiagnostics(Ld2410cSensor &sensor, uint32_t nowMs) {
#if LOG_LEVEL < 3
  // Keep diagnostics counters maintained without producing terminal spam.
  if ((uint32_t)(nowMs - sensor.lastDiagMs) < LD2410C_DIAG_INTERVAL_MS) return;
  sensor.lastDiagMs = nowMs;
  sensor.bytesReceived = sensor.basicFrames = sensor.engineeringFrames = 0;
  sensor.badLengthFrames = sensor.badFooterFrames = sensor.badMarkerFrames = 0;
  sensor.unknownTypeFrames = sensor.ackFrames = sensor.badAckFrames = 0;
  return;
#else
  if (!sensor.hexDumpPrinted && sensor.hexDumpLength == LD2410C_DIAG_HEX_DUMP_BYTES) {
    Serial.print("[diag] first ");
    Serial.print(sensor.hexDumpLength);
    Serial.print(" UART bytes:");
    for (size_t i = 0; i < sensor.hexDumpLength; i++) {
      Serial.print(sensor.hexDump[i] < 0x10 ? " 0" : " ");
      Serial.print(sensor.hexDump[i], HEX);
    }
    Serial.println();
    sensor.hexDumpPrinted = true;
  }
  if ((uint32_t)(nowMs - sensor.lastDiagMs) < LD2410C_DIAG_INTERVAL_MS) {
    return;
  }
  sensor.lastDiagMs = nowMs;
  Serial.print("[diag] rx=");
  Serial.print(sensor.bytesReceived);
  Serial.print("B basic=");
  Serial.print(sensor.basicFrames);
  Serial.print(" eng=");
  Serial.print(sensor.engineeringFrames);
  Serial.print(" badLen=");
  Serial.print(sensor.badLengthFrames);
  Serial.print(" badFooter=");
  Serial.print(sensor.badFooterFrames);
  Serial.print(" badMarker=");
  Serial.print(sensor.badMarkerFrames);
  Serial.print(" badType=");
  Serial.print(sensor.unknownTypeFrames);
  Serial.print(" ack=");
  Serial.print(sensor.ackFrames);
  Serial.print(" badAck=");
  Serial.print(sensor.badAckFrames);
  Serial.print(" (last ");
  Serial.print(LD2410C_DIAG_INTERVAL_MS);
  Serial.print(" ms) state=");
  Serial.print(seatStateName(sensor.state));
  if (sensor.hasValidFrame) {
    Serial.print(" lastValid=");
    Serial.print((uint32_t)(nowMs - sensor.lastValidFrameMs));
    Serial.print("ms target=");
    Serial.print(targetTypeName(sensor.latest.targetType));
    Serial.print(" mov=");
    Serial.print(sensor.latest.movingDistanceCm);
    Serial.print("cm/");
    Serial.print(sensor.latest.movingEnergy);
    Serial.print(" stat=");
    Serial.print(sensor.latest.stationaryDistanceCm);
    Serial.print("cm/");
    Serial.print(sensor.latest.stationaryEnergy);
    Serial.print(" det=");
    Serial.print(sensor.latest.detectionDistanceCm);
    Serial.print("cm");
  }
  Serial.println();
  if (sensor.totalBytesReceived == 0) {
    Serial.println("[diag] no UART bytes from LD2410C yet: check 5V/GND, sensor TX -> GPIO17, common ground");
  } else if (sensor.totalValidFrames == 0) {
    Serial.println("[diag] UART bytes but no valid frame yet: check baud rate (256000) and the hex dump");
  }
  sensor.bytesReceived = 0;
  sensor.basicFrames = 0;
  sensor.engineeringFrames = 0;
  sensor.badLengthFrames = 0;
  sensor.badFooterFrames = 0;
  sensor.badMarkerFrames = 0;
  sensor.unknownTypeFrames = 0;
  sensor.ackFrames = 0;
  sensor.badAckFrames = 0;
#endif // LOG_LEVEL >= 3
}
#endif
#if LD2410C_ENGINEERING_DIAGNOSTICS
// Sends one command frame and waits up to LD2410C_ACK_TIMEOUT_MS for its ACK.
// Incoming bytes keep being parsed while waiting, so no data frame is dropped.
// Returns true only for an ACK of this command with status 0 (success).
bool sendCommand(Ld2410cSensor &sensor, uint8_t command, const uint8_t *value,
                 uint8_t valueLength) {
  uint8_t buffer[FRAME_OVERHEAD + 2 + 4];
  if (valueLength > 4) {
    return false;  // only short read/session commands are sent from here
  }
  size_t length = 0;
  for (size_t i = 0; i < FRAME_HEADER_SIZE; i++) buffer[length++] = ACK_FRAME_HEADER[i];
  uint16_t dataLength = 2 + valueLength;
  buffer[length++] = dataLength & 0xFF;
  buffer[length++] = dataLength >> 8;
  buffer[length++] = command;
  buffer[length++] = 0x00;
  for (uint8_t i = 0; i < valueLength; i++) buffer[length++] = value[i];
  for (size_t i = 0; i < FRAME_FOOTER_SIZE; i++) buffer[length++] = ACK_FRAME_FOOTER[i];
  sensor.pendingCommand = command;
  sensor.ackReceived = false;
  sensor.serial.write(buffer, length);
  const uint32_t startMs = millis();
  while (!sensor.ackReceived && (uint32_t)(millis() - startMs) < LD2410C_ACK_TIMEOUT_MS) {
    readRadarData(sensor);
    yield();
  }
  sensor.pendingCommand = 0;
  return sensor.ackReceived && sensor.ackStatus == 0;
}
void printGateValues(const char *label, const uint8_t *values) {
  Serial.print(label);
  for (uint8_t gate = 0; gate < LD2410C_GATE_COUNT; gate++) {
    Serial.print(" G");
    Serial.print(gate);
    Serial.print("=");
    if (values[gate] < 100) Serial.print(" ");
    if (values[gate] < 10) Serial.print(" ");
    Serial.print(values[gate]);
  }
  Serial.println();
}
void printSensorParameters(const Ld2410cSensor &sensor) {
#if LOG_LEVEL < 3
  (void)sensor;
  return;
#else
  uint16_t gateCm = 0;
  if (sensor.hasResolution) {
    gateCm = sensor.resolutionIndex == 0 ? 75 : (sensor.resolutionIndex == 1 ? 20 : 0);
    Serial.print("[cfg] resolution index=");
    Serial.print(sensor.resolutionIndex);
    Serial.print(" -> ");
    if (gateCm == 0) {
      Serial.println("unknown gate size");
    } else {
      Serial.print(gateCm);
      Serial.println(" cm per gate");
    }
  } else {
    Serial.println("[cfg] resolution query failed (factory default is 75 cm per gate)");
  }
  if (gateCm != 0) {
    Serial.print("[cfg] gate start cm:   ");
    for (uint8_t gate = 0; gate < LD2410C_GATE_COUNT; gate++) {
      uint16_t startCm = gate * gateCm;
      Serial.print(" G");
      Serial.print(gate);
      Serial.print("=");
      if (startCm < 100) Serial.print(" ");
      if (startCm < 10) Serial.print(" ");
      Serial.print(startCm);
    }
    Serial.println();
  }
  if (!sensor.hasParameters) {
    Serial.println("[cfg] parameter query failed");
    return;
  }
  Serial.print("[cfg] maxMovingGate=");
  Serial.print(sensor.paramMaxMovingGate);
  Serial.print(" maxStationaryGate=");
  Serial.print(sensor.paramMaxStationaryGate);
  Serial.print(" noOneDuration=");
  Serial.print(sensor.noOneDurationS);
  Serial.println(" s");
  printGateValues("[cfg] mov  threshold: ", sensor.movingThreshold);
  printGateValues("[cfg] stat threshold: ", sensor.stationaryThreshold);
#endif
}
// Config session: FF (enable config) -> 61 (read parameters) -> AB (read
// resolution) -> 62 (enable engineering mode) -> FE (end config). Nothing
// persistent is written. The sensor pauses data output while in config mode;
// the whole session is far shorter than SENSOR_DATA_TIMEOUT_MS. If it fails,
// basic frames keep the seat logic working exactly as before.
void enableEngineeringMode(Ld2410cSensor &sensor, uint32_t nowMs) {
  sensor.engineeringAttempted = true;
  sensor.lastEngineeringAttemptMs = nowMs;
#if LOG_LEVEL >= 3
  Serial.println("[eng] enabling LD2410C engineering mode (read-only queries, nothing persistent is written)");
#endif
  const uint8_t enableConfigValue[] = {0x01, 0x00};
  bool configOk = sendCommand(sensor, CMD_ENABLE_CONFIG, enableConfigValue, sizeof(enableConfigValue));
  bool parametersOk = false;
  bool resolutionOk = false;
  bool engineeringOk = false;
  if (configOk) {
    parametersOk = sendCommand(sensor, CMD_READ_PARAMETERS, nullptr, 0);
    resolutionOk = sendCommand(sensor, CMD_READ_DISTANCE_RESOLUTION, nullptr, 0);
    engineeringOk = sendCommand(sensor, CMD_ENABLE_ENGINEERING, nullptr, 0);
  }
  // Always try to leave config mode so the sensor resumes reporting.
  bool endOk = sendCommand(sensor, CMD_END_CONFIG, nullptr, 0);
#if LOG_LEVEL >= 3
  Serial.print("[eng] ACKs: enableConfig=");
  Serial.print(configOk ? "ok" : "FAIL");
  Serial.print(" readParameters=");
  Serial.print(parametersOk ? "ok" : "FAIL");
  Serial.print(" readResolution=");
  Serial.print(resolutionOk ? "ok" : "FAIL");
  Serial.print(" enableEngineering=");
  Serial.print(engineeringOk ? "ok" : "FAIL");
  Serial.print(" endConfig=");
  Serial.println(endOk ? "ok" : "FAIL");
#endif
  if (configOk) {
    printSensorParameters(sensor);
  }
#if LOG_LEVEL >= 3
  if (!engineeringOk) {
    Serial.print("[eng] engineering mode not enabled; seat logic keeps using basic frames. Retrying in ");
    Serial.print(LD2410C_ENG_RETRY_INTERVAL_MS);
    Serial.println(" ms");
  }
#endif
}
// (Re)enables engineering mode once the sensor reports data frames but no
// engineering frames, e.g. after boot or after the sensor was power-cycled.
// A quiet sensor is left alone (that is heading for the UNKNOWN case).
void maintainEngineeringMode(Ld2410cSensor &sensor, uint32_t nowMs) {
  if (!sensor.hasValidFrame ||
      (uint32_t)(nowMs - sensor.lastValidFrameMs) >= LD2410C_DATA_FLOWING_MS) {
    return;
  }
  bool engineeringActive = sensor.hasEngineeringFrame &&
      (uint32_t)(nowMs - sensor.lastEngineeringFrameMs) < LD2410C_ENG_MISSING_MS;
  if (engineeringActive) {
    return;
  }
  if (sensor.engineeringAttempted &&
      (uint32_t)(nowMs - sensor.lastEngineeringAttemptMs) < LD2410C_ENG_RETRY_INTERVAL_MS) {
    return;
  }
  enableEngineeringMode(sensor, nowMs);
}
// Once per LD2410C_ENG_INTERVAL_MS: target info from the latest engineering
// frame plus the peak energy per gate over all engineering frames in the window.
void printEngineeringDiagnostics(Ld2410cSensor &sensor, uint32_t nowMs) {
  if ((uint32_t)(nowMs - sensor.lastEngPrintMs) < LD2410C_ENG_INTERVAL_MS) {
    return;
  }
  sensor.lastEngPrintMs = nowMs;
  if (sensor.engWindowFrames == 0) {
    return;  // no engineering data in this window ([diag] shows what arrived)
  }
#if LOG_LEVEL >= 3
  const EngineeringData &eng = sensor.engLatest;
  Serial.print("[eng] t=");
  Serial.print(nowMs);
  Serial.print("ms state=");
  Serial.print(seatStateName(sensor.state));
  Serial.print(" frames=");
  Serial.print(sensor.engWindowFrames);
  Serial.print(" withTarget=");
  Serial.print(sensor.engWindowTargetFrames);
  Serial.print(" | last: target=");
  Serial.print(targetTypeName(sensor.latest.targetType));
  Serial.print(" mov=");
  Serial.print(sensor.latest.movingDistanceCm);
  Serial.print("cm/");
  Serial.print(sensor.latest.movingEnergy);
  Serial.print(" stat=");
  Serial.print(sensor.latest.stationaryDistanceCm);
  Serial.print("cm/");
  Serial.print(sensor.latest.stationaryEnergy);
  Serial.print(" det=");
  Serial.print(sensor.latest.detectionDistanceCm);
  Serial.print("cm maxGate mov=");
  Serial.print(eng.maxMovingGate);
  Serial.print(" stat=");
  Serial.print(eng.maxStationaryGate);
  if (eng.hasExtraInfo) {
    Serial.print(" light=");
    Serial.print(eng.lightValue);
    Serial.print(" out=");
    Serial.print(eng.outPin);
  }
  Serial.println();
  printGateValues("[eng] mov  peak:", sensor.engPeakMoving);
  printGateValues("[eng] stat peak:", sensor.engPeakStationary);
#endif

  for (uint8_t gate = 0; gate < LD2410C_GATE_COUNT; gate++) {
    sensor.engPeakMoving[gate] = 0;
    sensor.engPeakStationary[gate] = 0;
  }
  sensor.engWindowFrames = 0;
  sensor.engWindowTargetFrames = 0;
}
#endif
#if LOG_LEVEL >= 2
void printConciseStatus(const Ld2410cSensor &sensor, uint32_t nowMs) {
  static uint32_t lastPrintMs = 0;
  if ((uint32_t)(nowMs - lastPrintMs) < STATUS_PRINT_INTERVAL_MS) return;
  lastPrintMs = nowMs;

  Serial.print("[status] t=");
  Serial.print(nowMs / 1000);
  Serial.print("s | ");
  Serial.print(seatStateName(sensor.state));
  if (!sensor.hasValidFrame ||
      (uint32_t)(nowMs - sensor.lastValidFrameMs) >= SENSOR_DATA_TIMEOUT_MS) {
    Serial.println(" | no recent sensor data");
    return;
  }
  Serial.print(" | target=");
  Serial.print(targetTypeName(sensor.latest.targetType));
  if (sensor.latest.targetType != TARGET_NONE) {
    bool moving = sensor.latest.targetType == TARGET_MOVING ||
                  sensor.latest.targetType == TARGET_MOVING_AND_STATIONARY;
    Serial.print(" | distance=");
    Serial.print(moving ? sensor.latest.movingDistanceCm : sensor.latest.stationaryDistanceCm);
    Serial.print("cm | energy=");
    Serial.print(moving ? sensor.latest.movingEnergy : sensor.latest.stationaryEnergy);
  }
  Serial.println();
}
#endif

void setup() {
  Serial.begin(115200);
  // With ARDUINO_USB_CDC_ON_BOOT=1, Serial is the native USB-Serial/JTAG port.
  // Wait briefly for a host to open it so boot messages are not lost; bounded
  // so the node still starts headless. HWCDC writes do not block without a host.
  const uint32_t serialWaitStartMs = millis();
  while (!Serial && (uint32_t)(millis() - serialWaitStartMs) < SERIAL_HOST_WAIT_MS) {
    delay(10);
  }
  ld2410cSerial.setRxBufferSize(LD2410C_RX_BUFFER_SIZE);
  ld2410cSerial.begin(LD2410C_BAUD_RATE, SERIAL_8N1, LD2410C_RX_PIN, LD2410C_TX_PIN);
  // Only configures the ESP32 UART; it says nothing about whether the sensor
  // is connected or sending. Seat state stays UNKNOWN until a valid frame.
#if LOG_LEVEL >= 1
  Serial.println("[SeatSense] LD2410C UART started (RX=17, TX=18, 256000 baud)");
  Serial.println("[SeatSense] UNKNOWN | waiting for valid sensor frames");
#endif
  networkBegin();
}
void loop() {
  readRadarData(radar);
  uint32_t nowMs = millis();
  updateSeatState(radar, nowMs);
  if ((uint32_t)(nowMs - radar.lastReportMs) >= HEARTBEAT_INTERVAL_MS) {
    reportSeatState(radar, nowMs);
  }
#if LD2410C_DIAGNOSTICS
  printDiagnostics(radar, nowMs);
#endif
#if LD2410C_ENGINEERING_DIAGNOSTICS
  maintainEngineeringMode(radar, nowMs);
  printEngineeringDiagnostics(radar, nowMs);
#endif
#if LOG_LEVEL >= 2
  printConciseStatus(radar, nowMs);
#endif
}
