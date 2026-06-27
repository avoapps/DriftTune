"""
DriftTune — Mock Data Simulator
=================================
Simulates realistic drift telemetry at 50 Hz via WebSocket.
Replaces Module 1 (CAN Bus) + Module 2 (RPi Core) during development.

Usage:
    python simulator.py
    python simulator.py --cars 2       # simulate 2 cars
    python simulator.py --port 8765
    python simulator.py --scenario drift_run

WebSocket output: ws://localhost:8765/ws/telemetry/{car_id}
"""

import asyncio
import json
import math
import random
import time
import argparse
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from shared.telemetry_schema import RawTelemetry, EnrichedTelemetry, Alarm, ALARM_THRESHOLDS

try:
    import websockets
except ImportError:
    print("Installing websockets...")
    os.system("pip install websockets --break-system-packages -q")
    import websockets


# ---------------------------------------------------------------------------
# SIMULATION SCENARIOS
# ---------------------------------------------------------------------------

SCENARIOS = {
    "drift_run": {
        "description": "Active drift session — high RPM, yaw, G-forces",
        "rpm_base": 6500,
        "spd_base": 65,
        "drift_angle_base": 38,
        "boost_base": 1.6,
    },
    "warm_up": {
        "description": "Warm-up lap — moderate inputs",
        "rpm_base": 3500,
        "spd_base": 40,
        "drift_angle_base": 5,
        "boost_base": 0.4,
    },
    "pit": {
        "description": "Stationary in pit — engine idle",
        "rpm_base": 950,
        "spd_base": 0,
        "drift_angle_base": 0,
        "boost_base": 0.0,
    },
    "alarm_test": {
        "description": "Triggers temperature and pressure alarms",
        "rpm_base": 5000,
        "spd_base": 55,
        "drift_angle_base": 20,
        "boost_base": 1.2,
    },
}


# ---------------------------------------------------------------------------
# TRACK SECTORS — lap simulation
# ---------------------------------------------------------------------------

TRACK_SECTORS = [
    {"name": "S1", "label": "Initiation",  "duration": 3.0},
    {"name": "S2", "label": "Clipping 1",  "duration": 2.5},
    {"name": "S3", "label": "Transition",  "duration": 2.0},
    {"name": "S4", "label": "Clipping 2",  "duration": 2.5},
    {"name": "S5", "label": "Exit",        "duration": 2.0},
]
LAP_DURATION = sum(s["duration"] for s in TRACK_SECTORS)  # ~12 seconds


# ---------------------------------------------------------------------------
# CAR SIMULATOR
# ---------------------------------------------------------------------------

