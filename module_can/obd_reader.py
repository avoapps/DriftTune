"""
DriftTune — OBD-II Reader
==========================
Reads vehicle data via OBD-II port (ELM327 adapter).
Outputs RawTelemetry to RPi Core Server via WebSocket.

Supported adapters:
  - ELM327 USB  (e.g. /dev/ttyUSB0)
  - ELM327 BT   (e.g. /dev/rfcomm0 or COM3)
  - ELM327 WiFi (TCP socket)

Usage:
    python obd_reader.py --port /dev/ttyUSB0
    python obd_reader.py --port /dev/rfcomm0 --baudrate 38400
    python obd_reader.py --wifi --host 192.168.0.10 --wifi-port 35000
    python obd_reader.py --port /dev/ttyUSB0 --car CAR_01 --core-port 8765

Limitations vs CAN Bus:
  - OBD-II polls at ~10 Hz max (protocol overhead)
  - No IMU, wheel speed, suspension data (ECU-dependent)
  - Drift angle computed from available signals only
"""

import argparse
import asyncio
import json
import logging
import time
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.telemetry_schema import RawTelemetry
from shared.constants import WEBSOCKET_PORT

log = logging.getLogger("obd_reader")

CORE_WS_URL = "ws://localhost:{port}/ws/raw/{car_id}"

# OBD-II poll rate — ELM327 can do ~10 Hz max with multiple PIDs
OBD_HZ = 10


# ── PID Definitions ───────────────────────────────────────────────────────────

# Standard OBD-II PIDs → RawTelemetry fields
# (pid_name, obd_command, scale, offset, raw_field)
PID_MAP = [
    # Engine
    ("RPM",              "RPM",              0.25,  0,    "rpm"),
    ("THROTTLE_POS",     "THROTTLE_POS",     1.0,   0,    "tps"),
    ("MAF",              "MAF",              None,  None, None),    # used for AFR estimate
    ("SHORT_FUEL_TRIM_1","SHORT_FUEL_TRIM_1",1.0,   0,    None),
    ("LONG_FUEL_TRIM_1", "LONG_FUEL_TRIM_1", 1.0,   0,    None),
    ("INTAKE_PRESSURE",  "INTAKE_PRESSURE",  0.01,  0,    "boost"), # kPa → bar (rough)
    ("TIMING_ADVANCE",   "TIMING_ADVANCE",   1.0,   0,    "ignition"),

    # Temperatures
    ("COOLANT_TEMP",     "COOLANT_TEMP",     1.0,   0,    "h2o"),
    ("OIL_TEMP",         "OIL_TEMP",         1.0,   0,    "oil_temp"),
    ("INTAKE_TEMP",      "INTAKE_TEMP",      1.0,   0,    None),

    # Vehicle
    ("SPEED",            "SPEED",            1.0,   0,    "spd"),
    ("GEAR",             "GEAR",             1.0,   0,    "gear"),

    # Electrical
    ("CONTROL_MODULE_VOLTAGE", "CONTROL_MODULE_VOLTAGE", 1.0, 0, "battery"),

    # Fuel
    ("FUEL_PRESSURE",    "FUEL_PRESSURE",    1.0,   0,    "fuel_press"),

    # Knock (non-standard, ECU-dependent)
    ("ENGINE_LOAD",      "ENGINE_LOAD",      1.0,   0,    None),
]

# Accelerometer PIDs (Mode 22, extended — ECU-specific)
EXTENDED_PIDS = {
    # Example for Haltech/Link ECU extended PIDs
    # "0x2201": ("gx", 0.001, 0),
    # "0x2202": ("gy", 0.001, 0),
}


# ── OBD Connection ────────────────────────────────────────────────────────────

class OBDConnection:
    """Wraps python-obd for async use."""

    def __init__(self, port: str = None, baudrate: int = None,
                 wifi_host: str = None, wifi_port: int = 35000):
        self.port      = port
        self.baudrate  = baudrate
        self.wifi_host = wifi_host
        self.wifi_port = wifi_port
        self._conn     = None
        self._commands = []

    def connect(self) -> bool:
        try:
            import obd
            if self.wifi_host:
                self._conn = obd.OBD(
                    portstr=f"socket://{self.wifi_host}:{self.wifi_port}",
                    fast=False,
                )
            else:
                kwargs = {"portstr": self.port, "fast": False}
                if self.baudrate:
                    kwargs["baudrate"] = self.baudrate
                self._conn = obd.OBD(**kwargs)

            if not self._conn.is_connected():
                log.error("OBD adapter connected but no ECU response")
                return False

            # Pre-load supported commands
            self._commands = []
            for _, cmd_name, _, _, _ in PID_MAP:
                cmd = getattr(obd.commands, cmd_name, None)
                if cmd and cmd in self._conn.supported_commands:
                    self._commands.append((cmd_name, cmd))
                else:
                    log.debug(f"PID not supported: {cmd_name}")

            log.info(f"OBD connected — {len(self._commands)} PIDs active")
            return True

        except ImportError:
            log.error("python-obd not installed: pip install obd")
            return False
        except Exception as e:
            log.error(f"OBD connect error: {e}")
            return False

    def query_all(self) -> dict:
        """Query all supported PIDs, return {cmd_name: value}."""
        if not self._conn:
            return {}
        results = {}
        for cmd_name, cmd in self._commands:
            try:
                response = self._conn.query(cmd)
                if not response.is_null():
                    results[cmd_name] = response.value.magnitude \
                        if hasattr(response.value, "magnitude") else float(response.value)
            except Exception:
                pass
        return results

    def disconnect(self):
        if self._conn:
            self._conn.close()
            self._conn = None


