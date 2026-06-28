import React from 'react';

export default function Footer({ t, data, connected, connState, lastUpdate, hz }) {
  const sessionId = data?.raw?.session_id ?? '—';
  const ts = lastUpdate
    ? new Date(lastUpdate).toISOString().replace('T', ' ').slice(0, 23)
    : '—';
  const state = connState || 'disconnected';

  const stateLabel = {
    connected:    t('live'),
    reconnecting: t('connecting'),
    disconnected: 'SIM',
  }[state] || 'SIM';

  return (
    <footer className="footer">
      <div className="footer-item">
        <div className={`footer-dot ${state}`} />
        {stateLabel}
      </div>

      <div className="footer-item">
        {hz} Hz
      </div>

      <div className="footer-item">
        {t('ui.session')}: {sessionId}
      </div>

      <div className="footer-spacer" />

      <div className="footer-ts">{ts}</div>
    </footer>
  );
}
