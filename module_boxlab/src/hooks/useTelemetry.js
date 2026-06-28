import { useState, useEffect, useRef } from 'react';

/* ── Constants mirrored from shared/telemetry_schema.py ──────────────── */

const ALARM_THRESHOLDS = {
  h2o:       { warning: 100, critical: 110 },
  oil_temp:  { warning: 120, critical: 135 },
  oil_press: { warning: 1.5, critical: 1.0 },
  egt:       { warning: 800, critical: 950 },
  knock:     { warning: 30,  critical: 60  },
  battery:   { warning: 11.5,critical: 10.5},
  boost:     { warning: 2.0, critical: 2.4 },
};

const TRACK_SECTORS = [
  { name: 'S1', duration: 3.0 },
  { name: 'S2', duration: 2.5 },
  { name: 'S3', duration: 2.0 },
  { name: 'S4', duration: 2.5 },
  { name: 'S5', duration: 2.0 },
];

const LAP_DURATION = TRACK_SECTORS.reduce((s, sec) => s + sec.duration, 0);

const SECTOR_PROFILES = {
  S1: { rpm: 7200, tps: 95, drift: 42, steer: 55,  brake: 0  },
  S2: { rpm: 6800, tps: 75, drift: 38, steer: 35,  brake: 5  },
  S3: { rpm: 5500, tps: 40, drift: 20, steer: -45, brake: 15 },
  S4: { rpm: 6900, tps: 80, drift: 44, steer: 40,  brake: 3  },
  S5: { rpm: 5000, tps: 60, drift: 15, steer: 20,  brake: 8  },
};

/* ── Simulation helpers ──────────────────────────────────────────────── */

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const noise  = (val, amt) => val + gauss() * amt;
const smooth = (cur, tgt, rate = 0.15) => cur + (tgt - cur) * rate;
const clamp  = (val, lo, hi) => Math.max(lo, Math.min(hi, val));
const fix    = (val, dec = 1) => parseFloat(val.toFixed(dec));

function getSector(elapsed) {
  let t = 0;
  for (const sec of TRACK_SECTORS) {
    t += sec.duration;
    if (elapsed < t) return { name: sec.name, progress: elapsed / LAP_DURATION };
  }
  return { name: 'S5', progress: 1.0 };
}

function checkAlarms(raw) {
  const alarms = [];
  const LOW = new Set(['oil_press', 'battery']);
  const checks = { h2o: raw.h2o, oil_temp: raw.oil_temp, oil_press: raw.oil_press,
                   egt: raw.egt, knock: raw.knock, battery: raw.battery, boost: raw.boost };

  for (const [param, value] of Object.entries(checks)) {
    const thr = ALARM_THRESHOLDS[param];
    if (!thr) continue;
    const isLow = LOW.has(param);
    const crit = isLow ? value <= thr.critical : value >= thr.critical;
    const warn = isLow ? value <= thr.warning  : value >= thr.warning;

    if (crit) {
      alarms.push({ alarm_id: `${param}_CRITICAL`, parameter: param, value,
                    threshold: thr.critical, severity: 'CRITICAL',
                    message: `${param.toUpperCase()} ${isLow ? 'critically low' : 'critical'}: ${value.toFixed(1)}` });
    } else if (warn) {
      alarms.push({ alarm_id: `${param}_WARNING`, parameter: param, value,
                    threshold: thr.warning, severity: 'WARNING',
                    message: `${param.toUpperCase()} ${isLow ? 'low' : 'warning'}: ${value.toFixed(1)}` });
    }
  }
  return alarms;
}

