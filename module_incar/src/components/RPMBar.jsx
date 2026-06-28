export default function RPMBar({ rpm }) {
  const max = 8500;
  const pct = Math.min(100, (rpm / max) * 100);
  const redline = (7200 / max) * 100;

  const color = pct > (7200 / max * 100)
    ? '#CC1111'
    : pct > 60 ? '#FFB800' : '#00C853';

  return (
    <div className="rpm-bar-wrap">
      <div className="rpm-label">RPM</div>
      <div className="rpm-value">{Math.round(rpm).toLocaleString()}</div>
      <div className="rpm-track">
        <div className="rpm-fill" style={{ width: `${pct}%`, background: color }} />
        <div className="rpm-redline" style={{ left: `${redline}%` }} />
      </div>
    </div>
  );
}
