function Bar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="input-bar-row">
      <span className="input-label">{label}</span>
      <div className="input-track">
        <div className="input-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="input-val">{Math.round(value)}</span>
    </div>
  );
}

function SteeringBar({ value }) {
  const pct = ((value + 180) / 360) * 100;
  return (
    <div className="input-bar-row">
      <span className="input-label">STR</span>
      <div className="input-track steering-track">
        <div className="steering-center" />
        <div
          className="steering-needle"
          style={{ left: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <span className="input-val">{Math.round(value)}°</span>
    </div>
  );
}

export default function InputBars({ data }) {
  const { raw } = data;
  return (
    <div className="input-bars">
      <Bar label="TPS" value={raw.tps} max={100} color="#00C853" />
      <Bar label="BRK" value={raw.brake} max={30} color="#CC1111" />
      <SteeringBar value={raw.steering} />
    </div>
  );
}
