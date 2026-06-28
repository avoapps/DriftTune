import React from 'react';

const TABS = ['dashboard', 'analysis', 'obd', 'settings'];
const LANGS = ['en', 'sl'];

export default function TopBar({ t, lang, setLang, activeTab, setActiveTab, connState, connConfig, onConnect, onDisconnect }) {
  const state = connState || 'off';

  const badgeLabel = {
    connected:    t('live'),
    connecting:   t('connecting'),
    reconnecting: t('connecting'),
    simulator:    'SIM',
    disconnected: 'OFF',
    off:          'OFF',
  }[state] || 'OFF';

  const badgeState = ['connected', 'simulator', 'connecting', 'reconnecting', 'disconnected', 'off']
    .includes(state) ? (state === 'off' ? 'disconnected' : state) : 'disconnected';

  const isActive = state === 'connected' || state === 'simulator';
  const isConnecting = state === 'connecting' || state === 'reconnecting';

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <img src="/logo.png" alt="InoCore Performance Motorsport" className="topbar-logo-img" />
      </div>

      <div className={`live-badge ${badgeState}`}>
        <div className="live-dot" />
        {badgeLabel}
      </div>

      {/* Quick connect/disconnect */}
      {isActive ? (
        <button className="topbar-conn-btn disconnect" onClick={onDisconnect}>
          ⏹ Disconnect
        </button>
      ) : (
        <button className="topbar-conn-btn connect" onClick={onConnect} disabled={isConnecting}>
          {isConnecting ? 'Connecting…' : (connConfig?.mode === 'simulator' || connConfig?.mode === 'off' ? '▶ Simulator' : '▶ Connect')}
        </button>
      )}

      <nav className="topbar-nav">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`ui.${tab}`)}
          </button>
        ))}
      </nav>

      <div className="lang-switcher">
        {LANGS.map(l => (
          <button
            key={l}
            className={`lang-btn ${lang === l ? 'active' : ''}`}
            onClick={() => setLang(l)}
          >
            {l}
          </button>
        ))}
      </div>
    </header>
  );
}