function generateMockFrame(state, startTime) {
  const now = Date.now() / 1000;
  const elapsed = (now - startTime) % LAP_DURATION;
  const { name: sector, progress } = getSector(elapsed);
  const lap = Math.floor((now - startTime) / LAP_DURATION) + 1;
  const profile = SECTOR_PROFILES[sector] || SECTOR_PROFILES.S1;

  /* smooth state transitions */
  state.rpm      = smooth(state.rpm,      profile.rpm,   0.12);
  state.tps      = smooth(state.tps,      profile.tps,   0.18);
  state.drift    = smooth(state.drift,    profile.drift, 0.10);
  state.steering = smooth(state.steering, profile.steer, 0.20);
  state.boost    = smooth(state.boost,    1.6 * (state.tps / 80), 0.15);
  state.spd      = smooth(state.spd,      65 + (state.tps - 70) * 0.5, 0.08);

  const raw = {
    car_id:       state.carId,
    session_id:   state.sessionId,
    ts:           now,
    rpm:          Math.round(noise(state.rpm, 30)),
    tps:          fix(clamp(noise(state.tps, 0.5), 0, 100)),
    afr:          fix(noise(11.8 + (100 - state.tps) * 0.03, 0.05), 2),
    boost:        fix(Math.max(0, noise(state.boost, 0.02)), 2),
    egt:          fix(noise(720 + state.rpm * 0.01, 5)),
    h2o:          fix(noise(89 + (state.rpm - 5000) * 0.002, 0.3)),
    oil_temp:     fix(noise(107 + (state.rpm - 5000) * 0.003, 0.3)),
    oil_press:    fix(Math.max(0, noise(4.2 - state.rpm * 0.0001, 0.05)), 2),
    fuel_press:   fix(noise(3.8, 0.03), 2),
    ignition:     fix(noise(18 + state.tps * 0.05, 0.2)),
    knock:        fix(Math.max(0, noise(5 + (state.rpm - 7000) * 0.01, 1))),
    injector_dc:  fix(Math.min(100, state.tps * 0.85 + state.rpm * 0.002)),
    battery:      fix(noise(13.8, 0.05), 2),
    spd:          fix(Math.max(0, noise(state.spd, 0.3))),
    gear:         clamp(Math.floor(state.rpm / 2000), 1, 6),
    gx:           fix(noise(Math.sin((state.drift * Math.PI) / 180) * 0.9, 0.02), 3),
    gy:           fix(noise((state.tps - 50) * 0.008, 0.02), 3),
    gz:           fix(noise(1.0, 0.01), 3),
    yaw:          fix(noise(state.drift * 1.1, 0.5), 2),
    pitch:        fix(noise(-2.1, 0.1), 2),
    roll:         fix(noise(state.drift * 0.3, 0.2), 2),
    lat:          45.7069 + 0.0015 * Math.sin(progress * 2 * Math.PI),
    lon:          13.8736 + 0.0015 * 1.6 * Math.cos(progress * 2 * Math.PI),
    gps_speed:    fix(noise(state.spd * 0.98, 0.2)),
    gps_heading:  fix((progress * 360) % 360),
    gps_alt:      0,
    steering:     fix(noise(state.steering, 0.5)),
    brake:        fix(Math.max(0, noise(profile.brake * 0.15, 0.1)), 2),
    handbrake:    sector === 'S1' && progress < 0.1 ? 1.0 : 0.0,
    clutch:       fix(Math.max(0, noise(5.0, 1.0))),
    wsp_fl:       fix(noise(state.spd * 0.99, 0.2)),
    wsp_fr:       fix(noise(state.spd * 0.99, 0.2)),
    wsp_rl:       fix(noise(state.spd * 1.25, 0.5)),
    wsp_rr:       fix(noise(state.spd * 1.25, 0.5)),
    susp_fl:      fix(noise(45 + state.drift * 0.3, 0.5)),
    susp_fr:      fix(noise(42 - state.drift * 0.2, 0.5)),
    susp_rl:      fix(noise(38 + state.drift * 0.4, 0.5)),
    susp_rr:      fix(noise(52 - state.drift * 0.1, 0.5)),
    tire_temp_fl: fix(noise(75, 1.0)),
    tire_temp_fr: fix(noise(78, 1.0)),
    tire_temp_rl: fix(noise(95 + state.drift * 0.3, 1.5)),
    tire_temp_rr: fix(noise(92 + state.drift * 0.2, 1.5)),
    tire_press_fl: fix(noise(2.1, 0.02), 2),
    tire_press_fr: fix(noise(2.1, 0.02), 2),
    tire_press_rl: fix(noise(1.85, 0.02), 2),
    tire_press_rr: fix(noise(1.85, 0.02), 2),
  };

  const drift_angle  = fix(Math.abs(noise(state.drift, 0.3)));
  const g_magnitude  = fix(Math.sqrt(raw.gx ** 2 + raw.gy ** 2), 3);
  const wheel_slip_r = raw.spd > 5
    ? fix(((raw.wsp_rl + raw.wsp_rr) / 2 - raw.spd) / Math.max(raw.spd, 1) * 100)
    : 0.0;
  const ai_score     = fix(clamp(5.0 + (drift_angle / 50) * 2.0 + (raw.tps / 100) * 1.5 + noise(0, 0.1), 0, 10));

  let driver_style;
  if (raw.steering > 50 && raw.handbrake > 0) driver_style = 'AGGRESSIVE';
  else if (raw.steering < 35 && raw.tps > 70) driver_style = 'TECHNICAL';
  else driver_style = 'HYBRID';

  return {
    raw,
    drift_angle,
    g_magnitude,
    wheel_slip_r,
    ai_score,
    driver_style,
    track_sector: sector,
    lap_number:   lap,
    lap_time:     fix(elapsed, 2),
    alarms:       checkAlarms(raw),
  };
}

