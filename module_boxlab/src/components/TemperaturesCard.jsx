import React from 'react';
import { getParamColor } from '../utils/formatters';

const TEMP_PARAMS = [
  { key: 'h2o',       unit: '°C',  range: [60, 130] },
  { key: 'oil_temp',  unit: '°C',  range: [60, 150] },
  { key: 'egt',       unit: '°C',  range: [0,  1100] },
  { key: 'oil_press', unit: 'bar', range: [0,  8]   },
  { key: 'knock',     unit: '',    range: [0,  100]  },
  { key: 'battery',   unit: 'V',   range: [8,  16]   },
];

export default function TemperaturesCard({ data, t }) {
  const raw = data?.raw ?? {};

  return (
    <div className="card">
      <div className="card-title">{t('ui.dashboard')} — {t('params.h2o')} / {t('params.oil_temp')}</div>
      <div className="temps-grid">
        {TEMP_PARAMS.map(({ key, unit, range }) => {
          const value = raw[key];
          const color = getParamColor(key, value);
          const [lo, hi] = range;
          const pct = value !== undefined ? Math.max(0, Math.min(1, (value - lo) / (hi - lo))) * 100 : 0;

          return (
            <div key={key} className="temp-item">
              <div className="temp-label">{t(`params.${key}`)}</div>
              <div className="temp-value" style={{ color }}>
                {value !== undefined ? Number(value).toFixed(key === 'battery' || key === 'oil_press' ? 2 : 1) : '—'}
              </div>
              <div className="temp-unit">{unit}</div>
              <div className="temp-bar">
                <div className="temp-bar-fill" style={{ width: `${pct.toFixed(1)}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
