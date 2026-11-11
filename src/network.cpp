#include "network.h"

#if __has_include("secrets.h")
#include "secrets.h"
#define SEATSENSE_NETWORK 1
#else
#warning "include/secrets.h not found: building without networking (copy include/secrets.example.h)"
#define SEATSENSE_NETWORK 0
#endif

#if SEATSENSE_NETWORK

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <sys/time.h>
#include <time.h>

#include "root_ca.h"

#ifndef API_ROOT_CA
#define API_ROOT_CA ROOT_CA_BUNDLE
#endif

// Readings waiting for upload. Small on purpose: during a long outage old
// heartbeats are worthless, the newest state is what matters.
const UBaseType_t QUEUE_LENGTH = 8;
const uint32_t TASK_STACK_BYTES = 16384;  // TLS handshake needs a large stack
const UBaseType_t TASK_PRIORITY = 1;
const BaseType_t TASK_CORE = 0;  // Wi-Fi core; loop() and the radar run on core 1

const uint32_t WIFI_RETRY_MS = 15000;
const uint32_t NTP_WAIT_MS = 15000;
const uint32_t HTTP_TIMEOUT_MS = 5000;
const uint8_t MAX_ATTEMPTS = 3;
const uint32_t STATUS_INTERVAL_MS = 30000;
// Anything after 2023-11-14 counts as a synced clock.
const time_t MIN_VALID_EPOCH_S = 1700000000;

static QueueHandle_t readingQueue = nullptr;
static uint32_t nextSeq = 0;
static volatile uint32_t droppedCount = 0;
static uint32_t sentCount = 0;
static uint32_t failedCount = 0;

static int64_t currentEpochMs() {
  struct timeval now;
  gettimeofday(&now, nullptr);
  if (now.tv_sec < MIN_VALID_EPOCH_S) {
    return 0;
  }
  return (int64_t)now.tv_sec * 1000 + now.tv_usec / 1000;
}

bool networkSubmit(SensorReading reading) {
  if (readingQueue == nullptr) {
    return false;
  }
  reading.seq = ++nextSeq;
  reading.uptimeMs = millis();
  reading.epochMs = currentEpochMs();

  if (xQueueSend(readingQueue, &reading, 0) != pdTRUE) {
    SensorReading oldest;
    xQueueReceive(readingQueue, &oldest, 0);
    droppedCount++;
    xQueueSend(readingQueue, &reading, 0);
  }
  return true;
}

static const String READINGS_URL = String(API_BASE_URL) + "/api/sensors/" + SENSOR_ID + "/readings";
static const bool USE_TLS = READINGS_URL.startsWith("https://");

static WiFiClientSecure tlsClient;
static WiFiClient plainClient;
static HTTPClient http;

// Returns the HTTP status code, or a negative HTTPClient error code.
static int postReading(const SensorReading &reading) {
  int rssi = WiFi.RSSI();
  if (rssi > 0) rssi = 0;
  if (rssi < -127) rssi = -127;

  char body[384];
  int length = formatReadingJson(reading, SENSOR_ID, rssi, body, sizeof(body));
  if (length <= 0 || length >= (int)sizeof(body)) {
    Serial.println("[net] reading JSON did not fit the buffer");
    return HTTPC_ERROR_TOO_LESS_RAM;
  }

  bool started = USE_TLS ? http.begin(tlsClient, READINGS_URL) : http.begin(plainClient, READINGS_URL);
  if (!started) {
    return HTTPC_ERROR_CONNECTION_REFUSED;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);

  int code = http.POST((uint8_t *)body, length);
  if (code > 0) {
    String response = http.getString();  // read fully so the connection can be reused
    if (code < 200 || code >= 300) {
      Serial.printf("[net] seq %lu rejected: HTTP %d %s\n", (unsigned long)reading.seq, code,
                    response.substring(0, 160).c_str());
    }
  } else {
    Serial.printf("[net] seq %lu failed: %s\n", (unsigned long)reading.seq,
                  HTTPClient::errorToString(code).c_str());
  }
  http.end();
  return code;
}

