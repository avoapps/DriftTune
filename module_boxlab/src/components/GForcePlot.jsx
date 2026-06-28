import React, { useRef, useEffect } from 'react';

const TRAIL_MAX  = 30;
const PLOT_SIZE  = 180; /* canvas px */
const MAX_G      = 3;   /* axes go ±3G */

export default function GForcePlot({ data, t }) {
  const canvasRef = useRef(null);
  const trailRef  = useRef([]);

  useEffect(() => {
    const gx = data?.raw?.gx;
    const gy = data?.raw?.gy;
    if (gx === undefined || gy === undefined) return;

    const trail = trailRef.current;
    trail.push({ gx, gy });
    if (trail.length > TRAIL_MAX) trail.shift();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const W    = canvas.width;
    const H    = canvas.height;
    const cx   = W / 2;
    const cy   = H / 2;
    const scale = (W / 2) / MAX_G;

    /* background */
    ctx.fillStyle = '#0D0D10';
    ctx.fillRect(0, 0, W, H);

    /* concentric rings */
    [1, 2, 3].forEach(g => {
      ctx.beginPath();
      ctx.arc(cx, cy, g * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth   = 1;
      ctx.stroke();
      /* label */
      ctx.fillStyle   = 'rgba(255,255,255,0.2)';
      ctx.font        = '9px monospace';
      ctx.fillText(`${g}G`, cx + g * scale + 2, cy - 3);
    });

    /* crosshair */
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 4); ctx.lineTo(cx, H - 4);
    ctx.moveTo(4, cy); ctx.lineTo(W - 4, cy);
    ctx.stroke();

    /* axis labels */
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font      = '8px monospace';
    ctx.fillText('LAT', W - 22, cy - 4);
    ctx.fillText('LONG', cx + 3, 10);

    /* trail */
    trail.forEach((pt, i) => {
      const alpha = ((i + 1) / trail.length) * 0.75;
      const r     = i === trail.length - 1 ? 5 : 3;
      ctx.beginPath();
      ctx.arc(cx + pt.gx * scale, cy - pt.gy * scale, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(76, 195, 247, ${alpha})`;
      ctx.fill();
    });

    /* current G-magnitude ring */
    if (trail.length > 0) {
      const cur = trail[trail.length - 1];
      ctx.beginPath();
      ctx.arc(cx + cur.gx * scale, cy - cur.gy * scale, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#4FC3F7';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }
  }, [data]);

  return (
    <div className="card g-force-plot">
      <div className="card-title">{t('ui.g_force_plot')}</div>
      <canvas ref={canvasRef} width={PLOT_SIZE} height={PLOT_SIZE} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 9, color: '#6B6B7E' }}>
          Gx {(data?.raw?.gx ?? 0).toFixed(2)} G
        </span>
        <span style={{ fontSize: 9, color: '#6B6B7E' }}>
          Gy {(data?.raw?.gy ?? 0).toFixed(2)} G
        </span>
        <span style={{ fontSize: 9, color: '#4FC3F7' }}>
          |G| {(data?.g_magnitude ?? 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
