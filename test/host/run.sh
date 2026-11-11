#!/bin/sh
# Host tests for firmware logic that has no Arduino dependencies.
set -eu
cd "$(dirname "$0")"
out="${TMPDIR:-/tmp}/seatsense-seat-filter-test"
c++ -std=c++17 -Wall -Wextra -Werror seat_filter_test.cpp ../../src/seat_filter.cpp -o "$out"
"$out"
