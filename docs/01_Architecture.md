# DriftTune — System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MODULE 1: CAN Bus                        │
│                                                             │
│  Sensors → ECU → CAN Bus → Parser → Standardized JSON      │
│                                                             │
│  INPUT:   CAN frames (raw bytes, 500 kbit/s)                │
│  OUTPUT:  {"rpm":6240, "spd":72.4, ...} @ 50Hz             │
│  INTERFACE: Internal Python API                             │
└─────────────────┬───────────────────────────────────────────┘
                  │ standardized telemetry object
┌─────────────────▼───────────────────────────────────────────┐
│                    MODULE 2: RPi Core                       │
│                                                             │
│  - Receives data from Module 1                              │
│  - Computes: drift angle, G-magnitude, AI score, alarms     │
│  - Stores: SQLite / InfluxDB (session log)                  │
│  - Streams: to Module 3 (LTE) and local UI (LCD)            │
│                                                             │
│  INPUT:   telemetry object from M1                          │
│  OUTPUT:  enriched object + session ID + alarms             │
│  INTERFACE: WebSocket server @ ws://localhost:8765          │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           │ LTE stream               │ local HDMI
┌──────────▼──────────┐   ┌──────────▼──────────────────────┐
│   MODULE 3: LTE     │   │   MODULE 2b: In-Car UI          │
│                     │   │                                  │
│  - Delta encoding   │   │  - RPi LCD dashboard             │
│  - MessagePack      │   │  - Driver sees everything        │
│  - Reconnect logic  │   │    in-car                        │
│  - Buffer on loss   │   │  - Local, no internet required   │
│                     │   │                                  │
│  INPUT:  WS local   │   │  INPUT:  WebSocket localhost     │
│  OUTPUT: LTE stream │   │  OUTPUT: UI on display           │
└──────────┬──────────┘   └──────────────────────────────────┘
           │ optimized binary stream
┌──────────▼──────────────────────────────────────────────────┐
│                    MODULE 4: BoxLab                         │
│                                                             │
│  RECEIVER:                                                  │
│  - Multi-car receiver (N cars simultaneously)               │
│  - Each car = own WebSocket channel + Session ID            │
│                                                             │
│  REAL-TIME UI:                                              │
│  - Per-car dashboard                                        │
│  - Side-by-side comparison (car A vs car B)                 │
│  - Alarms for all cars simultaneously                       │
│  - GPS track map with all cars                              │
│                                                             │
│  POST-SESSION ANALYSIS:                                     │
│  - Lap-to-lap comparison                                    │
│  - AI driver scoring                                        │
│  - PDF report generator                                     │
│  - CSV export                                               │
│                                                             │
│  INPUT:   LTE stream from Module 3 (N sources)              │
│  OUTPUT:  UI / PDF / CSV / DB                               │
└─────────────────────────────────────────────────────────────┘
```

## Module Summary

| Module | Role | Input | Output | Interface |
|--------|------|-------|--------|-----------|
| **1 — CAN Bus** | Data acquisition from sensors & ECU | CAN frames @ 500 kbit/s | Standardized JSON @ 50 Hz | Internal Python API |
| **2 — RPi Core** | Processing, computing, storage, routing | Telemetry object from M1 | Enriched object + alarms | WebSocket @ ws://localhost:8765 |
| **2b — In-Car UI** | Driver-facing real-time display | WebSocket localhost | LCD dashboard | HDMI / DSI |
| **3 — LTE** | Secure optimized transport to pit box | WebSocket local | Binary LTE stream | MessagePack + delta encoding |
| **4 — BoxLab** | Multi-car monitoring & post-session analysis | LTE stream (N sources) | UI / PDF / CSV / DB | Web app / desktop |

## Key Design Principles

- **Modular** — each module is independent and replaceable
- **Interface-first** — modules communicate only through defined interfaces
- **Transport-agnostic** — the app does not care whether data comes from CAN Bus, OBD-II, LTE, WiFi, or a simulator
- **Multilanguage** — all UI labels, variable names, and code comments are in English; UI supports i18n for SL, EN, DE and other languages
- **Offline-capable** — in-car UI (Module 2b) works without any network connection
- **Resilient** — LTE module buffers data on signal loss and resumes on reconnect
