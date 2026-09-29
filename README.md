# ESP32-S3 LD2410C Occupancy Prototype

First local simulator prototype for a study-desk occupancy sensor.

Real hardware target:

- ESP32-S3-DevKitM-1
- HLK-LD2410C 24 GHz mmWave presence sensor
- PlatformIO with the Arduino framework

Simulation target:

- Wokwi ESP32-S3 DevKitC-1 board
- Custom `chip-ld2410c` component that emulates LD2410C UART target-data frames

The Wokwi board differs from the real board because Wokwi does not provide an ESP32-S3 DevKitM-1 part. The PlatformIO firmware still builds for `esp32-s3-devkitm-1`.

## Requirements

Install the VS Code extensions:

- PlatformIO IDE
- Wokwi for VS Code

For compiling the custom chip outside VS Code, install the Wokwi CLI:

```sh
curl -L https://wokwi.com/ci/install.sh | sh
```

## Build Firmware

```sh
pio run
```

## Compile Custom Wokwi Chip

```sh
wokwi-cli chip compile chips/ld2410c.chip.c -o chips/ld2410c.chip.wasm
```

The generated `chips/ld2410c.chip.wasm` file is referenced by `wokwi.toml`.

## Launch Wokwi

Build the firmware and compile the custom chip first, then open the project in VS Code and start Wokwi from the `diagram.json` file.

The custom chip exposes runtime controls:

- `presence`: `0` no target, `1` target detected
- `targetType`: `0` none, `1` moving, `2` stationary, `3` moving + stationary
- `movingDistance`: moving target distance in cm
- `stationaryDistance`: stationary target distance in cm
- `movingEnergy`: moving target energy from 0 to 100
- `stationaryEnergy`: stationary target energy from 0 to 100

The firmware prints `OCCUPIED` or `AVAILABLE` only when the occupancy state changes.

## Serial Monitor

```sh
pio device monitor
```

The monitor speed is configured as `115200` in `platformio.ini`.

## Upload To Real Hardware Later

Connect the ESP32-S3 DevKitM-1 over USB, then run:

```sh
pio run --target upload
```

Connect the real LD2410C UART pins as:

- LD2410C `TX` -> ESP32 `GPIO17`
- LD2410C `RX` -> ESP32 `GPIO18`
- LD2410C `GND` -> ESP32 `GND`
- LD2410C `VCC` -> suitable sensor supply

## UART Pin Configuration

The firmware UART pins are configured near the top of `src/main.cpp`:

```cpp
const uint8_t LD2410C_RX_PIN = 17;
const uint8_t LD2410C_TX_PIN = 18;
```

Update those constants if you move the sensor UART wiring.
