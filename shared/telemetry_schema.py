"""
DriftTune — Shared Telemetry Schema
====================================
This is the SINGLE SOURCE OF TRUTH for all data structures
passed between modules. All modules MUST use these definitions.

Module interfaces:
  M1 (CAN Bus)  → outputs RawTelemetry
  M2 (RPi Core) → inputs RawTelemetry, outputs EnrichedTelemetry
  M3 (LTE)      → transports EnrichedTelemetry
  M4 (BoxLab)   → receives EnrichedTelemetry
"""

from dataclasses import dataclass, field
from typing import Optional
import time


# ---------------------------------------------------------------------------
# MODULE 1 → MODULE 2
# Raw telemetry — direct sensor values, no computation
# ---------------------------------------------------------------------------

@dataclass
class RawTelemetry:
    # Identity
    car_id:     str   = "CAR_01"
    session_id: str   = ""
    ts:         float = field(default_factory=time.time)  # Unix timestamp

    # Engine
    rpm:        float = 0.0     # Engine RPM             [rpm]
    tps:        float = 0.0     # Throttle position       [%]
    afr:        float = 14.7    # Air/fuel ratio (lambda) [AFR]
    boost:      float = 0.0     # Boost pressure          [bar]
    egt:        float = 0.0     # Exhaust gas temp        [°C]
    h2o:        float = 0.0     # Coolant temperature     [°C]
    oil_temp:   float = 0.0     # Oil temperature         [°C]
    oil_press:  float = 0.0     # Oil pressure            [bar]
    fuel_press: float = 0.0     # Fuel pressure           [bar]
    ignition:   float = 0.0     # Ignition timing         [°BTDC]
    knock:      float = 0.0     # Knock level             [0–100]
    injector_dc:float = 0.0     # Injector duty cycle     [%]
    battery:    float = 12.0    # Battery voltage         [V]

    # Vehicle dynamics
    spd:        float = 0.0     # Vehicle speed           [km/h]
    gear:       int   = 0       # Gear position           [0–6]

    # IMU
    gx:         float = 0.0     # Lateral G-force         [G]
    gy:         float = 0.0     # Longitudinal G-force    [G]
    gz:         float = 0.0     # Vertical G-force        [G]
    yaw:        float = 0.0     # Yaw rate                [°/s]
    pitch:      float = 0.0     # Pitch rate              [°/s]
    roll:       float = 0.0     # Roll rate               [°/s]

    # GPS
    lat:        float = 0.0     # Latitude                [°]
    lon:        float = 0.0     # Longitude               [°]
    gps_speed:  float = 0.0     # GPS speed               [km/h]
    gps_heading:float = 0.0     # GPS heading             [°]
    gps_alt:    float = 0.0     # Altitude                [m]

    # Driver inputs
    steering:   float = 0.0     # Steering angle          [°]
    brake:      float = 0.0     # Brake pressure          [bar]
    handbrake:  float = 0.0     # Handbrake               [0–1]
    clutch:     float = 0.0     # Clutch position         [%]

    # Wheel speeds
    wsp_fl:     float = 0.0     # Wheel speed front left  [km/h]
    wsp_fr:     float = 0.0     # Wheel speed front right [km/h]
    wsp_rl:     float = 0.0     # Wheel speed rear left   [km/h]
    wsp_rr:     float = 0.0     # Wheel speed rear right  [km/h]

    # Suspension
    susp_fl:    float = 0.0     # Suspension travel FL    [mm]
    susp_fr:    float = 0.0     # Suspension travel FR    [mm]
    susp_rl:    float = 0.0     # Suspension travel RL    [mm]
    susp_rr:    float = 0.0     # Suspension travel RR    [mm]

    # Tires
    tire_temp_fl: float = 0.0   # Tire temperature FL     [°C]
    tire_temp_fr: float = 0.0   # Tire temperature FR     [°C]
    tire_temp_rl: float = 0.0   # Tire temperature RL     [°C]
    tire_temp_rr: float = 0.0   # Tire temperature RR     [°C]
    tire_press_fl:float = 0.0   # Tire pressure FL        [bar]
    tire_press_fr:float = 0.0   # Tire pressure FR        [bar]
    tire_press_rl:float = 0.0   # Tire pressure RL        [bar]
    tire_press_rr:float = 0.0   # Tire pressure RR        [bar]

    def to_dict(self) -> dict:
        return self.__dict__.copy()


