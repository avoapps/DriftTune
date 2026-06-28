"""
DriftTune — CAN Bus Reader
===========================
Reads real CAN frames from the vehicle ECU and pushes
RawTelemetry to the RPi Core via WebSocket.

Supports:
  - python-can with socketcan (Linux/RPi)
  - DBC file for message decoding
  - Automatic fallback to mock simulator if CAN unavailable

Usage:
    python can_reader.py --interface socketcan --channel can0 --dbc ecu.dbc
    python can_reader.py --mock   # force mock mode
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
from shared.constants import WEBSOCKET_PORT, TELEMETRY_HZ

log = logging.getLogger("can_reader")

CORE_WS_URL = "ws://localhost:{port}/ws/raw/{car_id}"


# ── DBC Message Map ───────────────────────────────────────────────────────────
# Maps CAN message IDs to (signal_name → RawTelemetry field)
# Customize per your ECU/DBC file.

DEFAULT_MESSAGE_MAP = {
    # Engine
    0x0CF: {  # Engine data frame
        "EngineRPM":       ("rpm",        1.0,   0),
        "ThrottlePos":     ("tps",        0.39,  0),
        "MAP_kPa":         ("boost",      0.001, 0),   # kPa → bar
        "AFR":             ("afr",        0.1,   0),
        "IgnitionAngle":   ("ignition",   0.1,   0),
        "InjectorDC":      ("injector_dc",0.39,  0),
        "KnockLevel":      ("knock",      1.0,   0),
    },
    0x0D0: {  # Temperatures
        "CoolantTemp":     ("h2o",        1.0,  -40),
        "OilTemp":         ("oil_temp",   1.0,  -40),
        "ExhaustTemp":     ("egt",        2.0,    0),
        "OilPressure":     ("oil_press",  0.1,    0),
        "FuelPressure":    ("fuel_press", 0.1,    0),
        "BatteryVoltage":  ("battery",    0.01,   0),
    },
    0x0E0: {  # Vehicle dynamics
        "VehicleSpeed":    ("spd",        0.1,   0),
        "GearPosition":    ("gear",       1.0,   0),
        "WheelSpeedFL":    ("wsp_fl",     0.1,   0),
        "WheelSpeedFR":    ("wsp_fr",     0.1,   0),
        "WheelSpeedRL":    ("wsp_rl",     0.1,   0),
        "WheelSpeedRR":    ("wsp_rr",     0.1,   0),
    },
    0x0F0: {  # IMU
        "AccelLateral":    ("gx",         0.001, 0),   # mg → G
        "AccelLong":       ("gy",         0.001, 0),
        "AccelVert":       ("gz",         0.001, 0),
        "YawRate":         ("yaw",        0.01,  0),
        "PitchRate":       ("pitch",      0.01,  0),
        "RollRate":        ("roll",       0.01,  0),
    },
    0x100: {  # Driver inputs
        "SteeringAngle":   ("steering",   0.1,   0),
        "BrakePressure":   ("brake",      0.1,   0),
        "HandbrakePos":    ("handbrake",  0.004, 0),
        "ClutchPos":       ("clutch",     0.39,  0),
    },
    0x110: {  # GPS
        "Latitude":        ("lat",        1e-7,  0),
        "Longitude":       ("lon",        1e-7,  0),
        "GPSSpeed":        ("gps_speed",  0.01,  0),
        "GPSHeading":      ("gps_heading",0.01,  0),
        "Altitude":        ("gps_alt",    0.1,   0),
    },
}


# ── CAN Frame Decoder ─────────────────────────────────────────────────────────

class CANDecoder:
    """
    Decodes CAN frames using a message map.
    Falls back to DBC file if provided.
    """

    def __init__(self, dbc_path: str = None):
        self._map = DEFAULT_MESSAGE_MAP
        self._db = None

        if dbc_path and os.path.exists(dbc_path):
            try:
                import cantools
                self._db = cantools.database.load_file(dbc_path)
                log.info(f"Loaded DBC: {dbc_path} ({len(self._db.messages)} messages)")
            except ImportError:
                log.warning("cantools not installed — using built-in message map")
            except Exception as e:
                log.warning(f"DBC load error: {e} — using built-in message map")

    def decode(self, msg_id: int, data: bytes, raw: RawTelemetry) -> RawTelemetry:
        """Apply decoded signals to RawTelemetry in-place."""
        if self._db:
            try:
                msg = self._db.get_message_by_frame_id(msg_id)
                signals = msg.decode(data)
                for name, value in signals.items():
                    # Map signal name to field via DEFAULT_MESSAGE_MAP
                    for _, signal_map in self._map.items():
                        if name in signal_map:
                            field, scale, offset = signal_map[name]
                            if hasattr(raw, field):
                                setattr(raw, field, float(value) * scale + offset)
            except Exception:
                pass
        elif msg_id in self._map:
            signal_map = self._map[msg_id]
            raw_int = int.from_bytes(data, "big")
            byte_offset = 0
            for signal_name, (field, scale, offset) in signal_map.items():
                if byte_offset >= len(data):
                    break
                raw_val = data[byte_offset] if byte_offset < len(data) else 0
                setattr(raw, field, float(raw_val) * scale + offset)
                byte_offset += 1

        return raw


# ── CAN Reader ────────────────────────────────────────────────────────────────

class CANReader:
    def __init__(self, car_id: str, interface: str, channel: str,
                 dbc_path: str = None, core_port: int = WEBSOCKET_PORT):
        self.car_id     = car_id
        self.interface  = interface
        self.channel    = channel
        self.core_url   = CORE_WS_URL.format(port=core_port, car_id=car_id)
        self.decoder    = CANDecoder(dbc_path)
        self._raw       = RawTelemetry(car_id=car_id)
        self._running   = False

    async def run(self):
        self._running = True
        await asyncio.gather(
            self._read_can_loop(),
            self._send_loop(),
        )

    # ── CAN read loop ─────────────────────────────────────────────────────────

    async def _read_can_loop(self):
        try:
            import can
            bus = can.interface.Bus(channel=self.channel,
                                    bustype=self.interface,
                                    bitrate=500000)
            log.info(f"CAN Bus connected: {self.interface}/{self.channel}")
            loop = asyncio.get_event_loop()
            while self._running:
                msg = await loop.run_in_executor(None, bus.recv, 0.1)
                if msg:
                    self._raw.ts = msg.timestamp
                    self.decoder.decode(msg.arbitration_id, msg.data, self._raw)
        except ImportError:
            log.error("python-can not installed: pip install python-can")
            self._running = False
        except Exception as e:
            log.error(f"CAN Bus error: {e}")
            self._running = False

    # ── WebSocket send loop ───────────────────────────────────────────────────

    async def _send_loop(self):
        import websockets
        interval = 1.0 / TELEMETRY_HZ
        delay = 1.0

        while self._running:
            try:
                async with websockets.connect(self.core_url) as ws:
                    log.info(f"Connected to Core Server: {self.core_url}")
                    delay = 1.0
                    while self._running:
                        self._raw.ts = time.time()
                        payload = json.dumps(self._raw.to_dict())
                        await ws.send(payload)
                        await asyncio.sleep(interval)
            except Exception as e:
                log.warning(f"Core WS error: {e} — retry in {delay:.1f}s")
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)

    def stop(self):
        self._running = False


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="DriftTune CAN Bus Reader")
    parser.add_argument("--car",       default="CAR_01")
    parser.add_argument("--interface", default="socketcan", help="CAN interface type")
    parser.add_argument("--channel",   default="can0",      help="CAN channel (e.g. can0)")
    parser.add_argument("--dbc",       default=None,        help="Path to .dbc file")
    parser.add_argument("--port",      default=8765, type=int, help="Core Server port")
    parser.add_argument("--mock",      action="store_true", help="Use mock simulator instead")
    args = parser.parse_args()

    if args.mock:
        log.info("Mock mode — launching mock_simulator.py")
        os.execlp("python", "python",
                  os.path.join(os.path.dirname(__file__), "mock_simulator.py"),
                  "--cars", "1")
    else:
        reader = CANReader(
            car_id=args.car,
            interface=args.interface,
            channel=args.channel,
            dbc_path=args.dbc,
            core_port=args.port,
        )
        asyncio.run(reader.run())
