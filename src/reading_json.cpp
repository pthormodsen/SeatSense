#include "reading_json.h"

#include <stdio.h>
#include <time.h>

static void formatIsoTime(int64_t epochMs, char *out, size_t size) {
  time_t seconds = (time_t)(epochMs / 1000);
  struct tm utc;
  gmtime_r(&seconds, &utc);
  size_t len = strftime(out, size, "%Y-%m-%dT%H:%M:%S", &utc);
  snprintf(out + len, size - len, ".%03dZ", (int)(epochMs % 1000));
}

int formatReadingJson(const SensorReading &r, const char *sensorId, int rssi, char *out, size_t size) {
  char sentAt[40] = "null";
  if (r.epochMs > 0) {
    char iso[32];
    formatIsoTime(r.epochMs, iso, sizeof(iso));
    snprintf(sentAt, sizeof(sentAt), "\"%s\"", iso);
  }
  const char *occupied = r.occupied > 0 ? "true" : r.occupied == 0 ? "false" : "null";

  if (!r.radarValid) {
    return snprintf(out, size,
                    "{\"sensorId\":\"%s\",\"occupied\":%s,\"sentAt\":%s,\"seq\":%lu,"
                    "\"targetType\":null,\"movingCm\":null,\"stationaryCm\":null,"
                    "\"movingEnergy\":null,\"stationaryEnergy\":null,\"rssi\":%d,\"uptimeMs\":%lu}",
                    sensorId, occupied, sentAt, (unsigned long)r.seq, rssi, (unsigned long)r.uptimeMs);
  }
  return snprintf(out, size,
                  "{\"sensorId\":\"%s\",\"occupied\":%s,\"sentAt\":%s,\"seq\":%lu,"
                  "\"targetType\":%u,\"movingCm\":%u,\"stationaryCm\":%u,"
                  "\"movingEnergy\":%u,\"stationaryEnergy\":%u,\"rssi\":%d,\"uptimeMs\":%lu}",
                  sensorId, occupied, sentAt, (unsigned long)r.seq, (unsigned)r.targetType,
                  (unsigned)r.movingCm, (unsigned)r.stationaryCm, (unsigned)r.movingEnergy,
                  (unsigned)r.stationaryEnergy, rssi, (unsigned long)r.uptimeMs);
}