# ── AFR estimation from fuel trims + MAF ─────────────────────────────────────

def estimate_afr(maf_g_s: float, speed: float) -> float:
    """Rough AFR estimate: stoichiometric 14.7 ± fuel trim."""
    # Without O2 sensor reading, assume near-stoich
    return 14.7


# ── OBD Reader ────────────────────────────────────────────────────────────────

class OBDReader:
    def __init__(self, car_id: str, core_port: int = WEBSOCKET_PORT,
                 port: str = None, baudrate: int = None,
                 wifi_host: str = None, wifi_port: int = 35000):
        self.car_id   = car_id
        self.core_url = CORE_WS_URL.format(port=core_port, car_id=car_id)
        self.conn     = OBDConnection(port, baudrate, wifi_host, wifi_port)
        self._raw     = RawTelemetry(car_id=car_id)
        self._running = False

        # Build PID → field map for fast lookup
        self._pid_to_field = {
            cmd_name: (field, scale, offset)
            for _, cmd_name, scale, offset, field in PID_MAP
            if field is not None
        }

    def _apply_readings(self, readings: dict):
        """Map OBD readings to RawTelemetry fields."""
        for cmd_name, value in readings.items():
            if cmd_name in self._pid_to_field:
                field, scale, offset = self._pid_to_field[cmd_name]
                if scale is not None:
                    setattr(self._raw, field, float(value) * scale + (offset or 0))

        # Special cases
        if "GEAR" not in readings and self._raw.spd > 0:
            # Estimate gear from speed if not available
            self._raw.gear = max(1, min(6, int(self._raw.spd / 30) + 1))

        if "INTAKE_PRESSURE" in readings:
            # Convert absolute manifold pressure to boost (relative to 1 bar)
            abs_bar = readings["INTAKE_PRESSURE"] * 0.01
            self._raw.boost = max(0.0, abs_bar - 1.013)

        # AFR fallback
        if self._raw.afr == 0.0:
            self._raw.afr = 14.7

        self._raw.ts = time.time()

    async def run(self):
        self._running = True
        log.info(f"Connecting to OBD adapter...")

        loop = asyncio.get_event_loop()
        connected = await loop.run_in_executor(None, self.conn.connect)

        if not connected:
            log.error("Could not connect to OBD — exiting")
            return

        await asyncio.gather(
            self._poll_loop(loop),
            self._send_loop(),
        )

    async def _poll_loop(self, loop: asyncio.AbstractEventLoop):
        """Poll OBD PIDs at OBD_HZ."""
        interval = 1.0 / OBD_HZ
        while self._running:
            t0 = time.time()
            readings = await loop.run_in_executor(None, self.conn.query_all)
            self._apply_readings(readings)
            elapsed = time.time() - t0
            await asyncio.sleep(max(0, interval - elapsed))

    async def _send_loop(self):
        """Push RawTelemetry to Core Server at OBD_HZ."""
        import websockets
        interval = 1.0 / OBD_HZ
        delay = 1.0

        while self._running:
            try:
                async with websockets.connect(self.core_url) as ws:
                    log.info(f"Connected to Core Server: {self.core_url}")
                    delay = 1.0
                    while self._running:
                        payload = json.dumps(self._raw.to_dict())
                        await ws.send(payload)
                        await asyncio.sleep(interval)
            except Exception as e:
                log.warning(f"Core WS error: {e} — retry in {delay:.1f}s")
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)

    def stop(self):
        self._running = False
        self.conn.disconnect()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="DriftTune OBD-II Reader")
    parser.add_argument("--car",        default="CAR_01",       help="Car ID")
    parser.add_argument("--port",       default=None,           help="Serial port (e.g. /dev/ttyUSB0)")
    parser.add_argument("--baudrate",   default=None, type=int, help="Serial baudrate")
    parser.add_argument("--wifi",       action="store_true",    help="Use WiFi ELM327")
    parser.add_argument("--wifi-host",  default="192.168.0.10", help="ELM327 WiFi IP")
    parser.add_argument("--wifi-port",  default=35000, type=int,help="ELM327 WiFi port")
    parser.add_argument("--core-port",  default=8765, type=int, help="Core Server port")
    args = parser.parse_args()

    reader = OBDReader(
        car_id    = args.car,
        core_port = args.core_port,
        port      = args.port,
        baudrate  = args.baudrate,
        wifi_host = args.wifi_host if args.wifi else None,
        wifi_port = args.wifi_port,
    )

    try:
        asyncio.run(reader.run())
    except KeyboardInterrupt:
        reader.stop()
        log.info("OBD Reader stopped.")
