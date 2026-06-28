"""
DriftTune — Compute Engine
===========================
Takes RawTelemetry and computes derived values:
  - Drift angle (sideslip estimation)
  - G-magnitude
  - Rear wheel slip ratio
  - AI driver score
  - Driver style classification
  - Track sector (time-based, hardware GPS sector in Sprint 6)
  - Alarm detection
"""

import math
import time
from collections import deque

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.telemetry_schema import RawTelemetry, EnrichedTelemetry, Alarm, ALARM_THRESHOLDS
from shared.constants import TRACK_SECTOR_NAMES, DRIVER_STYLES


# ── Drift angle estimation ─────────────────────────────────────────────────────

def compute_drift_angle(raw: RawTelemetry) -> float:
    """
    Estimate sideslip angle from yaw rate and speed.
    β ≈ arctan(yaw_rate * wheelbase / speed)
    Wheelbase ~2.5m for typical drift car.
    """
    if raw.spd < 5.0:
        return 0.0
    speed_ms = raw.spd / 3.6
    yaw_rad = math.radians(raw.yaw)
    wheelbase = 2.5
    slip_rad = math.atan2(yaw_rad * wheelbase, speed_ms)
    # Blend with lateral G for better estimate
    g_contribution = math.degrees(math.atan(abs(raw.gx) * 0.4))
    drift = abs(math.degrees(slip_rad)) * 0.6 + g_contribution * 0.4
    return min(drift, 90.0)


# ── Rear wheel slip ────────────────────────────────────────────────────────────

def compute_wheel_slip(raw: RawTelemetry) -> float:
    """Rear wheel slip ratio: (rear_avg - front_avg) / front_avg * 100"""
    front = (raw.wsp_fl + raw.wsp_fr) / 2.0
    rear  = (raw.wsp_rl + raw.wsp_rr) / 2.0
    if front < 1.0:
        return 0.0
    return max(0.0, (rear - front) / front * 100.0)


# ── G-magnitude ───────────────────────────────────────────────────────────────

def compute_g_magnitude(raw: RawTelemetry) -> float:
    return math.sqrt(raw.gx ** 2 + raw.gy ** 2)


# ── AI driver score ───────────────────────────────────────────────────────────

class AIScorer:
    """
    Rolling AI score based on:
    - Drift angle consistency (smooth = good)
    - Throttle control during drift
    - G-force utilization
    - Smooth steering inputs
    """

    def __init__(self, window: int = 100):
        self._drift_history  = deque(maxlen=window)
        self._tps_history    = deque(maxlen=window)
        self._steering_hist  = deque(maxlen=window)
        self._score          = 5.0

    def update(self, raw: RawTelemetry, drift_angle: float, g_mag: float) -> float:
        self._drift_history.append(drift_angle)
        self._tps_history.append(raw.tps)
        self._steering_hist.append(abs(raw.steering))

        if len(self._drift_history) < 10:
            return self._score

        # Drift consistency: low variance = controlled drift
        drift_mean = sum(self._drift_history) / len(self._drift_history)
        drift_var  = sum((x - drift_mean) ** 2 for x in self._drift_history) / len(self._drift_history)
        consistency = max(0, 1.0 - drift_var / 400.0)   # 400 = max acceptable variance

        # Throttle control: smooth TPS during drift
        tps_changes = [abs(self._tps_history[i] - self._tps_history[i-1])
                       for i in range(1, len(self._tps_history))]
        tps_smoothness = max(0, 1.0 - (sum(tps_changes) / len(tps_changes)) / 10.0)

        # G utilization: using available grip
        g_score = min(1.0, g_mag / 2.5)

        # Steering smoothness
        str_changes = [abs(self._steering_hist[i] - self._steering_hist[i-1])
                       for i in range(1, len(self._steering_hist))]
        str_smoothness = max(0, 1.0 - (sum(str_changes) / len(str_changes)) / 15.0)

        # Weighted score 0–10
        raw_score = (
            consistency    * 3.5 +
            tps_smoothness * 2.5 +
            g_score        * 2.0 +
            str_smoothness * 2.0
        )

        # Exponential moving average to avoid jumps
        self._score = self._score * 0.95 + raw_score * 0.05
        return round(self._score, 2)


# ── Driver style classification ───────────────────────────────────────────────

def classify_driver_style(drift_angle: float, tps: float, g_mag: float) -> str:
    if drift_angle > 30 and tps > 70:
        return "AGGRESSIVE"
    elif drift_angle > 15 and g_mag > 1.5:
        return "TECHNICAL"
    return "HYBRID"


# ── Track sector (time-based fallback, GPS-based in Sprint 6) ─────────────────

class SectorTracker:
    SECTOR_DURATION = 8.0  # seconds per sector (placeholder)

    def __init__(self):
        self._session_start = time.time()

    def current_sector(self) -> str:
        elapsed = time.time() - self._session_start
        idx = int(elapsed / self.SECTOR_DURATION) % len(TRACK_SECTOR_NAMES)
        return TRACK_SECTOR_NAMES[idx]

    def reset(self):
        self._session_start = time.time()


# ── Alarm detection ───────────────────────────────────────────────────────────

def detect_alarms(raw: RawTelemetry) -> list[Alarm]:
    alarms = []

    checks = [
        # (parameter, value, direction) — direction: 'high' or 'low'
        ("h2o",       raw.h2o,       "high"),
        ("oil_temp",  raw.oil_temp,  "high"),
        ("oil_press", raw.oil_press, "low"),
        ("egt",       raw.egt,       "high"),
        ("knock",     raw.knock,     "high"),
        ("battery",   raw.battery,   "low"),
        ("boost",     raw.boost,     "high"),
    ]

    for param, value, direction in checks:
        thresholds = ALARM_THRESHOLDS.get(param)
        if not thresholds:
            continue

        warn  = thresholds["warning"]
        crit  = thresholds["critical"]

        if direction == "high":
            if value >= crit:
                alarms.append(Alarm(
                    alarm_id=f"{param}_critical",
                    parameter=param, value=value,
                    threshold=crit, severity="CRITICAL",
                    message=f"{param.upper()} critical: {value:.1f}"
                ))
            elif value >= warn:
                alarms.append(Alarm(
                    alarm_id=f"{param}_warning",
                    parameter=param, value=value,
                    threshold=warn, severity="WARNING",
                    message=f"{param.upper()} high: {value:.1f}"
                ))
        else:  # low alarm
            if value <= crit:
                alarms.append(Alarm(
                    alarm_id=f"{param}_critical",
                    parameter=param, value=value,
                    threshold=crit, severity="CRITICAL",
                    message=f"{param.upper()} critical low: {value:.1f}"
                ))
            elif value <= warn:
                alarms.append(Alarm(
                    alarm_id=f"{param}_warning",
                    parameter=param, value=value,
                    threshold=warn, severity="WARNING",
                    message=f"{param.upper()} low: {value:.1f}"
                ))

    return alarms


# ── Lap timer ─────────────────────────────────────────────────────────────────

class LapTimer:
    def __init__(self):
        self._lap_start  = time.time()
        self._lap_number = 1

    def tick(self) -> tuple[int, float]:
        return self._lap_number, time.time() - self._lap_start

    def next_lap(self):
        self._lap_start  = time.time()
        self._lap_number += 1

    def reset(self):
        self._lap_start  = time.time()
        self._lap_number = 1