static void printStatus() {
  bool connected = WiFi.status() == WL_CONNECTED;
  Serial.printf("[net] wifi=%s rssi=%d ntp=%s sent=%lu failed=%lu dropped=%lu queued=%u\n",
                connected ? "connected" : "disconnected", connected ? WiFi.RSSI() : 0,
                currentEpochMs() > 0 ? "synced" : "not synced", (unsigned long)sentCount,
                (unsigned long)failedCount, (unsigned long)droppedCount,
                (unsigned)uxQueueMessagesWaiting(readingQueue));
}

static void networkTask(void *) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  Serial.printf("[net] connecting to Wi-Fi \"%s\", uploading to %s\n", WIFI_SSID, READINGS_URL.c_str());

  if (USE_TLS) {
    tlsClient.setCACert(API_ROOT_CA);
    tlsClient.setHandshakeTimeout(HTTP_TIMEOUT_MS / 1000);
  }
  http.setReuse(true);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  bool wasConnected = false;
  uint32_t lastWifiAttemptMs = millis();
  uint32_t connectedAtMs = 0;
  uint32_t lastStatusMs = millis();
  uint32_t retryAtMs = 0;
  SensorReading pending;
  bool hasPending = false;
  uint8_t attempts = 0;

  for (;;) {
    uint32_t nowMs = millis();
    if ((uint32_t)(nowMs - lastStatusMs) >= STATUS_INTERVAL_MS) {
      lastStatusMs = nowMs;
      printStatus();
    }

    bool connected = WiFi.status() == WL_CONNECTED;
    if (connected != wasConnected) {
      wasConnected = connected;
      if (connected) {
        connectedAtMs = nowMs;
        Serial.printf("[net] Wi-Fi connected, IP %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(),
                      WiFi.RSSI());
      } else {
        Serial.println("[net] Wi-Fi disconnected, readings are queued until it is back");
        http.end();
      }
    }

    if (!connected) {
      // Auto-reconnect handles most drops; this also covers an access point
      // that was missing at boot.
      if ((uint32_t)(nowMs - lastWifiAttemptMs) >= WIFI_RETRY_MS) {
        lastWifiAttemptMs = nowMs;
        Serial.println("[net] retrying Wi-Fi connection");
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      }
      vTaskDelay(pdMS_TO_TICKS(250));
      continue;
    }

    // Give NTP a moment after connecting so the first readings carry sentAt.
    // Upload anyway if it takes too long; sentAt is then null.
    if (currentEpochMs() == 0 && (uint32_t)(nowMs - connectedAtMs) < NTP_WAIT_MS) {
      vTaskDelay(pdMS_TO_TICKS(250));
      continue;
    }

    if (!hasPending) {
      if (xQueueReceive(readingQueue, &pending, pdMS_TO_TICKS(250)) != pdTRUE) {
        continue;
      }
      hasPending = true;
      attempts = 0;
      retryAtMs = millis();
    }

    if ((int32_t)(millis() - retryAtMs) < 0) {
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    }

    int code = postReading(pending);
    attempts++;
    if (code >= 200 && code < 300) {
      sentCount++;
      hasPending = false;
    } else {
      failedCount++;
      // 4xx (bad token, invalid payload) will not succeed on retry.
      bool permanent = code >= 400 && code < 500;
      if (permanent || attempts >= MAX_ATTEMPTS) {
        Serial.printf("[net] giving up on seq %lu after %u attempt(s)\n", (unsigned long)pending.seq, attempts);
        hasPending = false;
      } else {
        retryAtMs = millis() + (1000UL << attempts);  // 2 s, 4 s
      }
    }
  }
}

void networkBegin() {
  readingQueue = xQueueCreate(QUEUE_LENGTH, sizeof(SensorReading));
  if (readingQueue == nullptr) {
    Serial.println("[net] could not create the reading queue, networking disabled");
    return;
  }
  BaseType_t created = xTaskCreatePinnedToCore(networkTask, "network", TASK_STACK_BYTES, nullptr,
                                               TASK_PRIORITY, nullptr, TASK_CORE);
  if (created != pdPASS) {
    Serial.println("[net] could not start the network task, networking disabled");
    vQueueDelete(readingQueue);
    readingQueue = nullptr;
  }
}

#else  // !SEATSENSE_NETWORK

void networkBegin() {
  Serial.println("[net] disabled: include/secrets.h is missing (copy include/secrets.example.h)");
}

bool networkSubmit(SensorReading) {
  return false;
}

#endif
