"""
DriftTune — LTE Sender (runs on RPi)
======================================
Connects to the local RPi Core WebSocket, applies delta encoding
and MessagePack compression, then streams to the BoxLab receiver.

Flow:
  RPi Core WS (localhost:8765) → DeltaEncoder → msgpack → BoxLab WS
"""

import asyncio
import logging
import time
from collections import deque

import msgpack
import websockets

from delta_encoder import DeltaEncoder

log = logging.getLogger("lte_sender")

# ── Config ────────────────────────────────────────────────────────────────────
LOCAL_WS   = "ws://localhost:8765/ws/telemetry/{car_id}"
REMOTE_WS  = "ws://{host}:{port}/ws/receive/{car_id}"
BUFFER_MAX = 500        # Max frames buffered on signal loss
RETRY_BASE = 1.0        # Initial reconnect delay (seconds)
RETRY_MAX  = 30.0       # Max reconnect delay


def flatten(enriched: dict) -> dict:
    """Flatten EnrichedTelemetry dict for delta encoding."""
    raw = enriched.get("raw", {})
    computed = {
        "drift_angle":  enriched.get("drift_angle", 0),
        "g_magnitude":  enriched.get("g_magnitude", 0),
        "wheel_slip_r": enriched.get("wheel_slip_r", 0),
        "ai_score":     enriched.get("ai_score", 0),
        "driver_style": enriched.get("driver_style", ""),
        "track_sector": enriched.get("track_sector", ""),
        "lap_number":   enriched.get("lap_number", 0),
        "lap_time":     enriched.get("lap_time", 0),
        "session_id":   enriched.get("session_id", ""),
    }
    return {**raw, **computed}


class LTESender:
    def __init__(self, car_id: str, remote_host: str, remote_port: int = 9000):
        self.car_id      = car_id
        self.remote_url  = REMOTE_WS.format(host=remote_host, port=remote_port, car_id=car_id)
        self.local_url   = LOCAL_WS.format(car_id=car_id)
        self.encoder     = DeltaEncoder()
        self.buffer      = deque(maxlen=BUFFER_MAX)
        self._running    = False

    async def run(self):
        self._running = True
        await asyncio.gather(
            self._receive_loop(),
            self._send_loop(),
        )

    # ── Receive from local RPi Core ───────────────────────────────────────────

    async def _receive_loop(self):
        delay = RETRY_BASE
        while self._running:
            try:
                async with websockets.connect(self.local_url) as ws:
                    log.info(f"[RX] Connected to local WS: {self.local_url}")
                    delay = RETRY_BASE
                    async for raw_msg in ws:
                        import json
                        data = json.loads(raw_msg)
                        flat = flatten(data)
                        delta = self.encoder.encode(flat)
                        if delta:
                            packed = msgpack.packb(delta, use_bin_type=True)
                            self.buffer.append(packed)
            except Exception as e:
                log.warning(f"[RX] Local WS error: {e} — retry in {delay:.1f}s")
                self.encoder.reset()
                await asyncio.sleep(delay)
                delay = min(delay * 2, RETRY_MAX)

    # ── Send to remote BoxLab ─────────────────────────────────────────────────

    async def _send_loop(self):
        delay = RETRY_BASE
        while self._running:
            try:
                async with websockets.connect(self.remote_url) as ws:
                    log.info(f"[TX] Connected to remote: {self.remote_url}")
                    delay = RETRY_BASE

                    # Flush buffered frames first
                    flushed = 0
                    while self.buffer:
                        frame = self.buffer.popleft()
                        await ws.send(frame)
                        flushed += 1
                    if flushed:
                        log.info(f"[TX] Flushed {flushed} buffered frames")

                    # Live stream
                    while self._running:
                        if self.buffer:
                            frame = self.buffer.popleft()
                            await ws.send(frame)
                        else:
                            await asyncio.sleep(0.002)  # 500 Hz poll max

            except Exception as e:
                log.warning(f"[TX] Remote WS error: {e} — retry in {delay:.1f}s")
                await asyncio.sleep(delay)
                delay = min(delay * 2, RETRY_MAX)

    def stop(self):
        self._running = False


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="DriftTune LTE Sender")
    parser.add_argument("--car",  default="CAR_01",    help="Car ID")
    parser.add_argument("--host", default="127.0.0.1", help="BoxLab receiver host/IP")
    parser.add_argument("--port", default=9000, type=int, help="BoxLab receiver port")
    args = parser.parse_args()

    sender = LTESender(car_id=args.car, remote_host=args.host, remote_port=args.port)

    log.info(f"LTE Sender starting — car={args.car} remote={args.host}:{args.port}")
    asyncio.run(sender.run())
