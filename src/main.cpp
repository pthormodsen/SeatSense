#include <Arduino.h>

// ESP32-S3 UART pins connected to the HLK-LD2410C.
// Sensor TX connects to ESP32 RX, and sensor RX connects to ESP32 TX.
const uint8_t LD2410C_RX_PIN = 17;
const uint8_t LD2410C_TX_PIN = 18;

const uint32_t LD2410C_BAUD_RATE = 256000;

HardwareSerial ld2410cSerial(1);

struct RadarData {
  uint8_t targetType = 0;
  uint16_t movingDistanceCm = 0;
  uint8_t movingEnergy = 0;
  uint16_t stationaryDistanceCm = 0;
  uint8_t stationaryEnergy = 0;
  uint16_t detectionDistanceCm = 0;
};

bool occupied = false;
RadarData latestRadarData;
RadarData lastPrintedRadarData;
bool lastPrintedOccupied = false;

const size_t FRAME_SIZE = 23;
uint8_t frameBuffer[FRAME_SIZE];
size_t frameIndex = 0;

const uint8_t FRAME_HEADER[] = {0xF4, 0xF3, 0xF2, 0xF1};
const uint8_t FRAME_FOOTER[] = {0xF8, 0xF7, 0xF6, 0xF5};

const uint8_t TARGET_NONE = 0;
const uint8_t TARGET_MOVING = 1;
const uint8_t TARGET_STATIONARY = 2;
const uint8_t TARGET_MOVING_AND_STATIONARY = 3;

const char *targetTypeName(uint8_t targetType) {
  switch (targetType) {
    case TARGET_MOVING:
      return "moving";
    case TARGET_STATIONARY:
      return "stationary";
    case TARGET_MOVING_AND_STATIONARY:
      return "moving + stationary";
    default:
      return "none";
  }
}

uint16_t readLittleEndian16(const uint8_t *data) {
  return data[0] | (data[1] << 8);
}

bool isValidRadarFrame(const uint8_t *frame) {
  for (size_t i = 0; i < sizeof(FRAME_HEADER); i++) {
    if (frame[i] != FRAME_HEADER[i]) {
      return false;
    }
  }

  for (size_t i = 0; i < sizeof(FRAME_FOOTER); i++) {
    if (frame[FRAME_SIZE - sizeof(FRAME_FOOTER) + i] != FRAME_FOOTER[i]) {
      return false;
    }
  }

  uint16_t dataLength = readLittleEndian16(&frame[4]);
  return dataLength == 13 && frame[6] == 0x02 && frame[7] == 0xAA &&
         frame[17] == 0x55 && frame[18] == 0x00;
}

bool processRadarFrame(const uint8_t *frame, RadarData &radarData) {
  if (!isValidRadarFrame(frame)) {
    return false;
  }

  radarData.targetType = frame[8];
  radarData.movingDistanceCm = readLittleEndian16(&frame[9]);
  radarData.movingEnergy = frame[11];
  radarData.stationaryDistanceCm = readLittleEndian16(&frame[12]);
  radarData.stationaryEnergy = frame[14];
  radarData.detectionDistanceCm = readLittleEndian16(&frame[15]);

  return true;
}

bool radarDataChanged(const RadarData &left, const RadarData &right) {
  return left.targetType != right.targetType ||
         left.movingDistanceCm != right.movingDistanceCm ||
         left.movingEnergy != right.movingEnergy ||
         left.stationaryDistanceCm != right.stationaryDistanceCm ||
         left.stationaryEnergy != right.stationaryEnergy ||
         left.detectionDistanceCm != right.detectionDistanceCm;
}

void printOccupancyState(bool isOccupied, const RadarData &radarData) {
  Serial.println(isOccupied ? "OCCUPIED" : "AVAILABLE");

  if (!isOccupied) {
    return;
  }

  Serial.print("Target: ");
  Serial.println(targetTypeName(radarData.targetType));

  if (radarData.targetType == TARGET_MOVING) {
    Serial.print("Distance: ");
    Serial.print(radarData.movingDistanceCm);
    Serial.println(" cm");
    Serial.print("Energy: ");
    Serial.println(radarData.movingEnergy);
    return;
  }

  if (radarData.targetType == TARGET_STATIONARY) {
    Serial.print("Distance: ");
    Serial.print(radarData.stationaryDistanceCm);
    Serial.println(" cm");
    Serial.print("Energy: ");
    Serial.println(radarData.stationaryEnergy);
    return;
  }

  if (radarData.targetType == TARGET_MOVING_AND_STATIONARY) {
    Serial.print("Moving distance: ");
    Serial.print(radarData.movingDistanceCm);
    Serial.println(" cm");
    Serial.print("Moving energy: ");
    Serial.println(radarData.movingEnergy);
    Serial.print("Stationary distance: ");
    Serial.print(radarData.stationaryDistanceCm);
    Serial.println(" cm");
    Serial.print("Stationary energy: ");
    Serial.println(radarData.stationaryEnergy);
  }
}

void updateOccupancyState(const RadarData &radarData) {
  bool newOccupied = radarData.targetType != TARGET_NONE;
  bool shouldPrint = newOccupied != lastPrintedOccupied ||
                     (newOccupied && radarDataChanged(radarData, lastPrintedRadarData));

  occupied = newOccupied;

  if (shouldPrint) {
    printOccupancyState(occupied, radarData);
    lastPrintedOccupied = occupied;
    lastPrintedRadarData = radarData;
  }
}

void readRadarData() {
  while (ld2410cSerial.available() > 0) {
    uint8_t byte = ld2410cSerial.read();

    if (frameIndex < sizeof(FRAME_HEADER) && byte != FRAME_HEADER[frameIndex]) {
      frameIndex = byte == FRAME_HEADER[0] ? 1 : 0;
      continue;
    }

    frameBuffer[frameIndex++] = byte;

    if (frameIndex == FRAME_SIZE) {
      RadarData radarData;
      if (processRadarFrame(frameBuffer, radarData)) {
        latestRadarData = radarData;
        updateOccupancyState(latestRadarData);
      }

      frameIndex = 0;
    }
  }
}

void setup() {
  Serial.begin(115200);
  ld2410cSerial.begin(LD2410C_BAUD_RATE, SERIAL_8N1, LD2410C_RX_PIN, LD2410C_TX_PIN);

  Serial.println("LD2410C initialized");
  printOccupancyState(occupied, latestRadarData);
  lastPrintedOccupied = occupied;
  lastPrintedRadarData = latestRadarData;
}

void loop() {
  readRadarData();
}
