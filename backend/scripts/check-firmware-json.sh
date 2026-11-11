#!/bin/sh
# Contract test between firmware and backend: compiles the firmware's JSON
# formatter (src/reading_json.cpp) for the host computer and checks every body
# it produces with the backend validator. Needs a C++ compiler and `npm run build`.
set -eu
cd "$(dirname "$0")/.."
out="${TMPDIR:-/tmp}/seatsense-firmware-json"
c++ -std=c++17 -Wall -Wextra -I../src scripts/firmware-json-driver.cpp ../src/reading_json.cpp -o "$out"
"$out" | node --input-type=module -e '
import { parseReading } from "./dist/src/validate.js";
import { createInterface } from "node:readline";
let failed = 0, count = 0;
for await (const line of createInterface({ input: process.stdin })) {
  count++;
  const result = parseReading(JSON.parse(line), "seat-001");
  console.log(result.ok ? "OK  " : "FAIL", line, result.ok ? "" : result.error);
  if (!result.ok) failed++;
}
if (failed || count === 0) { console.error(`${failed} of ${count} bodies rejected`); process.exit(1); }
console.log(`all ${count} firmware bodies accepted by the backend validator`);
'
