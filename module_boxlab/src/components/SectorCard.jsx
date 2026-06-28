import React from 'react';

const SECTORS = ['S1', 'S2', 'S3', 'S4', 'S5'];

export default function SectorCard({ data, t }) {
  const current = data?.track_sector ?? '';

  return (
    <div className="card">
      <div className="card-title">{t('params.track_sector')}</div>
      <div className="sector-list">
        {SECTORS.map(s => (
          <div key={s} className={`sector-pill ${s === current ? 'active' : ''}`}>
            <span className="sector-pill-name">{s}</span>
            <span className="sector-pill-label">{t(`sectors.${s}`)}</span>
            <div className="sector-indicator" />
          </div>
        ))}
      </div>
    </div>
  );
}