class CarSimulator:
    def __init__(self, car_id: str, scenario: str = "drift_run"):
        self.car_id     = car_id
        self.scenario   = SCENARIOS.get(scenario, SCENARIOS["drift_run"])
        self.session_id = f"SIM_{car_id}_{int(time.time())}"
        self.start_time = time.time()
        self.lap_number = 1
        self.clients    = set()

        # State — smooth transitions between frames
        self._rpm       = self.scenario["rpm_base"]
        self._spd       = self.scenario["spd_base"]
        self._drift     = self.scenario["drift_angle_base"]
        self._steering  = 0.0
        self._tps       = 80.0
        self._boost     = self.scenario["boost_base"]

        # GPS center point (Sežana area — InoCore HQ)
        self._lat_center = 45.7069
        self._lon_center = 13.8736
        self._track_radius = 0.0015  # ~150m radius

    def _smooth(self, current: float, target: float, rate: float = 0.15) -> float:
        """Smooth transition between values."""
        return current + (target - current) * rate

    def _noise(self, value: float, amount: float) -> float:
        """Add realistic sensor noise."""
        return value + random.gauss(0, amount)

    def _get_sector(self) -> tuple:
        elapsed = (time.time() - self.start_time) % LAP_DURATION
        t = 0.0
        for sector in TRACK_SECTORS:
            t += sector["duration"]
            if elapsed < t:
                return sector["name"], elapsed / LAP_DURATION
        return "S5", 1.0

    def _get_lap(self) -> int:
        elapsed = time.time() - self.start_time
        return int(elapsed / LAP_DURATION) + 1

    def _get_gps(self, lap_progress: float) -> tuple:
        """Simulate GPS position on oval track."""
        angle = lap_progress * 2 * math.pi
        lat = self._lat_center + self._track_radius * math.sin(angle)
        lon = self._lon_center + self._track_radius * 1.6 * math.cos(angle)
        return round(lat, 6), round(lon, 6)

    def _check_alarms(self, raw: RawTelemetry) -> list:
        alarms = []
        checks = {
            "h2o":       (raw.h2o,      "high"),
            "oil_temp":  (raw.oil_temp, "high"),
            "oil_press": (raw.oil_press,"low"),
            "egt":       (raw.egt,      "high"),
            "knock":     (raw.knock,    "high"),
            "battery":   (raw.battery,  "low"),
            "boost":     (raw.boost,    "high"),
        }
        for param, (value, direction) in checks.items():
            thresholds = ALARM_THRESHOLDS.get(param, {})
            critical = thresholds.get("critical", None)
            warning  = thresholds.get("warning",  None)
            if direction == "high":
                if critical and value >= critical:
                    alarms.append(Alarm(
                        alarm_id=f"{param}_CRITICAL",
                        parameter=param, value=value,
                        threshold=critical, severity="CRITICAL",
                        message=f"{param.upper()} critical: {value:.1f}"
                    ))
                elif warning and value >= warning:
                    alarms.append(Alarm(
                        alarm_id=f"{param}_WARNING",
                        parameter=param, value=value,
                        threshold=warning, severity="WARNING",
                        message=f"{param.upper()} warning: {value:.1f}"
                    ))
            else:  # low alarm
                if critical and value <= critical:
                    alarms.append(Alarm(
                        alarm_id=f"{param}_CRITICAL",
                        parameter=param, value=value,
                        threshold=critical, severity="CRITICAL",
                        message=f"{param.upper()} critically low: {value:.1f}"
                    ))
                elif warning and value <= warning:
                    alarms.append(Alarm(
                        alarm_id=f"{param}_WARNING",
                        parameter=param, value=value,
                        threshold=warning, severity="WARNING",
                        message=f"{param.upper()} low: {value:.1f}"
                    ))
        return alarms

    def generate_frame(self) -> EnrichedTelemetry:
        t          = time.time()
        sector, progress = self._get_sector()
        lap        = self._get_lap()
        lat, lon   = self._get_gps(progress)

        # Scenario: alarm_test — gradually raise temperatures
        alarm_factor = 1.0
        if self.scenario == SCENARIOS["alarm_test"]:
            elapsed = t - self.start_time
            alarm_factor = 1.0 + (elapsed / 60.0) * 0.3  # +30% over 60s

        # Dynamic targets based on sector
        sector_profiles = {
            "S1": {"rpm": 7200, "tps": 95, "drift": 42, "steer": 55,  "brake": 0},
            "S2": {"rpm": 6800, "tps": 75, "drift": 38, "steer": 35,  "brake": 5},
            "S3": {"rpm": 5500, "tps": 40, "drift": 20, "steer": -45, "brake": 15},
            "S4": {"rpm": 6900, "tps": 80, "drift": 44, "steer": 40,  "brake": 3},
            "S5": {"rpm": 5000, "tps": 60, "drift": 15, "steer": 20,  "brake": 8},
        }
        profile = sector_profiles.get(sector, sector_profiles["S1"])

        # Smooth state transitions
        self._rpm     = self._smooth(self._rpm,    profile["rpm"],   0.12)
        self._tps     = self._smooth(self._tps,    profile["tps"],   0.18)
        self._drift   = self._smooth(self._drift,  profile["drift"], 0.10)
        self._steering= self._smooth(self._steering,profile["steer"],0.20)
        self._boost   = self._smooth(self._boost,  self.scenario["boost_base"] * (self._tps / 80), 0.15)
        self._spd     = self._smooth(self._spd,    self.scenario["spd_base"] + (self._tps - 70) * 0.5, 0.08)

        # Build raw telemetry
        raw = RawTelemetry(
            car_id     = self.car_id,
            session_id = self.session_id,
            ts         = t,

            # Engine
            rpm         = round(self._noise(self._rpm, 30), 0),
            tps         = round(max(0, min(100, self._noise(self._tps, 0.5))), 1),
            afr         = round(self._noise(11.8 + (100 - self._tps) * 0.03, 0.05), 2),
            boost       = round(max(0, self._noise(self._boost, 0.02)), 2),
            egt         = round(self._noise(720 + self._rpm * 0.01, 5) * alarm_factor, 1),
            h2o         = round(self._noise(89 + (self._rpm - 5000) * 0.002, 0.3) * alarm_factor, 1),
            oil_temp    = round(self._noise(107 + (self._rpm - 5000) * 0.003, 0.3) * alarm_factor, 1),
            oil_press   = round(max(0, self._noise(4.2 - self._rpm * 0.0001, 0.05)), 2),
            fuel_press  = round(self._noise(3.8, 0.03), 2),
            ignition    = round(self._noise(18 + self._tps * 0.05, 0.2), 1),
            knock       = round(max(0, self._noise(5 + (self._rpm - 7000) * 0.01, 1)), 1),
            injector_dc = round(min(100, self._tps * 0.85 + self._rpm * 0.002), 1),
            battery     = round(self._noise(13.8, 0.05), 2),

            # Vehicle
            spd         = round(max(0, self._noise(self._spd, 0.3)), 1),
            gear        = max(1, min(6, int(self._rpm / 2000))),

            # IMU
            gx          = round(self._noise(math.sin(math.radians(self._drift)) * 0.9, 0.02), 3),
            gy          = round(self._noise((self._tps - 50) * 0.008, 0.02), 3),
            gz          = round(self._noise(1.0, 0.01), 3),
            yaw         = round(self._noise(self._drift * 1.1, 0.5), 2),
            pitch       = round(self._noise(-2.1, 0.1), 2),
            roll        = round(self._noise(self._drift * 0.3, 0.2), 2),

            # GPS
            lat         = lat,
            lon         = lon,
            gps_speed   = round(self._noise(self._spd * 0.98, 0.2), 1),
            gps_heading = round((progress * 360) % 360, 1),

            # Driver inputs
            steering    = round(self._noise(self._steering, 0.5), 1),
            brake       = round(max(0, self._noise(profile["brake"] * 0.15, 0.1)), 2),
            handbrake   = 1.0 if sector == "S1" and progress < 0.1 else 0.0,
            clutch      = round(max(0, self._noise(5.0, 1.0)), 1),

            # Wheel speeds
            wsp_fl      = round(self._noise(self._spd * 0.99, 0.2), 1),
            wsp_fr      = round(self._noise(self._spd * 0.99, 0.2), 1),
            wsp_rl      = round(self._noise(self._spd * 1.25, 0.5), 1),
            wsp_rr      = round(self._noise(self._spd * 1.25, 0.5), 1),

            # Suspension
            susp_fl     = round(self._noise(45 + self._drift * 0.3, 0.5), 1),
            susp_fr     = round(self._noise(42 - self._drift * 0.2, 0.5), 1),
            susp_rl     = round(self._noise(38 + self._drift * 0.4, 0.5), 1),
            susp_rr     = round(self._noise(52 - self._drift * 0.1, 0.5), 1),

            # Tires
            tire_temp_fl = round(self._noise(75, 1.0), 1),
            tire_temp_fr = round(self._noise(78, 1.0), 1),
            tire_temp_rl = round(self._noise(95 + self._drift * 0.3, 1.5), 1),
            tire_temp_rr = round(self._noise(92 + self._drift * 0.2, 1.5), 1),
            tire_press_fl= round(self._noise(2.1, 0.02), 2),
            tire_press_fr= round(self._noise(2.1, 0.02), 2),
            tire_press_rl= round(self._noise(1.85, 0.02), 2),
            tire_press_rr= round(self._noise(1.85, 0.02), 2),
        )

        # Compute enriched values
        drift_angle  = round(abs(self._noise(self._drift, 0.3)), 1)
        g_magnitude  = round(math.sqrt(raw.gx**2 + raw.gy**2), 3)
        slip_rear    = round(((raw.wsp_rl + raw.wsp_rr) / 2 - raw.spd) / max(raw.spd, 1) * 100, 1) if raw.spd > 5 else 0.0

        # Simple AI score — consistency + drift angle + throttle control
        ai_score = round(min(10, max(0,
            5.0
            + (drift_angle / 50) * 2.0
            + (raw.tps / 100) * 1.5
            + random.gauss(0, 0.1)
        )), 1)

        # Driver style classification
        if raw.steering > 50 and raw.handbrake > 0:
            driver_style = "AGGRESSIVE"
        elif raw.steering < 35 and raw.tps > 70:
            driver_style = "TECHNICAL"
        else:
            driver_style = "HYBRID"

        alarms = self._check_alarms(raw)

        return EnrichedTelemetry(
            raw          = raw,
            drift_angle  = drift_angle,
            g_magnitude  = g_magnitude,
            wheel_slip_r = slip_rear,
            ai_score     = ai_score,
            driver_style = driver_style,
            track_sector = sector,
            lap_number   = lap,
            lap_time     = round((time.time() - self.start_time) % LAP_DURATION, 2),
            alarms       = alarms,
        )


