"""
DriftTune — Delta Encoder
==========================
Reduces bandwidth by sending only changed values.
Numeric fields are diffed; strings and identities are always sent.
"""

# Fields that are always included (never delta-encoded)
ALWAYS_SEND = {"car_id", "session_id", "ts", "severity", "alarm_id"}

# Minimum change threshold per parameter before sending (reduces noise)
DELTA_THRESHOLDS = {
    "rpm":          10.0,
    "spd":          0.5,
    "tps":          0.5,
    "afr":          0.05,
    "boost":        0.01,
    "egt":          1.0,
    "h2o":          0.5,
    "oil_temp":     0.5,
    "oil_press":    0.05,
    "gx":           0.01,
    "gy":           0.01,
    "gz":           0.01,
    "yaw":          0.1,
    "steering":     0.5,
    "brake":        0.05,
    "drift_angle":  0.2,
    "ai_score":     0.05,
    "lat":          0.00001,
    "lon":          0.00001,
}


class DeltaEncoder:
    def __init__(self):
        self._prev: dict = {}

    def encode(self, flat: dict) -> dict:
        """Return only fields that changed beyond threshold."""
        out = {}
        for key, value in flat.items():
            if key in ALWAYS_SEND:
                out[key] = value
                continue

            prev = self._prev.get(key)

            if prev is None:
                # First frame — send everything
                out[key] = value
            elif isinstance(value, (int, float)) and isinstance(prev, (int, float)):
                threshold = DELTA_THRESHOLDS.get(key, 0.0)
                if abs(value - prev) > threshold:
                    out[key] = round(value, 4)
            elif value != prev:
                out[key] = value

        self._prev = {**self._prev, **flat}
        return out

    def reset(self):
        """Reset on reconnect — next frame sends full state."""
        self._prev = {}
