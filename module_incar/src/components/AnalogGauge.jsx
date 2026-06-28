/**
 * Analog clock-style gauge rendered in SVG.
 * startAngle / endAngle in degrees, 0 = top, clockwise.
 */
export default function AnalogGauge({
  value,
  min,
  max,
  label,
  unit,
  size = 160,
  startAngle = -135,
  endAngle = 135,
  ticks = 8,
  color = '#C9A84C',
  warnValue = null,
  critValue = null,
  warningDir = 'high', // 'high' = warn above threshold, 'low' = warn below
  decimals = 0,
}) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.42;
  const innerR = R * 0.72;

  function toRad(deg) { return (deg * Math.PI) / 180; }

  function angleForValue(v) {
    const clamped = Math.max(min, Math.min(max, v));
    const pct = (clamped - min) / (max - min);
    return startAngle + pct * (endAngle - startAngle);
  }

  function polarToXY(angleDeg, r) {
    const a = toRad(angleDeg - 90);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  // Arc path from startAngle to endAngle
  function arcPath(r, from, to) {
    const s = polarToXY(from, r);
    const e = polarToXY(to, r);
    const sweep = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${sweep} 1 ${e.x} ${e.y}`;
  }

  // Colored fill arc up to current value
  const needleAngle = angleForValue(value);

  // Determine needle color
  let needleColor = color;
  if (warnValue !== null && critValue !== null) {
    if (warningDir === 'high') {
      if (value >= critValue) needleColor = '#CC1111';
      else if (value >= warnValue) needleColor = '#FFB800';
    } else {
      if (value <= critValue) needleColor = '#CC1111';
      else if (value <= warnValue) needleColor = '#FFB800';
    }
  }

  // Needle tip and base points
  function needle() {
    const tip = polarToXY(needleAngle, R * 0.85);
    const base1 = polarToXY(needleAngle + 90, R * 0.08);
    const base2 = polarToXY(needleAngle - 90, R * 0.08);
    return `M ${base1.x} ${base1.y} L ${tip.x} ${tip.y} L ${base2.x} ${base2.y} Z`;
  }

  // Tick marks
  const tickEls = [];
  for (let i = 0; i <= ticks; i++) {
    const pct = i / ticks;
    const a = startAngle + pct * (endAngle - startAngle);
    const outer = polarToXY(a, R * 0.97);
    const inner = polarToXY(a, R * 0.82);
    const isMajor = i % 2 === 0;

    // Tick label
    const tickVal = min + pct * (max - min);
    const labelPos = polarToXY(a, R * 0.64);

    let tickColor = '#555';
    if (warnValue !== null && critValue !== null) {
      if (warningDir === 'high') {
        if (tickVal >= critValue) tickColor = '#CC1111';
        else if (tickVal >= warnValue) tickColor = '#FFB800';
      } else {
        if (tickVal <= critValue) tickColor = '#CC1111';
        else if (tickVal <= warnValue) tickColor = '#FFB800';
      }
    }

    tickEls.push(
      <g key={i}>
        <line
          x1={outer.x} y1={outer.y}
          x2={inner.x} y2={inner.y}
          stroke={tickColor}
          strokeWidth={isMajor ? 2 : 1}
        />
        {isMajor && (
          <text
            x={labelPos.x} y={labelPos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.075}
            fill={tickColor === '#555' ? '#888' : tickColor}
            fontFamily="monospace"
          >
            {tickVal % 1 === 0 ? tickVal : tickVal.toFixed(1)}
          </text>
        )}
      </g>
    );
  }

  const displayVal = decimals > 0 ? value.toFixed(decimals) : Math.round(value);
  const fontSize = size < 130 ? size * 0.16 : size * 0.14;

  return (
    <div className="gauge-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle cx={cx} cy={cy} r={R * 1.0} fill="#0e0e0e" stroke="#2a2a2a" strokeWidth="1.5" />

        {/* Track arc */}
        <path
          d={arcPath(R * 0.9, startAngle, endAngle)}
          fill="none" stroke="#222" strokeWidth={size * 0.04}
          strokeLinecap="round"
        />

        {/* Filled arc to current value */}
        {value > min && (
          <path
            d={arcPath(R * 0.9, startAngle, needleAngle)}
            fill="none" stroke={needleColor} strokeWidth={size * 0.035}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.1s, d 0.1s' }}
          />
        )}

        {/* Ticks */}
        {tickEls}

        {/* Needle */}
        <path d={needle()} fill={needleColor} opacity="0.95" />

        {/* Center cap */}
        <circle cx={cx} cy={cy} r={size * 0.055} fill="#1a1a1a" stroke={needleColor} strokeWidth="1.5" />

        {/* Value */}
        <text
          x={cx} y={cy + R * 0.42}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight="900"
          fontFamily="monospace"
          fill={needleColor}
        >
          {displayVal}
        </text>

        {/* Unit */}
        <text
          x={cx} y={cy + R * 0.62}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.065}
          fontFamily="monospace"
          fill="#555"
        >
          {unit}
        </text>
      </svg>
      <div className="gauge-label">{label}</div>
    </div>
  );
}
