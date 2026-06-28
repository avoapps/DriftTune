export default function BigNumbers({ data }) {
  const { raw, computed } = data;
  return (
    <div className="big-numbers">
      <div className="big-cell">
        <span className="big-val speed">{Math.round(raw.spd)}</span>
        <span className="big-unit">km/h</span>
      </div>
      <div className="big-cell center-cell">
        <span className="big-val gear">{raw.gear || 'N'}</span>
        <span className="big-unit">GEAR</span>
      </div>
      <div className="big-cell">
        <span className="big-val drift" style={{ color: computed.drift_angle > 40 ? '#CC1111' : '#FFB74D' }}>
          {Math.round(computed.drift_angle)}°
        </span>
        <span className="big-unit">DRIFT</span>
      </div>
    </div>
  );
}
