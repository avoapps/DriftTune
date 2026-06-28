const PARAM_UNITS = {
  rpm: 'rpm', tps: '%', afr: 'AFR', boost: 'bar', egt: '°C',
  h2o: '°C', oil_temp: '°C', oil_press: 'bar', fuel_press: 'bar',
  ignition: '°', knock: '', injector_dc: '%', battery: 'V',
  spd: 'km/h', gear: '', gx: 'G', gy: 'G', gz: 'G',
  yaw: '°/s', drift_angle: '°', g_magnitude: 'G', wheel_slip_r: '%',
  steering: '°', brake: 'bar', clutch: '%', ai_score: '/10',
  lap_time: 's', wsp_fl: 'km/h', wsp_fr: 'km/h', wsp_rl: 'km/h', wsp_rr: 'km/h',
};

const PARAM_DECIMALS = {
  rpm: 0, gear: 0, spd: 1, drift_angle: 1, afr: 2, boost: 2,
  ai_score: 1, h2o: 1, oil_temp: 1, egt: 1, oil_press: 2, knock: 1, battery: 2,
};

const ALARM_THRESHOLDS = {
  h2o:       { warning: 100,  critical: 110  },
  oil_temp:  { warning: 120,  critical: 135  },
  oil_press: { warning: 1.5,  critical: 1.0  },
  egt:       { warning: 800,  critical: 950  },
  knock:     { warning: 30,   critical: 60   },
  battery:   { warning: 11.5, critical: 10.5 },
  boost:     { warning: 2.0,  critical: 2.4  },
};

const LOW_PARAMS = new Set(['oil_press', 'battery']);

export function formatValue(param, value) {
  const unit = PARAM_UNITS[param] ?? '';
  if (value === null || value === undefined) return unit ? `— ${unit}` : '—';
  const dec = PARAM_DECIMALS[param] ?? 1;
  const str = Number(value).toFixed(dec);
  return unit ? `${str} ${unit}` : str;
}

export function getUnit(param) {
  return PARAM_UNITS[param] ?? '';
}

export function getParamColor(param, value) {
  const thr = ALARM_THRESHOLDS[param];
  if (!thr || value === null || value === undefined) return '#F0F0F0';

  if (LOW_PARAMS.has(param)) {
    if (value <= thr.critical) return '#ff4444';
    if (value <= thr.warning)  return '#FFB800';
  } else {
    if (value >= thr.critical) return '#ff4444';
    if (value >= thr.warning)  return '#FFB800';
  }
  return '#00C853';
}

export function formatLapTime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m  = Math.floor(seconds / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
