#pragma once

// Copy this file to include/secrets.h and fill in real values.
// include/secrets.h is git-ignored: never commit real credentials.
// Without include/secrets.h the firmware builds with networking disabled.

// 2.4 GHz WPA2-Personal network, e.g. a phone hotspot. eduroam
// (WPA2-Enterprise) is not supported.
#define WIFI_SSID "your-hotspot-name"
#define WIFI_PASSWORD "your-hotspot-password"

// Base URL of the SeatSense site, without a trailing slash. Readings are POSTed
// to API_BASE_URL "/api/sensors/" SENSOR_ID "/readings".
//   https://...  production through Cloudflare; the server certificate is
//                verified against src/root_ca.h.
//   http://...   local testing only, e.g. http://192.168.x.y:3001 for the
//                backend on a laptop on the same hotspot. Not encrypted.
#define API_BASE_URL "https://seatsense.example.com"

// Must match an entry "SENSOR_ID:DEVICE_TOKEN" in the backend's DEVICE_TOKENS.
// Sensor id: letters, digits, '-' and '_' only.
#define SENSOR_ID "seat-001"
#define DEVICE_TOKEN "replace-with-the-token-from-DEVICE_TOKENS"

// Optional: replace the CA bundle in src/root_ca.h with your own PEM root(s).
// #define API_ROOT_CA "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
