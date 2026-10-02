#include <Arduino.h>

// TEMPORARY hardware bring-up diagnostics. Set to 0 to disable.
// Prints a rate-limited UART/frame summary every LD2410C_DIAG_INTERVAL_MS and a
// one-time hex dump of the first received bytes. Remove once the real sensor
// link is verified.
#define LD2410C_DIAGNOSTICS 1

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

#if LD2410C_DIAGNOSTICS
const uint32_t LD2410C_DIAG_INTERVAL_MS = 2000;
const size_t LD2410C_DIAG_HEX_DUMP_BYTES = 48;
#endif

HardwareSerial ld2410cSerial(1);

// LD2410C data frame (real protocol):
//   F4 F3 F2 F1 | len (u16 LE) | type | AA | target data ... | 55 00 | F8 F7 F6 F5
// Basic report: type 0x02, len 13 -> 23 bytes total.
// Engineering report: type 0x01, longer; it starts with the same basic target
// fields at the same offsets, so those are read from both.
const uint8_t FRAME_HEADER[] = {0xF4, 0xF3, 0xF2, 0xF1};
const uint8_t FRAME_FOOTER[] = {0xF8, 0xF7, 0xF6, 0xF5};
const size_t FRAME_HEADER_SIZE = sizeof(FRAME_HEADER);
const size_t FRAME_LENGTH_FIELD_SIZE = 2;
const size_t FRAME_FOOTER_SIZE = sizeof(FRAME_FOOTER);
const size_t FRAME_OVERHEAD = FRAME_HEADER_SIZE + FRAME_LENGTH_FIELD_SIZE + FRAME_FOOTER_SIZE;
const uint16_t BASIC_REPORT_DATA_LENGTH = 13;
// Upper bound on accepted data length, so a corrupted length field cannot make
// the parser swallow a long stretch of the stream. Engineering frames are
// well below this.
const uint16_t MAX_FRAME_DATA_LENGTH = 54;
const size_t MAX_FRAME_SIZE = FRAME_OVERHEAD + MAX_FRAME_DATA_LENGTH;

const uint8_t DATA_TYPE_ENGINEERING = 0x01;
const uint8_t DATA_TYPE_BASIC = 0x02;

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

enum class SeatState { UNKNOWN, AVAILABLE, OCCUPIED };

enum class FrameResult { BASIC, ENGINEERING, BAD_FOOTER, BAD_MARKERS, UNKNOWN_TYPE };

// All per-sensor state lives here so more sensors per node can be added later.
struct Ld2410cSensor {
  HardwareSerial &serial;

  uint8_t frame[MAX_FRAME_SIZE];
  size_t frameIndex = 0;
  size_t frameSize = 0;  // total expected size, known once the length field is read

  RadarData latest;
  bool hasValidFrame = false;
  uint32_t lastValidFrameMs = 0;

  SeatState state = SeatState::UNKNOWN;
  uint8_t lastPrintedTargetType = TARGET_NONE;

#if LD2410C_DIAGNOSTICS
  uint32_t bytesReceived = 0;
  uint32_t basicFrames = 0;
  uint32_t engineeringFrames = 0;
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

// frame holds a complete frame of frameSize bytes with a valid header and a
// length field that matches frameSize.
FrameResult parseRadarFrame(const uint8_t *frame, size_t frameSize, RadarData &radarData) {
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

  return dataType == DATA_TYPE_BASIC ? FrameResult::BASIC : FrameResult::ENGINEERING;
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

// Derives the seat state from the latest valid frame and its age. AVAILABLE is
// only possible from a valid frame that reports no target; no data is UNKNOWN.
void updateSeatState(Ld2410cSensor &sensor, uint32_t nowMs) {
  SeatState newState;
  bool timedOut = false;

  if (!sensor.hasValidFrame) {
    newState = SeatState::UNKNOWN;
  } else if ((uint32_t)(nowMs - sensor.lastValidFrameMs) >= SENSOR_DATA_TIMEOUT_MS) {
    newState = SeatState::UNKNOWN;
    timedOut = true;
  } else if (sensor.latest.targetType != TARGET_NONE) {
    newState = SeatState::OCCUPIED;
  } else {
    newState = SeatState::AVAILABLE;
  }

  bool stateChanged = newState != sensor.state;
  bool targetTypeChanged = newState == SeatState::OCCUPIED &&
                           sensor.latest.targetType != sensor.lastPrintedTargetType;

  sensor.state = newState;

  if (!stateChanged && !targetTypeChanged) {
    return;
  }

  Serial.print(seatStateName(newState));
  if (timedOut) {
    Serial.print(" (sensor data timeout: no valid LD2410C frame for ");
    Serial.print(SENSOR_DATA_TIMEOUT_MS);
    Serial.print(" ms)");
  }
  Serial.println();

  if (newState == SeatState::OCCUPIED) {
    printRadarDetails(sensor.latest);
  }
  sensor.lastPrintedTargetType = sensor.latest.targetType;
}

void handleCompleteFrame(Ld2410cSensor &sensor, uint32_t nowMs) {
  RadarData radarData;
  FrameResult result = parseRadarFrame(sensor.frame, sensor.frameSize, radarData);

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
}

// Byte-wise state machine: sync on the 4-byte header, read the length field,
// then buffer exactly that many data bytes plus the footer. Command/ACK frames
// (FD FC FB FA ...) never match the header and are skipped byte by byte.
void feedRadarByte(Ld2410cSensor &sensor, uint8_t byte, uint32_t nowMs) {
  if (sensor.frameIndex < FRAME_HEADER_SIZE) {
    if (byte == FRAME_HEADER[sensor.frameIndex]) {
      sensor.frame[sensor.frameIndex++] = byte;
    } else {
      sensor.frameIndex = 0;
      if (byte == FRAME_HEADER[0]) {
        sensor.frame[sensor.frameIndex++] = byte;
      }
    }
    return;
  }

  sensor.frame[sensor.frameIndex++] = byte;

  if (sensor.frameIndex == FRAME_HEADER_SIZE + FRAME_LENGTH_FIELD_SIZE) {
    uint16_t dataLength = readLittleEndian16(&sensor.frame[FRAME_HEADER_SIZE]);
    if (dataLength < BASIC_REPORT_DATA_LENGTH || dataLength > MAX_FRAME_DATA_LENGTH) {
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
  ld2410cSerial.begin(LD2410C_BAUD_RATE, SERIAL_8N1, LD2410C_RX_PIN, LD2410C_TX_PIN);

  // Only configures the ESP32 UART; it says nothing about whether the sensor
  // is connected or sending. Seat state stays UNKNOWN until a valid frame.
  Serial.println("LD2410C UART started (RX=GPIO17, TX=GPIO18, 256000 baud), waiting for frames");
  Serial.println(seatStateName(radar.state));
}

void loop() {
  readRadarData(radar);
  uint32_t nowMs = millis();
  updateSeatState(radar, nowMs);
#if LD2410C_DIAGNOSTICS
  printDiagnostics(radar, nowMs);
#endif
}
