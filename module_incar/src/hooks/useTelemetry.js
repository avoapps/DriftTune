import { useState, useEffect, useRef } from 'react';

const WS_URL = 'ws://localhost:8765/ws/telemetry/CAR_01';
const MOCK_HZ = 50;

function generateMock(t) {
  const sector = ['S1','S2','S3','S4','S5'][Math.floor((t / 4000) % 5)];
  const rpm = 4500 + Math.sin(t / 800) * 2500 + (Math.random() - 0.5) * 200;
  const spd = 60 + Math.sin(t / 1200) * 40 + (Math.random() - 0.5) * 5;
  const drift_angle = Math.max(0, 25 + Math.sin(t / 600) * 30 + (Math.random() - 0.5) * 5);
  const tps = Math.max(0, Math.min(100, 70 + Math.sin(t / 900) * 30));
  const brake = Math.max(0, Math.sin(t / 1100) * 15);
  const steering = Math.sin(t / 500) * 120;
  const gear = Math.max(1, Math.min(6, Math.round(spd / 35)));
  const ai_score = 7.2 + Math.sin(t / 3000) * 1.5;
  const h2o = 88 + Math.sin(t / 5000) * 8;
  const oil_press = 4.2 + Math.sin(t / 4000) * 0.8;
  const knock = Math.max(0, Math.sin(t / 2000) * 20);
  const alarms = [];
  if (h2o > 100) alarms.push({ alarm_id:'h2o_warn', parameter:'h2o', value: h2o, threshold: 100, severity:'WARNING', message:'High coolant temp' });
  if (knock > 30) alarms.push({ alarm_id:'knock_warn', parameter:'knock', value: knock, threshold: 30, severity:'WARNING', message:'Knock detected' });
  return {
    raw: { rpm, spd, tps, brake, steering, gear, h2o, oil_press, knock, battery: 13.8, clutch: 0, gx: Math.sin(t/400)*1.8, gy: Math.cos(t/600)*1.2 },
    computed: { drift_angle, ai_score, driver_style: 'AGGRESSIVE', g_magnitude: Math.sqrt(Math.pow(Math.sin(t/400)*1.8,2)+Math.pow(Math.cos(t/600)*1.2,2)) },
    alarms,
    track_sector: sector,
    lap_number: Math.floor(t / 60000) + 1,
    lap_time: (t % 60000) / 1000,
  };
}

export function useTelemetry() {
  const [data, setData] = useState(() => generateMock(0));
  const [status, setStatus] = useState('connecting'); // connected | disconnected | sim
  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const retryDelay = useRef(1000);
  const mockRef = useRef(null);
  const startRef = useRef(Date.now());

  function startMock() {
    setStatus('sim');
    if (mockRef.current) return;
    mockRef.current = setInterval(() => {
      setData(generateMock(Date.now() - startRef.current));
    }, MOCK_HZ);
  }

  function stopMock() {
    if (mockRef.current) { clearInterval(mockRef.current); mockRef.current = null; }
  }

  function connect() {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => { setStatus('connected'); stopMock(); retryDelay.current = 1000; };
      ws.onmessage = (e) => { try { setData(JSON.parse(e.data)); } catch {} };
      ws.onclose = () => { setStatus('disconnected'); startMock(); scheduleRetry(); };
      ws.onerror = () => { ws.close(); };
    } catch {
      startMock();
      scheduleRetry();
    }
  }

  function scheduleRetry() {
    retryRef.current = setTimeout(() => {
      retryDelay.current = Math.min(retryDelay.current * 2, 16000);
      connect();
    }, retryDelay.current);
  }

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (retryRef.current) clearTimeout(retryRef.current);
      stopMock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, status };
}
