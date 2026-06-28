"""
DriftTune — Session Storage
============================
SQLite-based session logging.
Each session = one SQLite file: sessions/{session_id}.db
"""

import json
import os
import sqlite3
import time

SESSIONS_DIR = os.path.join(os.path.dirname(__file__), "sessions")


def _ensure_dir():
    os.makedirs(SESSIONS_DIR, exist_ok=True)


class SessionStorage:
    def __init__(self, session_id: str, car_id: str):
        _ensure_dir()
        self.session_id = session_id
        self.car_id     = car_id
        db_path = os.path.join(SESSIONS_DIR, f"{session_id}_{car_id}.db")
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._create_tables()
        self._frame_count = 0

    def _create_tables(self):
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS telemetry (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          REAL NOT NULL,
                lap         INTEGER,
                lap_time    REAL,
                sector      TEXT,
                data        TEXT NOT NULL
            )
        """)
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS alarms (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          REAL NOT NULL,
                alarm_id    TEXT,
                parameter   TEXT,
                value       REAL,
                threshold   REAL,
                severity    TEXT,
                message     TEXT
            )
        """)
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS session_meta (
                key         TEXT PRIMARY KEY,
                value       TEXT
            )
        """)
        self._conn.execute(
            "INSERT OR REPLACE INTO session_meta VALUES (?, ?)",
            ("started_at", str(time.time()))
        )
        self._conn.execute(
            "INSERT OR REPLACE INTO session_meta VALUES (?, ?)",
            ("car_id", self.car_id)
        )
        self._conn.commit()

    def log_frame(self, enriched: dict, lap: int, lap_time: float, sector: str):
        # Log every 5th frame (10 Hz storage) to keep DB size manageable
        self._frame_count += 1
        if self._frame_count % 5 != 0:
            return
        self._conn.execute(
            "INSERT INTO telemetry (ts, lap, lap_time, sector, data) VALUES (?,?,?,?,?)",
            (time.time(), lap, lap_time, sector, json.dumps(enriched))
        )

    def log_alarm(self, alarm):
        self._conn.execute(
            "INSERT INTO alarms (ts, alarm_id, parameter, value, threshold, severity, message) "
            "VALUES (?,?,?,?,?,?,?)",
            (time.time(), alarm.alarm_id, alarm.parameter,
             alarm.value, alarm.threshold, alarm.severity, alarm.message)
        )
        self._conn.commit()

    def flush(self):
        self._conn.commit()

    def close(self):
        self._conn.commit()
        self._conn.close()

    def summary(self) -> dict:
        cur = self._conn.execute(
            "SELECT COUNT(*), MIN(ts), MAX(ts) FROM telemetry"
        )
        count, t_min, t_max = cur.fetchone()
        duration = (t_max - t_min) if (t_min and t_max) else 0
        cur2 = self._conn.execute("SELECT COUNT(*) FROM alarms")
        alarm_count = cur2.fetchone()[0]
        return {
            "session_id":   self.session_id,
            "car_id":       self.car_id,
            "frames":       count,
            "duration_s":   round(duration, 1),
            "alarm_count":  alarm_count,
        }
