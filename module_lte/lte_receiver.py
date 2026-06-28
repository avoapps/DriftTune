"""
DriftTune — LTE Receiver (runs on BoxLab server)
==================================================
Accepts binary MessagePack streams from N RPi senders.
Reconstructs full telemetry state per car and re-broadcasts
as JSON over a local WebSocket for the BoxLab React UI.

Flow:
  LTE senders (N cars) → msgpack/binary → Receiver → JSON WS → BoxLab UI
"""

import asyncio
import json
import logging
import time

import msgpack
import websockets

log = logging.getLogger("lte_receiver")

# ── Config ────────────────────────────────────────────────────────────────────
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 9000
UI_WS_PORT  = 9001      # Local WS for BoxLab UI to connect to


class CarState:
    """Reconstructs full telemetry state from delta frames."""

    def __init__(self, car_id: str):
        self.car_id    = car_id
        self.state     = {}
        self.last_seen = time.time()
        self._listeners: set = set()

    def apply_delta(self, delta: dict):
        self.state.update(delta)
        self.last_seen = time.time()

    def to_json(self) -> str:
        return json.dumps({"car_id": self.car_id, **self.state})

    def add_listener(self, queue: asyncio.Queue):
        self._listeners.add(queue)

    def remove_listener(self, queue: asyncio.Queue):
        self._listeners.discard(queue)

    async def broadcast(self):
        msg = self.to_json()
        dead = set()
        for q in self._listeners:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                dead.add(q)
        for q in dead:
            self._listeners.discard(q)


class LTEReceiver:
    def __init__(self):
        self.cars: dict[str, CarState] = {}

    def get_car(self, car_id: str) -> CarState:
        if car_id not in self.cars:
            self.cars[car_id] = CarState(car_id)
            log.info(f"New car connected: {car_id}")
        return self.cars[car_id]

    # ── Handler: incoming binary stream from RPi sender ───────────────────────

    async def handle_sender(self, websocket, path: str):
        # Path: /ws/receive/{car_id}
        car_id = path.strip("/").split("/")[-1] or "UNKNOWN"
        car = self.get_car(car_id)
        log.info(f"[{car_id}] Sender connected from {websocket.remote_address}")
        frames = 0
        try:
            async for message in websocket:
                delta = msgpack.unpackb(message, raw=False)
                car.apply_delta(delta)
                await car.broadcast()
                frames += 1
        except websockets.exceptions.ConnectionClosed:
            pass
        log.info(f"[{car_id}] Sender disconnected after {frames} frames")

    # ── Handler: BoxLab UI subscribes to a car's stream ──────────────────────

    async def handle_ui_client(self, websocket, path: str):
        # Path: /ws/telemetry/{car_id}
        car_id = path.strip("/").split("/")[-1] or "CAR_01"
        car = self.get_car(car_id)

        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        car.add_listener(queue)
        log.info(f"[{car_id}] UI client connected")

        # Send current state immediately so UI is never empty
        if car.state:
            await websocket.send(car.to_json())

        try:
            while True:
                msg = await queue.get()
                await websocket.send(msg)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            car.remove_listener(queue)
            log.info(f"[{car_id}] UI client disconnected")

    # ── Routing ───────────────────────────────────────────────────────────────

    async def _route(self, websocket, path: str):
        if path.startswith("/ws/receive/"):
            await self.handle_sender(websocket, path)
        elif path.startswith("/ws/telemetry/"):
            await self.handle_ui_client(websocket, path)
        else:
            log.warning(f"Unknown path: {path}")

    async def run(self):
        log.info(f"LTE Receiver listening on ws://{LISTEN_HOST}:{LISTEN_PORT}")
        log.info(f"UI clients connect to   ws://localhost:{LISTEN_PORT}/ws/telemetry/{{car_id}}")
        async with websockets.serve(self._route, LISTEN_HOST, LISTEN_PORT):
            await asyncio.Future()  # run forever


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    receiver = LTEReceiver()
    asyncio.run(receiver.run())
