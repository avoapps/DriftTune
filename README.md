# DriftTune

**AI Drift Engineering Platform**  
InoCore Performance Motorsport · InoCore d.o.o. · Sežana, Slovenia · 2026

---

## System Architecture

See [`docs/01_Architecture.md`](docs/01_Architecture.md)

## Modules

| Module | Path | Status |
|--------|------|--------|
| CAN Bus (M1) | `module_can/` | ✅ Sprint 1+6 — simulator + real CAN reader |
| RPi Core (M2) | `module_core/` | ✅ Sprint 5 — compute, storage, WS server |
| In-Car UI (M2b) | `module_incar/` | ✅ Sprint 3 — analog gauges, carbon fiber, responsive |
| LTE Transport (M3) | `module_lte/` | ✅ Sprint 4 — delta encoding, msgpack, buffer |
| BoxLab UI (M4) | `module_boxlab/` | ✅ Sprint 2 — full React dashboard |

## Quick Start

### Full stack (development):

```bash
# Terminal 1 — Mock simulator (replaces CAN Bus + RPi Core)
cd module_can && python mock_simulator.py

# Terminal 2 — BoxLab UI
cd module_boxlab && npm start

# Terminal 3 — In-Car UI (optional)
cd module_incar && PORT=3001 npm start
```

### Full hardware stack (RPi):

```bash
# RPi — Step 1: Core Server
cd module_core && python core_server.py

# RPi — Step 2: CAN Bus reader
cd module_can && python can_reader.py --channel can0 --dbc ecu.dbc

# RPi — Step 3: LTE Sender (to BoxLab IP)
cd module_lte && python lte_sender.py --car CAR_01 --host 192.168.1.100

# BoxLab — Receiver
cd module_lte && python lte_receiver.py

# BoxLab — UI
cd module_boxlab && npm start
```

### OBD-II (ELM327 adapter):

```bash
# USB adapter
python module_can/obd_reader.py --port /dev/ttyUSB0

# Bluetooth adapter
python module_can/obd_reader.py --port /dev/rfcomm0

# WiFi adapter (ELM327 WiFi)
python module_can/obd_reader.py --wifi --wifi-host 192.168.0.10
```

### Mock CAN (no hardware):

```bash
cd module_can && python can_reader.py --mock
```

## Shared Interface

All modules communicate via the standardized telemetry object:
- `shared/telemetry_schema.py` — data structures
- `shared/constants.py` — constants, units, ranges

## Multilanguage

UI supports: `en` · `sl` · `de` · `it` · `hr`  
Translations: `module_boxlab/src/locales/`

## Sprint Progress

- [x] Sprint 1 — Interfaces + Mock Simulator
- [x] Sprint 2 — BoxLab UI (React)
- [x] Sprint 3 — In-Car UI (analog gauges, carbon fiber, responsive)
- [x] Sprint 4 — LTE Transport (delta encoding, msgpack, reconnect)
- [x] Sprint 5 — RPi Core (compute engine, SQLite storage, WS server)
- [x] Sprint 6 — CAN Bus reader (python-can, DBC support, socketcan)
