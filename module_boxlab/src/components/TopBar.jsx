import React from 'react';

const TABS = ['dashboard', 'analysis', 'settings'];
const LANGS = ['en', 'sl'];

export default function TopBar({ t, lang, setLang, activeTab, setActiveTab, connState }) {
  const state = connState || 'disconnected';

  const badgeLabel = {
    connected:    t('live'),
    reconnecting: t('connecting'),
    disconnected: 'SIM',
  }[state] || 'SIM';

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <div className="logo-mark">DT</div>
        <div>
          <div className="logo-text">{t('app_name')}</div>
          <div className="logo-sub">InoCore Performance</div>
        </div>
      </div>

      <div className={`live-badge ${state}`}>
        <div className="live-dot" />
        {badgeLabel}
      </div>

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
