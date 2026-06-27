# DriftTune

**AI Drift Engineering Platform**  
InoCore Performance Motorsport · InoCore d.o.o. · Sežana, Slovenia · 2026

---

## System Architecture

See [`docs/01_Architecture.md`](docs/01_Architecture.md)

## Modules

| Module | Path | Status |
|--------|------|--------|
| CAN Bus (M1) | `module_can/` | 🟡 Sprint 1 — simulator ready |
| RPi Core (M2) | `module_core/` | 🔲 Sprint 2 |
| In-Car UI (M2b) | `module_incar/` | 🔲 Sprint 4 |
| LTE Transport (M3) | `module_lte/` | 🔲 Sprint 5 |
| BoxLab UI (M4) | `module_boxlab/` | 🟡 Sprint 1 — i18n ready |

## Quick Start — Mock Simulator

```bash
# Install dependencies
pip install websockets

# Run simulator (single car, drift_run scenario)
python module_can/mock_simulator.py

# Run with 2 cars
python module_can/mock_simulator.py --cars 2

# Available scenarios: drift_run | warm_up | pit | alarm_test
python module_can/mock_simulator.py --scenario alarm_test
```

WebSocket output: `ws://localhost:8765/ws/telemetry/CAR_01`

## Shared Interface

All modules communicate via the standardized telemetry object defined in:
- `shared/telemetry_schema.py` — data structures
- `shared/constants.py` — constants, units, ranges

## Multilanguage

UI supports: `en` · `sl` · `de` · `it` · `hr`  
Translations: `module_boxlab/src/locales/`

All code, variable names, comments and UI labels are in **English**.

## Sprint Progress

- [x] Sprint 1 — Interfaces + Mock Simulator
- [ ] Sprint 2 — BoxLab UI (React)
- [ ] Sprint 3 — In-Car UI
- [ ] Sprint 4 — LTE Transport Module
- [ ] Sprint 5 — RPi Core + CAN Bus integration
- [ ] Sprint 6 — Full hardware integration
