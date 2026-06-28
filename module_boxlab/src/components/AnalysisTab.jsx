import React, { useState, useRef, useEffect } from 'react';

// ── Lap store: keeps last 10 laps of telemetry snapshots ─────────────────────
const lapHistory = {};
let currentLapBuffer = [];
let currentLap = 1;

export function recordFrame(data) {
  if (!data?.raw) return;
  const lap = data.lap_number || 1;
  if (lap !== currentLap) {
    if (currentLapBuffer.length > 0) {
      lapHistory[currentLap] = [...currentLapBuffer];
    }
    currentLap = lap;
    currentLapBuffer = [];
  }
  currentLapBuffer.push({
    t:     data.lap_time || 0,
    rpm:   data.raw.rpm || 0,
    spd:   data.raw.spd || 0,
    tps:   data.raw.tps || 0,
    drift: data.computed?.drift_angle || 0,
    ai:    data.computed?.ai_score || 0,
    gx:    data.raw.gx || 0,
  });
}

export function getLaps() {
  const all = { ...lapHistory };
  if (currentLapBuffer.length > 5) all[currentLap] = [...currentLapBuffer];
  return all;
}

// ── Mini line chart (canvas) ──────────────────────────────────────────────────
function MiniChart({ laps, field, label, unit, color1 = '#CC1111', color2 = '#4FC3F7', height = 120 }) {
  const canvasRef = useRef(null);
  const lapKeys = Object.keys(laps).map(Number).sort((a, b) => a - b);
  const [lapA, setLapA] = useState(null);
  const [lapB, setLapB] = useState(null);

  useEffect(() => {
    if (lapKeys.length >= 2 && !lapA) {
      setLapA(lapKeys[lapKeys.length - 2]);
      setLapB(lapKeys[lapKeys.length - 1]);
    }
  }, [lapKeys.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const drawLap = (lapNum, color) => {
      const frames = laps[lapNum];
      if (!frames || frames.length < 2) return;
      const vals = frames.map(f => f[field] || 0);
      const maxT = frames[frames.length - 1].t || 1;
      const maxV = Math.max(...vals, 1);
      const minV = Math.min(...vals, 0);
      const range = maxV - minV || 1;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      frames.forEach((f, i) => {
        const x = (f.t / maxT) * W;
        const y = H - ((f[field] - minV) / range) * (H - 8) - 4;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    if (lapA !== null) drawLap(lapA, color1);
    if (lapB !== null) drawLap(lapB, color2);
  }, [lapA, lapB, laps, field]);

  return (
    <div className="analysis-chart-wrap">
      <div className="analysis-chart-header">
        <span className="analysis-chart-label">{label}</span>
        <span className="analysis-chart-unit">{unit}</span>
        <div className="analysis-lap-pickers">
          <select value={lapA ?? ''} onChange={e => setLapA(Number(e.target.value))}
            className="lap-picker" style={{ borderColor: color1 }}>
            <option value="">—</option>
            {lapKeys.map(l => <option key={l} value={l}>Lap {l}</option>)}
          </select>
          <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>vs</span>
          <select value={lapB ?? ''} onChange={e => setLapB(Number(e.target.value))}
            className="lap-picker" style={{ borderColor: color2 }}>
            <option value="">—</option>
            {lapKeys.map(l => <option key={l} value={l}>Lap {l}</option>)}
          </select>
        </div>
      </div>
      <canvas ref={canvasRef} width={600} height={height} className="analysis-canvas" />
    </div>
  );
}

// ── Sector table ──────────────────────────────────────────────────────────────
function SectorAnalysis({ laps }) {
  const lapKeys = Object.keys(laps).map(Number).sort((a, b) => a - b);
  const sectors = ['S1', 'S2', 'S3', 'S4', 'S5'];

  const sectorTimes = (frames) => {
    if (!frames?.length) return {};
    const out = {};
    let lastSector = null, sectorStart = 0;
    frames.forEach(f => {
      const s = sectors.find(s => f.sector === s);
      if (s && s !== lastSector) {
        if (lastSector) out[lastSector] = f.t - sectorStart;
        lastSector = s;
        sectorStart = f.t;
      }
    });
    return out;
  };

  const allSectorTimes = lapKeys.map(l => ({ lap: l, times: sectorTimes(laps[l]) }));
  const bestPerSector = {};
  sectors.forEach(s => {
    const times = allSectorTimes.map(l => l.times[s]).filter(Boolean);
    if (times.length) bestPerSector[s] = Math.min(...times);
  });

  if (!lapKeys.length) return <div className="analysis-empty">No lap data yet — drive some laps.</div>;

  return (
    <table className="analysis-table">
      <thead>
        <tr>
          <th>Lap</th>
          {sectors.map(s => <th key={s}>{s}</th>)}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {allSectorTimes.map(({ lap, times }) => {
          const total = Object.values(times).reduce((a, b) => a + b, 0);
          return (
            <tr key={lap}>
              <td style={{ color: 'var(--gold)', fontFamily: 'monospace' }}>Lap {lap}</td>
              {sectors.map(s => {
                const t = times[s];
                const isBest = t && bestPerSector[s] === t;
                return (
                  <td key={s} style={{
                    fontFamily: 'monospace',
                    color: isBest ? 'var(--ok)' : 'var(--text)',
                    fontWeight: isBest ? 700 : 400,
                  }}>
                    {t ? t.toFixed(2) + 's' : '—'}
                  </td>
                );
              })}
              <td style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>
                {total ? total.toFixed(2) + 's' : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── AI Coaching ───────────────────────────────────────────────────────────────
function AICoaching({ data }) {
  const score = data?.computed?.ai_score || 0;
  const style = data?.computed?.driver_style || 'HYBRID';
  const drift = data?.computed?.drift_angle || 0;
  const tps   = data?.raw?.tps || 0;

  const tips = [];
  if (score < 5) tips.push({ icon: '⚠', text: 'Inconsistent drift angle — try to maintain smoother yaw', color: 'var(--warning)' });
  if (tps < 30 && drift > 20) tips.push({ icon: '⛽', text: 'More throttle needed to sustain the drift angle', color: 'var(--warning)' });
  if (score > 8) tips.push({ icon: '✅', text: 'Excellent consistency — smooth inputs, good G utilization', color: 'var(--ok)' });
  if (style === 'AGGRESSIVE' && score < 6) tips.push({ icon: '🎯', text: 'Aggressive style detected — focus on smoother throttle transitions', color: 'var(--g-drift)' });
  if (!tips.length) tips.push({ icon: '📊', text: 'Collecting data — keep driving for coaching feedback', color: 'var(--muted)' });

  const styleColors = { AGGRESSIVE: '#CC1111', TECHNICAL: '#4FC3F7', HYBRID: '#C9A84C' };
  const pct = Math.round((score / 10) * 100);

  return (
    <div className="ai-coaching">
      <div className="ai-score-row">
        <div className="ai-score-circle" style={{ '--pct': pct + '%', '--color': score > 7 ? 'var(--ok)' : score > 4 ? 'var(--warning)' : 'var(--accent)' }}>
          <span className="ai-score-num">{score.toFixed(1)}</span>
          <span className="ai-score-label">AI Score</span>
        </div>
        <div className="ai-style-block">
          <div className="ai-style-val" style={{ color: styleColors[style] }}>{style}</div>
          <div className="ai-style-label">Driver Style</div>
          <div className="ai-bars">
            <div className="ai-bar-row"><span>Drift Angle</span><div className="ai-bar-bg"><div className="ai-bar-fill" style={{ width: Math.min(100, drift / 90 * 100) + '%', background: 'var(--g-drift)' }} /></div></div>
            <div className="ai-bar-row"><span>Throttle</span><div className="ai-bar-bg"><div className="ai-bar-fill" style={{ width: tps + '%', background: 'var(--ok)' }} /></div></div>
            <div className="ai-bar-row"><span>Consistency</span><div className="ai-bar-bg"><div className="ai-bar-fill" style={{ width: pct + '%', background: 'var(--g-ai)' }} /></div></div>
          </div>
        </div>
      </div>
      <div className="ai-tips">
        {tips.map((tip, i) => (
          <div key={i} className="ai-tip" style={{ borderLeftColor: tip.color }}>
            <span className="ai-tip-icon">{tip.icon}</span>
            <span>{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV(laps) {
  const rows = [['lap', 't', 'rpm', 'spd', 'tps', 'drift', 'ai', 'gx']];
  Object.entries(laps).forEach(([lap, frames]) => {
    frames.forEach(f => rows.push([lap, f.t.toFixed(2), f.rpm.toFixed(0), f.spd.toFixed(1), f.tps.toFixed(1), f.drift.toFixed(1), f.ai.toFixed(2), f.gx.toFixed(3)]));
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `drifttune_session_${Date.now()}.csv`;
  a.click();
}

// ── Main Analysis Tab ─────────────────────────────────────────────────────────
export default function AnalysisTab({ t, data }) {
  const [section, setSection] = useState('lap');
  const laps = getLaps();

  const sections = [
    { id: 'lap',    label: 'Lap Comparison' },
    { id: 'sector', label: 'Sector Analysis' },
    { id: 'ai',     label: 'AI Coaching' },
  ];

  return (
    <div className="analysis-tab">
      <div className="analysis-nav">
        {sections.map(s => (
          <button key={s.id} className={`analysis-nav-btn ${section === s.id ? 'active' : ''}`}
            onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
        <button className="analysis-nav-btn export-btn" onClick={() => exportCSV(laps)}>
          ↓ Export CSV
        </button>
      </div>

      {section === 'lap' && (
        <div className="analysis-charts">
          {Object.keys(laps).length < 2
            ? <div className="analysis-empty">Complete at least 2 laps to compare.</div>
            : <>
                <MiniChart laps={laps} field="spd"   label="Speed"       unit="km/h" />
                <MiniChart laps={laps} field="rpm"   label="RPM"         unit="rpm"  color1="#CC1111" color2="#FFB74D" />
                <MiniChart laps={laps} field="drift" label="Drift Angle" unit="°"    color1="#FFB74D" color2="#CE93D8" />
                <MiniChart laps={laps} field="tps"   label="Throttle"    unit="%"    color1="#00C853" color2="#80CBC4" />
              </>
          }
        </div>
      )}

      {section === 'sector' && <SectorAnalysis laps={laps} />}
      {section === 'ai' && <AICoaching data={data} />}
    </div>
  );
}
