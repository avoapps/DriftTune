import './styles.css';
import { useTelemetry } from './hooks/useTelemetry';
import AnalogGauge from './components/AnalogGauge';
import AlarmBanner from './components/AlarmBanner';

function TopBar({ data, status }) {
  const lapTime = data.lap_time;
  const mins = Math.floor(lapTime / 60);
  const secs = (lapTime % 60).toFixed(1).padStart(4, '0');
  const statusColor = status === 'connected' ? '#00C853' : status === 'sim' ? '#FFB800' : '#CC1111';
  const statusLabel = status === 'connected' ? 'LIVE' : status === 'sim' ? 'SIM' : 'NO SIGNAL';

  return (
    <div className="top-bar">
      <div className="top-left">
        <div className="top-stat">
          <span className="top-stat-label">LAP</span>
          <span className="top-stat-val">{data.lap_number}</span>
        </div>
        <div className="top-stat">
          <span className="top-stat-label">TIME</span>
          <span className="top-stat-val">{mins}:{secs}</span>
        </div>
        <div className="top-stat">
          <span className="top-stat-label">SECTOR</span>
          <span className="top-stat-val" style={{ color: '#CC1111' }}>{data.track_sector}</span>
        </div>
      </div>

      <div className="top-logo">
        <span>DRIFT</span><span>TUNE</span>
        <div style={{ fontSize: '0.45rem', color: '#555', marginTop: 1 }}>InoCore Performance</div>
      </div>

      <div className="top-right">
        <div className="top-stat">
          <span className="top-stat-label">AI SCORE</span>
          <span className="top-stat-val" style={{ color: '#80CBC4' }}>{data.computed.ai_score.toFixed(1)}</span>
        </div>
        <div className="top-stat">
          <span className="top-stat-label">STYLE</span>
          <span className="top-stat-val" style={{ fontSize: '0.65rem', color: '#C9A84C' }}>{data.computed.driver_style}</span>
        </div>
        <span className="status-pill" style={{ color: statusColor, borderColor: statusColor }}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function BottomBar({ data }) {
  const { raw } = data;
  const tpsPct = Math.min(100, raw.tps);
  const brkPct = Math.min(100, (raw.brake / 30) * 100);
  const strPct = Math.min(100, Math.max(0, ((raw.steering + 180) / 360) * 100));

  return (
    <div className="bottom-bar">
      <div className="input-seg">
        <span className="input-seg-label">TPS</span>
        <div className="input-track">
          <div className="input-fill" style={{ width: `${tpsPct}%`, background: '#00C853' }} />
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#6B6B7E', width: 28, textAlign: 'right' }}>{Math.round(tpsPct)}%</span>
      </div>
      <div className="sep" />
      <div className="input-seg">
        <span className="input-seg-label">BRK</span>
        <div className="input-track">
          <div className="input-fill" style={{ width: `${brkPct}%`, background: '#CC1111' }} />
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#6B6B7E', width: 28, textAlign: 'right' }}>{raw.brake.toFixed(1)}</span>
      </div>
      <div className="sep" />
      <div className="input-seg">
        <span className="input-seg-label">STR</span>
        <div className="input-track steering-track">
          <div className="steering-mid" />
          <div className="steering-pin" style={{ left: `${strPct}%` }} />
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#6B6B7E', width: 34, textAlign: 'right' }}>{Math.round(raw.steering)}°</span>
      </div>
      <div className="sep" />
      <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#6B6B7E' }}>
        BAT {raw.battery.toFixed(1)}V
      </span>
    </div>
  );
}

export default function App() {
  const { data, status } = useTelemetry();
  const { raw, computed } = data;

  const driftColor = computed.drift_angle > 45 ? '#CC1111' : '#FFB74D';

  return (
    <div className="app">
      <TopBar data={data} status={status} />

      <div className="gauge-grid">
        {/* Top-left: Oil Pressure */}
        <AnalogGauge
          value={raw.oil_press}
          min={0} max={8}
          label="OIL PRESS"
          unit="bar"
          size={150}
          color="#C9A84C"
          warnValue={1.5} critValue={1.0}
          warningDir="low"
          decimals={1}
          ticks={8}
        />

        {/* Center large: RPM */}
        <div className="gauge-center">
          <AnalogGauge
            value={raw.rpm}
            min={0} max={8500}
            label="ENGINE RPM"
            unit="rpm"
            size={240}
            color="#CC1111"
            warnValue={7200} critValue={8000}
            warningDir="high"
            decimals={0}
            ticks={8}
          />
          <div className="center-strip">
            <div className="gear-box">
              <div className="gear-label">GEAR</div>
              <div className="gear-num">{raw.gear || 'N'}</div>
            </div>
            <div className="drift-box">
              <div className="drift-label">DRIFT</div>
              <div className="drift-num" style={{ color: driftColor }}>
                {Math.round(computed.drift_angle)}°
              </div>
            </div>
          </div>
        </div>

        {/* Top-right: Water Temp */}
        <AnalogGauge
          value={raw.h2o}
          min={60} max={130}
          label="COOLANT"
          unit="°C"
          size={150}
          color="#4FC3F7"
          warnValue={100} critValue={110}
          warningDir="high"
          decimals={0}
          ticks={7}
        />

        {/* Bottom-left: Oil Temp */}
        <AnalogGauge
          value={raw.oil_temp}
          min={60} max={150}
          label="OIL TEMP"
          unit="°C"
          size={150}
          color="#C9A84C"
          warnValue={120} critValue={135}
          warningDir="high"
          decimals={0}
          ticks={9}
        />

        {/* Bottom-right: Boost */}
        <AnalogGauge
          value={raw.boost}
          min={0} max={3.0}
          label="TURBO BOOST"
          unit="bar"
          size={150}
          color="#CE93D8"
          warnValue={2.0} critValue={2.4}
          warningDir="high"
          decimals={2}
          ticks={6}
        />
      </div>

      <BottomBar data={data} />

      {data.alarms && data.alarms.length > 0 && (
        <AlarmBanner alarms={data.alarms} />
      )}
    </div>
  );
}
