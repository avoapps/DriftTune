"""
DriftTune — Shared Constants
==============================
All constants, enums and configuration values used across modules.
"""

# ---------------------------------------------------------------------------
# SYSTEM
# ---------------------------------------------------------------------------

APP_NAME        = "DriftTune"
APP_VERSION     = "2.0.0"
COMPANY         = "InoCore Performance Motorsport"
WEBSOCKET_PORT  = 8765
TELEMETRY_HZ    = 50       # Default telemetry rate


# ---------------------------------------------------------------------------
# CAR IDs
# ---------------------------------------------------------------------------

MAX_CARS        = 10       # Maximum simultaneous cars in BoxLab


# ---------------------------------------------------------------------------
# PARAMETER UNITS — used by UI for display
# ---------------------------------------------------------------------------

PARAM_UNITS = {
    "rpm":          "rpm",
    "tps":          "%",
    "afr":          "AFR",
    "boost":        "bar",
    "egt":          "°C",
    "h2o":          "°C",
    "oil_temp":     "°C",
    "oil_press":    "bar",
    "fuel_press":   "bar",
    "ignition":     "°",
    "knock":        "",
    "injector_dc":  "%",
    "battery":      "V",
    "spd":          "km/h",
    "gear":         "",
    "gx":           "G",
    "gy":           "G",
    "gz":           "G",
    "yaw":          "°/s",
    "drift_angle":  "°",
    "g_magnitude":  "G",
    "wheel_slip_r": "%",
    "ai_score":     "/10",
    "steering":     "°",
    "brake":        "bar",
    "clutch":       "%",
    "wsp_fl":       "km/h",
    "wsp_fr":       "km/h",
    "wsp_rl":       "km/h",
    "wsp_rr":       "km/h",
    "tire_temp_fl": "°C",
    "tire_temp_fr": "°C",
    "tire_temp_rl": "°C",
    "tire_temp_rr": "°C",
    "tire_press_fl":"bar",
    "tire_press_fr":"bar",
    "tire_press_rl":"bar",
    "tire_press_rr":"bar",
    "susp_fl":      "mm",
    "susp_fr":      "mm",
    "susp_rl":      "mm",
    "susp_rr":      "mm",
    "lat":          "°",
    "lon":          "°",
    "lap_time":     "s",
}


# ---------------------------------------------------------------------------
# PARAMETER DISPLAY RANGES — used by gauges in UI
# ---------------------------------------------------------------------------

PARAM_RANGES = {
    "rpm":          (0, 8500),
    "tps":          (0, 100),
    "afr":          (10, 18),
    "boost":        (0, 3.0),
    "egt":          (0, 1100),
    "h2o":          (60, 130),
    "oil_temp":     (60, 150),
    "oil_press":    (0, 8),
    "fuel_press":   (0, 6),
    "spd":          (0, 200),
    "gx":           (-3, 3),
    "gy":           (-3, 3),
    "drift_angle":  (0, 90),
    "g_magnitude":  (0, 4),
    "steering":     (-180, 180),
    "brake":        (0, 30),
    "ai_score":     (0, 10),
    "battery":      (8, 16),
    "knock":        (0, 100),
}


# ---------------------------------------------------------------------------
# DRIVER STYLES
# ---------------------------------------------------------------------------

DRIVER_STYLES = ["AGGRESSIVE", "TECHNICAL", "HYBRID"]


# ---------------------------------------------------------------------------
# TRACK SECTORS
# ---------------------------------------------------------------------------

TRACK_SECTOR_NAMES = ["S1", "S2", "S3", "S4", "S5"]


# ---------------------------------------------------------------------------
# ALARM SEVERITY
# ---------------------------------------------------------------------------

ALARM_SEVERITY_WARNING  = "WARNING"
ALARM_SEVERITY_CRITICAL = "CRITICAL"


# ---------------------------------------------------------------------------
# SUPPORTED LANGUAGES (i18n)
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES = ["en", "sl", "de", "it", "hr"]
DEFAULT_LANGUAGE     = "en"
