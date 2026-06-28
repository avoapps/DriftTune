import React from 'react';

const GEARS = [1, 2, 3, 4, 5, 6];

function InputBar({ label, pct, color, displayVal }) {
  return (
    <div className="input-row">
      <span className="input-label">{label}</span>
      <div className="input-bar-wrap">
        <div
          className="input-bar-fill"
          style={{ width: `${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%`, background: color }}
        />
      </div>
      <span className="input-val">{displayVal}</span>
    </div>
  );
}

export default function DriverInputs({ data, t }) {
  const raw = data?.raw ?? {};

  const tps     = raw.tps     ?? 0;
  const brake   = raw.brake   ?? 0;  /* 0–30 bar */
  const clutch  = raw.clutch  ?? 0;
  const steer   = raw.steering ?? 0; /* -180 to 180 */
  const gear    = raw.gear    ?? 1;

  /* steering: normalised offset from centre */
  const steerNorm = Math.max(-1, Math.min(1, steer / 180));
  const steerFillWidth = `${Math.abs(steerNorm) * 50}%`;

  return (
    <div className="card driver-inputs">
      <div className="card-title">{t('params.tps').replace('Throttle', t('params.tps'))}</div>

      <InputBar
        label={t('params.tps')}
        pct={tps / 100}
        color="#CC1111"
        displayVal={`${tps.toFixed(0)}%`}
      />
      <InputBar
        label={t('params.brake')}
        pct={brake / 30}
        color="#4FC3F7"
        displayVal={`${brake.toFixed(1)}`}
      />
      <InputBar
        label={t('params.clutch')}
        pct={clutch / 100}
        color="#CE93D8"
        displayVal={`${clutch.toFixed(0)}%`}
      />

      {/* Steering — bidirectional */}
      <div className="input-row">
        <span className="input-label">{t('params.steering')}</span>
        <div className="steer-wrap">
          <div className="steer-center" />
          <div
            className="steer-fill"
            style={{
              left:  steerNorm < 0 ? `${(50 - Math.abs(steerNorm) * 50).toFixed(1)}%` : '50%',
              width: steerFillWidth,
              background: steerNorm < 0 ? '#FFB74D' : '#80CBC4',
            }}
          />
        </div>
        <span className="input-val">{steer.toFixed(0)}°</span>
      </div>

      {/* Gear */}
      <div className="gear-row">
        <span className="input-label">{t('params.gear')}</span>
        <div className="gear-display">
          <div className="gear-pills">
            {GEARS.map(g => (
              <div key={g} className={`gear-pip ${g === gear ? 'active' : ''}`}>
                {g}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
