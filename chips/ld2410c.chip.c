#include "wokwi-api.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#define LD2410C_BAUD_RATE 256000
#define REPORT_INTERVAL_US 250000
#define REPORT_FRAME_SIZE 23

typedef struct {
  uart_dev_t uart;
  timer_t report_timer;
  uint32_t presence_attr;
  uint32_t target_type_attr;
  uint32_t target_type_lower_attr;
  uint32_t moving_distance_attr;
  uint32_t moving_distance_lower_attr;
  uint32_t stationary_distance_attr;
  uint32_t stationary_distance_lower_attr;
  uint32_t moving_energy_attr;
  uint32_t moving_energy_lower_attr;
  uint32_t stationary_energy_attr;
  uint32_t stationary_energy_lower_attr;
  bool uart_busy;
  bool pending_report;
  uint8_t report_frame[REPORT_FRAME_SIZE];
} chip_state_t;

static uint16_t clamp_u16(uint32_t value, uint16_t max_value) {
  return value > max_value ? max_value : value;
}

static uint8_t clamp_u8(uint32_t value, uint8_t max_value) {
  return value > max_value ? max_value : value;
}

static uint16_t detection_distance(uint8_t target_type, uint16_t moving_distance,
                                   uint16_t stationary_distance) {
  if (target_type == 1) {
    return moving_distance;
  }

  if (target_type == 2) {
    return stationary_distance;
  }

  return moving_distance > stationary_distance ? moving_distance : stationary_distance;
}

static void put_u16_le(uint8_t *buffer, uint16_t value) {
  buffer[0] = value & 0xff;
  buffer[1] = value >> 8;
}

static uint32_t read_attr_with_lowercase_fallback(uint32_t camel_attr, uint32_t lower_attr) {
  uint32_t camel_value = attr_read(camel_attr);
  uint32_t lower_value = attr_read(lower_attr);
  return camel_value != 0 ? camel_value : lower_value;
}

static void build_ld2410c_basic_report(chip_state_t *chip) {
  uint8_t presence = clamp_u8(attr_read(chip->presence_attr), 1);
  uint8_t target_type = clamp_u8(
      read_attr_with_lowercase_fallback(chip->target_type_attr, chip->target_type_lower_attr), 3);
  uint16_t moving_distance = clamp_u16(read_attr_with_lowercase_fallback(
                                           chip->moving_distance_attr,
                                           chip->moving_distance_lower_attr),
                                       600);
  uint16_t stationary_distance = clamp_u16(read_attr_with_lowercase_fallback(
                                               chip->stationary_distance_attr,
                                               chip->stationary_distance_lower_attr),
                                           600);
  uint8_t moving_energy = clamp_u8(read_attr_with_lowercase_fallback(
                                       chip->moving_energy_attr, chip->moving_energy_lower_attr),
                                   100);
  uint8_t stationary_energy = clamp_u8(read_attr_with_lowercase_fallback(
                                           chip->stationary_energy_attr,
                                           chip->stationary_energy_lower_attr),
                                       100);

  if (!presence) {
    target_type = 0;
    moving_distance = 0;
    stationary_distance = 0;
    moving_energy = 0;
    stationary_energy = 0;
  }

  uint16_t detected_distance =
      detection_distance(target_type, moving_distance, stationary_distance);

  uint8_t *frame = chip->report_frame;
  frame[0] = 0xf4;
  frame[1] = 0xf3;
  frame[2] = 0xf2;
  frame[3] = 0xf1;
  frame[4] = 0x0d;
  frame[5] = 0x00;
  frame[6] = 0x02;
  frame[7] = 0xaa;
  frame[8] = target_type;
  put_u16_le(&frame[9], moving_distance);
  frame[11] = moving_energy;
  put_u16_le(&frame[12], stationary_distance);
  frame[14] = stationary_energy;
  put_u16_le(&frame[15], detected_distance);
  frame[17] = 0x55;
  frame[18] = 0x00;
  frame[19] = 0xf8;
  frame[20] = 0xf7;
  frame[21] = 0xf6;
  frame[22] = 0xf5;
}

static void send_report(chip_state_t *chip) {
  build_ld2410c_basic_report(chip);

  if (uart_write(chip->uart, chip->report_frame, REPORT_FRAME_SIZE)) {
    chip->uart_busy = true;
    chip->pending_report = false;
  } else {
    chip->pending_report = true;
  }
}

static void on_report_timer(void *user_data) {
  chip_state_t *chip = (chip_state_t *)user_data;

  if (chip->uart_busy) {
    chip->pending_report = true;
    return;
  }

  send_report(chip);
}

static void on_uart_write_done(void *user_data) {
  chip_state_t *chip = (chip_state_t *)user_data;
  chip->uart_busy = false;

  if (chip->pending_report) {
    send_report(chip);
  }
}

void chip_init(void) {
  chip_state_t *chip = malloc(sizeof(chip_state_t));
  chip->uart_busy = false;
  chip->pending_report = false;

  chip->presence_attr = attr_init("presence", 0);
  chip->target_type_attr = attr_init("targetType", 0);
  chip->target_type_lower_attr = attr_init("targettype", 0);
  chip->moving_distance_attr = attr_init("movingDistance", 0);
  chip->moving_distance_lower_attr = attr_init("movingdistance", 0);
  chip->stationary_distance_attr = attr_init("stationaryDistance", 0);
  chip->stationary_distance_lower_attr = attr_init("stationarydistance", 0);
  chip->moving_energy_attr = attr_init("movingEnergy", 0);
  chip->moving_energy_lower_attr = attr_init("movingenergy", 0);
  chip->stationary_energy_attr = attr_init("stationaryEnergy", 0);
  chip->stationary_energy_lower_attr = attr_init("stationaryenergy", 0);

  const uart_config_t uart_config = {
      .tx = pin_init("TX", INPUT_PULLUP),
      .rx = pin_init("RX", INPUT),
      .baud_rate = LD2410C_BAUD_RATE,
      .rx_data = NULL,
      .write_done = on_uart_write_done,
      .user_data = chip,
  };
  chip->uart = uart_init(&uart_config);

  const timer_config_t timer_config = {
      .callback = on_report_timer,
      .user_data = chip,
  };
  chip->report_timer = timer_init(&timer_config);
  timer_start(chip->report_timer, REPORT_INTERVAL_US, true);

  printf("HLK-LD2410C simulator started at %u baud\n", LD2410C_BAUD_RATE);
}
