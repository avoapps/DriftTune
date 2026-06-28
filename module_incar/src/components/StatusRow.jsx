export default function StatusRow({ data, status }) {
  const { raw, computed } = data;
  const lapTime = data.lap_time;
  const mins = Math.floor(lapTime / 60);
  const secs = (lapTime % 60).toFixed(1).padStart(4, '0');

  const h2oColor = raw.h2o > 110 ? '#CC1111' : raw.h2o > 100 ? '#FFB800' : '#6B6B7E';
  const oilColor = raw.oil_press < 1.0 ? '#CC1111' : raw.oil_press < 1.5 ? '#FFB800' : '#6B6B7E';

  const statusColor = status === 'connected' ? '#00C853' : status === 'sim' ? '#FFB800' : '#CC1111';
  const statusLabel = status === 'connected' ? 'LIVE' : status === 'sim' ? 'SIM' : 'NO SIGNAL';

  return (
    <div className="status-row">
      <div className="status-cell">
        <span className="stat-label">LAP</span>
        <span className="stat-val">{data.lap_number}</span>
      </div>
      <div className="status-cell">
        <span className="stat-label">TIME</span>
        <span className="stat-val">{mins}:{secs}</span>
      </div>
      <div className="status-cell">
        <span className="stat-label">SECTOR</span>
        <span className="stat-val sector">{data.track_sector}</span>
      </div>
      <div className="status-cell">
        <span className="stat-label">AI</span>
        <span className="stat-val" style={{ color: '#80CBC4' }}>{computed.ai_score.toFixed(1)}</span>
      </div>
      <div className="status-cell">
        <span className="stat-label">H₂O</span>
        <span className="stat-val" style={{ color: h2oColor }}>{Math.round(raw.h2o)}°</span>
      </div>
      <div className="status-cell">
        <span className="stat-label">OIL</span>
        <span className="stat-val" style={{ color: oilColor }}>{raw.oil_press.toFixed(1)}</span>
      </div>
      <div className="status-cell">
        <span className="status-dot" style={{ background: statusColor }} />
        <span className="stat-val" style={{ color: statusColor, fontSize: '0.7rem' }}>{statusLabel}</span>
      </div>
    </div>
  );
}
