import React from 'react';

const PARAM_RANGES = {
  rpm:         [0, 8500],
  spd:         [0, 200],
  drift_angle: [0, 90],
  afr:         [10, 18],
  boost:       [0, 3.0],
  ai_score:    [0, 10],
};

const GAUGE_COLORS = {
  rpm:         '#CC1111',
  spd:         '#4FC3F7',
  drift_angle: '#FFB74D',
  afr:         '#00C853',
  boost:       '#CE93D8',
  ai_score:    '#80CBC4',
};

/* SVG arc path: angles in degrees, 0 = east (right), clockwise sweep */
function arcPath(cx, cy, r, startDeg, sweepDeg) {
  if (sweepDeg <= 0.01) return '';
  const toRad = d => (d * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(startDeg));
  const sy = cy + r * Math.sin(toRad(startDeg));
  const ex = cx + r * Math.cos(toRad(startDeg + sweepDeg));
  const ey = cy + r * Math.sin(toRad(startDeg + sweepDeg));
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

/* Display formatting per param */
function displayValue(param, value) {
  if (value === null || value === undefined) return '—';
  if (param === 'rpm')   return Math.round(value).toLocaleString('en');
  if (param === 'afr')   return Number(value).toFixed(2);
  if (param === 'boost') return Number(value).toFixed(2);
  return Number(value).toFixed(1);
}

export default function GaugeCard({ param, value, unit, t }) {
  const color      = GAUGE_COLORS[param] || '#F0F0F0';
  const [min, max] = PARAM_RANGES[param] || [0, 100];
  const pct        = Math.max(0, Math.min(1, ((value ?? 0) - min) / (max - min)));
  const sweep      = pct * 270;

  /* SVG gauge: 120×120, center (60,60), radius 44, strokeWidth 8
     start = 135° (7 o'clock), full sweep = 270° CW to 5 o'clock */
  const CX = 60, CY = 60, R = 44, SW = 8;
  const bgPath  = arcPath(CX, CY, R, 135, 270);
  const valPath = arcPath(CX, CY, R, 135, sweep);

  return (
    <div className="gauge-card">
      <svg className="gauge-svg" viewBox="0 0 120 120" width="120" height="120">
        {/* background arc */}
        <path d={bgPath}  fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={SW} strokeLinecap="round" />
        {/* value arc */}
        {valPath && <path d={valPath} fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round" />}
        {/* center value */}
        <text x="60" y="57" textAnchor="middle" className="gauge-value-text" fill={color}>
          {displayValue(param, value)}
        </text>
        <text x="60" y="71" textAnchor="middle" className="gauge-unit-text" fill="#6B6B7E">
          {unit}
        </text>
      </svg>
      <div className="gauge-label">{t(`params.${param}`)}</div>
    </div>
  );
}