/* ── Hook ────────────────────────────────────────────────────────────── */

// config: { mode: 'simulator'|'websocket', wsHost, wsPort }
export default function useTelemetry(carId = 'CAR_01', config = {}) {
  const { mode = 'simulator', wsHost = 'localhost', wsPort = '8765' } = config;

  const [data,      setData]      = useState(null);
  const [connState, setConnState] = useState('off');
  const [lastUpdate,setLastUpdate]= useState(null);
  const [hz,        setHz]        = useState(0);

  const wsRef    = useRef(null);
  const retryRef = useRef(null);
  const mockRef  = useRef(null);
  const stateRef = useRef(null);
  const startRef = useRef(0);
  const fpsRef   = useRef({ count: 0, ts: Date.now() });

  /* simulator state — reset when carId changes */
  useEffect(() => {
    stateRef.current = { carId, rpm: 6500, tps: 80, drift: 38, steering: 0, boost: 1.6, spd: 65,
                         sessionId: `MOCK_${carId}_${Date.now()}` };
    startRef.current = Date.now() / 1000;
  }, [carId]);

  const tick = useRef(() => {
    fpsRef.current.count++;
    const now = Date.now();
    if (now - fpsRef.current.ts >= 1000) {
      setHz(Math.round(fpsRef.current.count));
      fpsRef.current = { count: 0, ts: now };
    }
  }).current;

  const startMock = useRef(() => {
    if (mockRef.current) return;
    mockRef.current = setInterval(() => {
      if (!stateRef.current) return;
      const frame = generateMockFrame(stateRef.current, startRef.current);
      setData(frame);
      setLastUpdate(Date.now());
      tick();
    }, 50);
  }).current;

  const stopMock = useRef(() => {
    if (mockRef.current) { clearInterval(mockRef.current); mockRef.current = null; }
  }).current;

  const closeWS = useRef(() => {
    clearTimeout(retryRef.current);
    if (wsRef.current) {
      wsRef.current.onopen  = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }).current;

  /* react to mode / host / port changes */
  useEffect(() => {
    if (mode === 'off') {
      closeWS();
      stopMock();
      setConnState('off');
      setData(null);
      return;
    }

    if (mode === 'simulator') {
      closeWS();
      setConnState('simulator');
      startMock();
      return () => stopMock();
    }

    /* websocket mode */
    stopMock();
    setConnState('connecting');

    const connect = () => {
      try {
        const url = `ws://${wsHost}:${wsPort}/ws/telemetry/${carId}`;
        const ws  = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnState('connected');
          stopMock();
        };

        ws.onmessage = (e) => {
          try {
            setData(JSON.parse(e.data));
            setLastUpdate(Date.now());
            tick();
          } catch { /* malformed frame */ }
        };

        ws.onclose = () => {
          setConnState('disconnected');
          startMock();
        };

        ws.onerror = () => { /* onclose fires next */ };

      } catch {
        setConnState('disconnected');
        startMock();
      }
    };

    connect();

    return () => {
      closeWS();
      stopMock();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wsHost, wsPort, carId]);

  return { data, connected: connState === 'connected', connState, lastUpdate, hz };
}