# ---------------------------------------------------------------------------
# ALARM
# ---------------------------------------------------------------------------

@dataclass
class Alarm:
    alarm_id:   str   = ""
    parameter:  str   = ""      # e.g. "h2o", "oil_press"
    value:      float = 0.0
    threshold:  float = 0.0
    severity:   str   = "WARNING"   # WARNING | CRITICAL
    message:    str   = ""


# ---------------------------------------------------------------------------
# MODULE 2 → MODULE 3 → MODULE 4
# Enriched telemetry — raw + computed values + alarms
# ---------------------------------------------------------------------------

@dataclass
class EnrichedTelemetry:
    # Pass-through raw data
    raw:        RawTelemetry = field(default_factory=RawTelemetry)

    # Computed by RPi Core (Module 2)
    drift_angle:    float = 0.0     # Sideslip angle          [°]
    g_magnitude:    float = 0.0     # Combined G-force        [G]
    wheel_slip_r:   float = 0.0     # Rear wheel slip ratio   [%]
    ai_score:       float = 0.0     # AI driver score         [0–10]
    driver_style:   str   = ""      # AGGRESSIVE | TECHNICAL | HYBRID
    track_sector:   str   = ""      # S1 | S2 | S3 | S4 | S5
    lap_number:     int   = 0
    lap_time:       float = 0.0     # Current lap time        [s]

    # Alarms
    alarms: list = field(default_factory=list)  # List[Alarm]

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        d["raw"] = self.raw.to_dict()
        d["alarms"] = [a.__dict__ for a in self.alarms]
        return d


# ---------------------------------------------------------------------------
# ALARM THRESHOLDS
# Centralized — change here, applies everywhere
# ---------------------------------------------------------------------------

ALARM_THRESHOLDS = {
    "h2o":       {"warning": 100, "critical": 110},   # Coolant temp [°C]
    "oil_temp":  {"warning": 120, "critical": 135},   # Oil temp     [°C]
    "oil_press": {"warning": 1.5, "critical": 1.0},   # Oil pressure [bar] — LOW alarm
    "egt":       {"warning": 800, "critical": 950},   # EGT          [°C]
    "knock":     {"warning": 30,  "critical": 60},    # Knock level
    "battery":   {"warning": 11.5,"critical": 10.5},  # Battery      [V]  — LOW alarm
    "boost":     {"warning": 2.0, "critical": 2.4},   # Boost        [bar]
}


# ---------------------------------------------------------------------------
# SEND RATES — adaptive frequency per parameter
# Used by Module 3 (LTE) to reduce bandwidth
# ---------------------------------------------------------------------------

SEND_RATES_HZ = {
    # Critical — 50 Hz
    "rpm": 50, "tps": 50, "gx": 50, "gy": 50, "yaw": 50,
    "drift_angle": 50, "steering": 50, "brake": 50,

    # Medium — 25 Hz
    "spd": 25, "afr": 25, "boost": 25, "gear": 25,
    "wsp_fl": 25, "wsp_fr": 25, "wsp_rl": 25, "wsp_rr": 25,

    # Slow — 10 Hz
    "lat": 10, "lon": 10, "gps_speed": 10, "gps_heading": 10,
    "knock": 10, "ignition": 10,

    # Very slow — 1 Hz
    "h2o": 1, "oil_temp": 1, "oil_press": 1, "egt": 1,
    "fuel_press": 1, "battery": 1, "injector_dc": 1,
    "tire_temp_fl": 1, "tire_temp_fr": 1,
    "tire_temp_rl": 1, "tire_temp_rr": 1,
    "tire_press_fl": 1, "tire_press_fr": 1,
    "tire_press_rl": 1, "tire_press_rr": 1,
    "susp_fl": 1, "susp_fr": 1, "susp_rl": 1, "susp_rr": 1,
}
