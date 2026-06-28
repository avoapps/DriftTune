"""
DriftTune — RPi Core Server
=============================
Central processing unit. Accepts RawTelemetry from Module 1 (CAN Bus),
enriches it, stores to SQLite, and broadcasts EnrichedTelemetry on WS.

WebSocket endpoints:
  ws://localhost:8765/ws/raw/{car_id}       ← CAN Bus pushes raw data here
  ws://localhost:8765/ws/telemetry/{car_id} ← UI and LTE module read from here
"""

import asyncio
import json
import logging
import time
import uuid

import websockets

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.telemetry_schema import RawTelemetry, EnrichedTelemetry
from shared.constants import WEBSOCKET_PORT

from compute import (
    AIScorer, SectorTracker, LapTimer,
    compute_drift_angle, compute_g_magnitude,
    compute_wheel_slip, classify_driver_style, detect_alarms
)
from storage import SessionStorage

log = logging.getLogger("core_server")

FLUSH_INTERVAL = 5.0  # seconds between SQLite commits


class CarProcessor:
    def __init__(self, car_id: str, session_id: str):
        self.car_id     = car_id
        self.session_id = session_id
        self.scorer     = AIScorer()
        self.sectors    = SectorTracker()
        self.lap_timer  = LapTimer()
        self.storage    = SessionStorage(session_id, car_id)
        self._listeners: set = set()
        self._last_flush = time.time()

    def process(self, raw_dict: dict) -> dict:
        raw = RawTelemetry(**{k: v for k, v in raw_dict.items()
                              if k in RawTelemetry.__dataclass_fields__})

        drift_angle  = compute_drift_angle(raw)
        g_mag        = compute_g_magnitude(raw)
        wheel_slip   = compute_wheel_slip(raw)
        ai_score     = self.scorer.update(raw, drift_angle, g_mag)
        style        = classify_driver_style(drift_angle, raw.tps, g_mag)
        sector       = self.sectors.current_sector()
        lap_num, lap_time = self.lap_timer.tick()
        alarms       = detect_alarms(raw)

        enriched = EnrichedTelemetry(
            raw=raw,
            drift_angle=drift_angle,
            g_magnitude=g_mag,
            wheel_slip_r=wheel_slip,
            ai_score=ai_score,
            driver_style=style,
            track_sector=sector,
            lap_number=lap_num,
            lap_time=lap_time,
            alarms=alarms,
        )

        enriched_dict = enriched.to_dict()

        # Flush alarms to DB immediately
        for alarm in alarms:
            self.storage.log_alarm(alarm)

        # Log frame (sampled internally)
        self.storage.log_frame(enriched_dict, lap_num, lap_time, sector)

        # Periodic SQLite flush
        if time.time() - self._last_flush > FLUSH_INTERVAL:
            self.storage.flush()
            self._last_flush = time.time()

        return enriched_dict

    def add_listener(self, q: asyncio.Queue):
        self._listeners.add(q)

    def remove_listener(self, q: asyncio.Queue):
        self._listeners.discard(q)

    async def broadcast(self, msg: str):
        dead = set()
        for q in self._listeners:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                dead.add(q)
        for q in dead:
            self._listeners.discard(q)

    def close(self):
        self.storage.close()


class CoreServer:
    def __init__(self, host: str = "0.0.0.0", port: int = WEBSOCKET_PORT):
        self.host = host
        self.port = port
        self._cars: dict[str, CarProcessor] = {}

    def _get_car(self, car_id: str) -> CarProcessor:
        if car_id not in self._cars:
            session_id = f"S_{car_id}_{int(time.time())}"
            self._cars[car_id] = CarProcessor(car_id, session_id)
            log.info(f"New car session: {car_id} → {session_id}")
        return self._cars[car_id]

    # ── CAN Bus pushes raw telemetry here ─────────────────────────────────────

    async def _handle_raw(self, websocket, car_id: str):
        car = self._get_car(car_id)
        log.info(f"[{car_id}] CAN Bus source connected")
        try:
            async for message in websocket:
                raw_dict = json.loads(message)
                enriched = car.process(raw_dict)
                await car.broadcast(json.dumps(enriched))
        except websockets.exceptions.ConnectionClosed:
            pass
        log.info(f"[{car_id}] CAN Bus source disconnected")

    # ── UI / LTE subscribes to enriched stream ────────────────────────────────

    async def _handle_subscriber(self, websocket, car_id: str):
        car = self._get_car(car_id)
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        car.add_listener(q)
        log.info(f"[{car_id}] Subscriber connected")
        try:
            while True:
                msg = await q.get()
                await websocket.send(msg)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            car.remove_listener(q)
            log.info(f"[{car_id}] Subscriber disconnected")

    # ── Router ─────────────────────────────────────────────────────────────────

    async def _route(self, websocket, path: str):
        parts = path.strip("/").split("/")
        # /ws/raw/{car_id}
        if len(parts) == 3 and parts[1] == "raw":
            await self._handle_raw(websocket, parts[2])
        # /ws/telemetry/{car_id}
        elif len(parts) == 3 and parts[1] == "telemetry":
            await self._handle_subscriber(websocket, parts[2])
        else:
            log.warning(f"Unknown path: {path}")

    async def run(self):
        log.info(f"Core Server starting on ws://{self.host}:{self.port}")
        async with websockets.serve(self._route, self.host, self.port):
            await asyncio.Future()


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="DriftTune RPi Core Server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", default=8765, type=int)
    args = parser.parse_args()

    server = CoreServer(host=args.host, port=args.port)
    asyncio.run(server.run())
