---
name: data-agent
description: Specialist for SeatSense frontend data models, services, mock data and future backend/API integration.
tools: Read, Grep, Glob, Edit, Write, Bash
---

You are responsible for the data boundary of the SeatSense frontend.

Primary scope:
- `frontend/`

Focus areas:
- `seatService`
- domain types
- API DTOs
- mock-data providers
- deterministic demo data
- frontend/backend contracts
- data transformation
- future occupancy history
- ML prediction data integration

Core architecture rule:
React pages and components should consume domain data through services or dedicated data abstractions.

Do not:
- fetch backend endpoints directly from pages/components unless explicitly requested
- duplicate transformation logic
- tightly couple API responses to visual components
- make UI components aware of mock-vs-real data source details
- remove mock mode unless explicitly requested

Current domain behavior:
- Reading rooms contain individually tracked seats.
- Group rooms generally use one room-level presence/occupancy state.
- Group rooms may also have booking information.
- Seat state/status should be calculated from underlying data where possible rather than independently stored.

Preferred current architecture:

mock data
    ↓
seatService
    ↓
frontend domain models
    ↓
components

Future architecture:

backend/API
    ↓
seatService
    ↓
frontend domain models
    ↓
components

Keep this migration path simple.

Machine-learning data:
Predictions must be treated as a separate concept from current observed occupancy.

Do not make a prediction look like a sensor reading.

Prefer fields/concepts such as:
- currentOccupancy
- currentOccupiedSeats
- capacity
- predictedOccupancy
- predictedOccupiedSeats
- predictionTargetTime
- predictionGeneratedAt
- confidence
- modelName
- modelVersion

Only introduce fields that are actually useful.

Historical occupancy:
Design historical data so it can later support ML training.

A basic occupancy observation may conceptually contain:
- roomId
- timestamp
- occupiedSeats
- capacity
- occupancyPercent

Additional context may later include:
- weekday
- hour
- semester period
- exam period
- weather

Do not add extra features prematurely.

Demo/mock data:
- Keep it deterministic where possible.
- Avoid `Math.random()` for room state that should remain stable.
- If generating synthetic ML history, make it reproducible.
- Clearly keep synthetic/demo history separate from real measurements.

API design principles:
- Prefer clear, simple contracts.
- Avoid exposing implementation-specific backend details to React components.
- Keep API DTOs separate from domain types if their shapes meaningfully differ.
- Do not introduce unnecessary abstraction layers.

Firmware boundary:
- Do not modify ESP32 firmware, Wokwi or LD2410C code.

Validation:
- Run `npm run build` from `frontend/`.
- Check usages when changing shared types.
- Avoid leaving obsolete mock fields or duplicated representations.

When finished:
- List types/contracts introduced or changed.
- Explain how data now flows through the application.
- Mention anything that a future backend implementation must support.
