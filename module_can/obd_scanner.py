"""
DriftTune — OBD Connection Tester & Signal Scanner
====================================================
Starts a local web server at http://localhost:8800
Opens a browser UI where you select USB / BT / WiFi,
tests the connection, scans all PIDs, and shows live signal values.

Usage:
    python3 obd_scanner.py
    python3 obd_scanner.py --port 8800
"""

import argparse
import asyncio
import glob
import json
import logging
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread

log = logging.getLogger("obd_scanner")

# ── All known OBD-II PIDs with friendly names ─────────────────────────────────

ALL_PIDS = [
    # (obd_command_name, friendly_name, unit, category)
    ("RPM",                     "Engine RPM",           "rpm",   "Engine"),
    ("SPEED",                   "Vehicle Speed",        "km/h",  "Engine"),
    ("THROTTLE_POS",            "Throttle Position",    "%",     "Engine"),
    ("ENGINE_LOAD",             "Engine Load",          "%",     "Engine"),
    ("MAF",                     "Mass Air Flow",        "g/s",   "Engine"),
    ("INTAKE_PRESSURE",         "Intake Pressure",      "kPa",   "Engine"),
    ("INTAKE_TEMP",             "Intake Air Temp",      "°C",    "Engine"),
    ("TIMING_ADVANCE",          "Ignition Timing",      "°",     "Engine"),
    ("SHORT_FUEL_TRIM_1",       "Fuel Trim Short B1",   "%",     "Fuel"),
    ("LONG_FUEL_TRIM_1",        "Fuel Trim Long B1",    "%",     "Fuel"),
    ("SHORT_FUEL_TRIM_2",       "Fuel Trim Short B2",   "%",     "Fuel"),
    ("LONG_FUEL_TRIM_2",        "Fuel Trim Long B2",    "%",     "Fuel"),
    ("FUEL_PRESSURE",           "Fuel Pressure",        "kPa",   "Fuel"),
    ("FUEL_RAIL_PRESSURE_VAC",  "Fuel Rail Pressure",   "kPa",   "Fuel"),
    ("O2_B1S1",                 "O2 Sensor B1S1",       "V",     "Fuel"),
    ("O2_B1S2",                 "O2 Sensor B1S2",       "V",     "Fuel"),
    ("O2_B2S1",                 "O2 Sensor B2S1",       "V",     "Fuel"),
    ("COOLANT_TEMP",            "Coolant Temperature",  "°C",    "Temperature"),
    ("OIL_TEMP",                "Oil Temperature",      "°C",    "Temperature"),
    ("AMBIANT_AIR_TEMP",        "Ambient Air Temp",     "°C",    "Temperature"),
    ("CATALYST_TEMP_B1S1",      "Catalyst Temp B1S1",   "°C",    "Temperature"),
    ("GEAR",                    "Gear Position",        "",      "Drivetrain"),
    ("TRANSMISSION_ACTUAL_GEAR","Actual Gear",          "",      "Drivetrain"),
    ("CONTROL_MODULE_VOLTAGE",  "Battery Voltage",      "V",     "Electrical"),
    ("RELATIVE_THROTTLE_POS",   "Relative Throttle",    "%",     "Driver"),
    ("THROTTLE_ACTUATOR",       "Throttle Actuator",    "%",     "Driver"),
    ("ACCELERATOR_POS_D",       "Accelerator Pos D",    "%",     "Driver"),
    ("ACCELERATOR_POS_E",       "Accelerator Pos E",    "%",     "Driver"),
    ("BRAKE_SWITCH",            "Brake Switch",         "",      "Driver"),
    ("RUN_TIME",                "Engine Run Time",      "s",     "Session"),
    ("DISTANCE_SINCE_DTC_CLEAR","Distance Since Clear", "km",    "Session"),
    ("WARMUPS_SINCE_DTC_CLEAR", "Warmups Since Clear",  "",      "Session"),
    ("BAROMETRIC_PRESSURE",     "Barometric Pressure",  "kPa",   "Environment"),
    ("ELM_VOLTAGE",             "ELM Adapter Voltage",  "V",     "Adapter"),
    ("ELM_VERSION",             "ELM Version",          "",      "Adapter"),
]


# ── Serial port discovery ─────────────────────────────────────────────────────

def find_serial_ports() -> list[dict]:
    ports = []
    patterns = [
        "/dev/cu.usbserial*",
        "/dev/cu.OBDII*",
        "/dev/cu.OBD*",
        "/dev/cu.ELM*",
        "/dev/cu.Bluetooth*",
        "/dev/ttyUSB*",
        "/dev/rfcomm*",
    ]
    for pat in patterns:
        for p in glob.glob(pat):
            kind = "BT" if ("rfcomm" in p or "Bluetooth" in p or "OBDII" in p) else "USB"
            ports.append({"port": p, "type": kind})
    return ports


# ── OBD Scanner ───────────────────────────────────────────────────────────────

