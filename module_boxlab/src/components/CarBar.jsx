import React from 'react';
import { formatLapTime } from '../utils/formatters';

export default function CarBar({ t, cars, selectedCar, setSelectedCar, data }) {
  const lapNumber  = data?.lap_number  ?? '—';
  const lapTime    = formatLapTime(data?.lap_time);
  const sessionId  = data?.raw?.session_id ?? '—';

  return (
    <div className="carbar">
      <div className="car-pills">
        {cars.map(car => (
          <button
            key={car}
            className={`car-pill ${selectedCar === car ? 'selected' : ''}`}
            onClick={() => setSelectedCar(car)}
          >
            <div className="car-pill-dot" />
            {car}
          </button>
        ))}
      </div>

      <div className="carbar-sep" />

      <div className="carbar-info">
        <div className="carbar-stat">
          <span className="carbar-stat-label">{t('ui.lap')}</span>
          <span className="carbar-stat-value">{lapNumber}</span>
        </div>
        <div className="carbar-stat">
          <span className="carbar-stat-label">{t('params.lap_time')}</span>
          <span className="carbar-stat-value">{lapTime}</span>
        </div>
        <div className="carbar-stat">
          <span className="carbar-stat-label">{t('params.track_sector')}</span>
          <span className="carbar-stat-value">{data?.track_sector ?? '—'}</span>
        </div>
      </div>

      <span className="session-id">{t('ui.session')}: {sessionId}</span>
    </div>
  );
}