# ---------------------------------------------------------------------------
# WEBSOCKET SERVER
# ---------------------------------------------------------------------------

simulators: dict[str, CarSimulator] = {}


async def telemetry_handler(websocket, path):
    """Handle WebSocket connections from UI clients."""
    car_id = path.strip("/").split("/")[-1] if "/" in path else "CAR_01"

    if car_id not in simulators:
        car_id = list(simulators.keys())[0]

    sim = simulators[car_id]
    sim.clients.add(websocket)
    client_addr = websocket.remote_address
    print(f"[+] Client connected: {client_addr} → {car_id}")

    try:
        while True:
            frame = sim.generate_frame()
            data  = json.dumps(frame.to_dict())
            await websocket.send(data)
            await asyncio.sleep(1 / 50)  # 50 Hz
    except websockets.exceptions.ConnectionClosed:
        print(f"[-] Client disconnected: {client_addr}")
    finally:
        sim.clients.discard(websocket)


async def main(args):
    # Create simulators for each car
    for i in range(args.cars):
        car_id = f"CAR_{i+1:02d}"
        simulators[car_id] = CarSimulator(car_id, args.scenario)
        print(f"[SIM] Car simulator ready: {car_id} | scenario: {args.scenario}")

    print(f"\n{'='*55}")
    print(f"  DriftTune Mock Simulator")
    print(f"  WebSocket: ws://localhost:{args.port}/ws/telemetry/CAR_01")
    print(f"  Cars: {args.cars} | Scenario: {args.scenario} | Rate: 50 Hz")
    print(f"{'='*55}\n")

    async with websockets.serve(telemetry_handler, "0.0.0.0", args.port):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DriftTune Mock Simulator")
    parser.add_argument("--cars",     type=int, default=1,          help="Number of cars to simulate")
    parser.add_argument("--port",     type=int, default=8765,        help="WebSocket port")
    parser.add_argument("--scenario", type=str, default="drift_run", help=f"Scenario: {list(SCENARIOS.keys())}")
    args = parser.parse_args()

    asyncio.run(main(args))