class OBDScanner:
    def __init__(self):
        self._conn = None
        self._results = []
        self._status = "idle"
        self._progress = 0

    def connect(self, mode: str, port: str = None,
                wifi_host: str = None, wifi_port: int = 35000) -> dict:
        try:
            import obd
        except ImportError:
            return {"ok": False, "error": "python-obd not installed. Run: pip3 install obd"}

        try:
            self._status = "connecting"
            if mode == "wifi":
                conn_str = f"socket://{wifi_host}:{wifi_port}"
                self._conn = obd.OBD(portstr=conn_str, fast=False, timeout=5)
            else:
                self._conn = obd.OBD(portstr=port, fast=False, timeout=5)

            if not self._conn.is_connected():
                return {"ok": False, "error": "Adapter found but ECU not responding. Check ignition (ON)."}

            protocol = str(self._conn.protocol_name()) if self._conn.protocol_name() else "Unknown"
            port_used = str(self._conn.port_name()) if self._conn.port_name() else port or "wifi"
            return {"ok": True, "protocol": protocol, "port": port_used}

        except Exception as e:
            return {"ok": False, "error": str(e)}

    def scan_all(self, progress_cb=None) -> list[dict]:
        if not self._conn or not self._conn.is_connected():
            return []

        try:
            import obd
        except ImportError:
            return []

        results = []
        total = len(ALL_PIDS)

        for i, (cmd_name, label, unit, category) in enumerate(ALL_PIDS):
            if progress_cb:
                progress_cb(int((i / total) * 100), f"Checking {label}...")

            cmd = getattr(obd.commands, cmd_name, None)
            if cmd is None:
                continue

            supported = cmd in self._conn.supported_commands
            value = None
            raw = None

            if supported:
                try:
                    resp = self._conn.query(cmd)
                    if not resp.is_null():
                        val = resp.value
                        if hasattr(val, "magnitude"):
                            value = round(float(val.magnitude), 3)
                        else:
                            value = str(val)
                        raw = str(resp.value)
                except Exception as e:
                    raw = f"Error: {e}"

            results.append({
                "cmd":       cmd_name,
                "label":     label,
                "unit":      unit,
                "category":  category,
                "supported": supported,
                "value":     value,
                "raw":       raw,
                "live":      value is not None,
            })

        if progress_cb:
            progress_cb(100, "Scan complete")

        self._results = results
        return results

    def live_values(self, cmd_names: list[str]) -> dict:
        """Poll current values for selected PIDs."""
        if not self._conn or not self._conn.is_connected():
            return {}
        try:
            import obd
        except ImportError:
            return {}

        out = {}
        for cmd_name in cmd_names:
            cmd = getattr(obd.commands, cmd_name, None)
            if not cmd:
                continue
            try:
                resp = self._conn.query(cmd)
                if not resp.is_null():
                    val = resp.value
                    out[cmd_name] = round(float(val.magnitude), 3) \
                        if hasattr(val, "magnitude") else str(val)
            except Exception:
                pass
        return out

    def disconnect(self):
        if self._conn:
            self._conn.close()
            self._conn = None


# ── Shared scanner instance ───────────────────────────────────────────────────

scanner = OBDScanner()
scan_progress = {"pct": 0, "msg": "", "done": False, "results": []}
live_cmds: list[str] = []


# ── HTTP Handler ──────────────────────────────────────────────────────────────

HTML_FILE = os.path.join(os.path.dirname(__file__), "obd_scanner.html")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress HTTP access log

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self._serve_html()
        elif self.path == "/ports":
            self._json(find_serial_ports())
        elif self.path.startswith("/progress"):
            self._json(scan_progress)
        elif self.path.startswith("/live"):
            self._json({"values": scanner.live_values(live_cmds)})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        if self.path == "/connect":
            result = scanner.connect(
                mode=body.get("mode", "usb"),
                port=body.get("port"),
                wifi_host=body.get("wifi_host", "192.168.0.10"),
                wifi_port=int(body.get("wifi_port", 35000)),
            )
            self._json(result)

        elif self.path == "/scan":
            scan_progress.update({"pct": 0, "msg": "Starting...", "done": False, "results": []})
            def run():
                def cb(pct, msg):
                    scan_progress.update({"pct": pct, "msg": msg, "done": False})
                results = scanner.scan_all(progress_cb=cb)
                scan_progress.update({"pct": 100, "msg": "Done", "done": True, "results": results})
            Thread(target=run, daemon=True).start()
            self._json({"ok": True})

        elif self.path == "/watch":
            global live_cmds
            live_cmds = body.get("cmds", [])
            self._json({"ok": True})

        elif self.path == "/disconnect":
            scanner.disconnect()
            self._json({"ok": True})

        else:
            self.send_response(404)
            self.end_headers()

    def _serve_html(self):
        with open(HTML_FILE, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, data: dict):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s: %(message)s")

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", default=8800, type=int)
    args = parser.parse_args()

    server = HTTPServer(("localhost", args.port), Handler)
    url = f"http://localhost:{args.port}"

    print(f"\n  DriftTune OBD Scanner")
    print(f"  ─────────────────────")
    print(f"  Open: {url}\n")

    import webbrowser
    webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nScanner stopped.")
