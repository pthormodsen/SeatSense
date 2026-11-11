#pragma once

#include <Arduino.h>

#include "reading_json.h"

// Starts Wi-Fi, NTP and the network task (core 0). Does nothing if
// include/secrets.h is missing.
void networkBegin();

// Queues a reading for upload. Never blocks: if the queue is full the oldest
// queued reading is dropped (and counted). Returns false if networking is
// disabled.
bool networkSubmit(SensorReading reading);
