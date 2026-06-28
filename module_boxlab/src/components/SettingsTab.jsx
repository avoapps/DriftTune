import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'drifttune_settings';

const DEFAULT_SETTINGS = {
  wsHost:   'localhost',
  wsPort:   '8765',
  lang:     'en',
  thresholds: {
    h2o:       { warning: 100, critical: 110 },
    oil_temp:  { warning: 120, critical: 135 },
    oil_press: { warning: 1.5, critical: 1.0 },
    egt:       { warning: 800, critical: 950 },
    knock:     { warning: 30,  critical: 60  },
    battery:   { warning: 11.5,critical: 10.5},
    boost:     { warning: 2.0, critical: 2.4 },
  },
  cars: [
    { id: 'CAR_01', name: 'Car 1', color: '#CC1111' },
    { id: 'CAR_02', name: 'Car 2', color: '#4FC3F7' },
  ],
};

function loadSettings() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'sl', label: 'Slovenščina' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'hr', label: 'Hrvatski' },
];

const THRESHOLD_LABELS = {
  h2o:       { label: 'Coolant Temp',   unit: '°C',  dir: 'high' },
  oil_temp:  { label: 'Oil Temp',       unit: '°C',  dir: 'high' },
  oil_press: { label: 'Oil Pressure',   unit: 'bar', dir: 'low'  },
  egt:       { label: 'Exhaust Temp',   unit: '°C',  dir: 'high' },
  knock:     { label: 'Knock Level',    unit: '',    dir: 'high' },
  battery:   { label: 'Battery',        unit: 'V',   dir: 'low'  },
  boost:     { label: 'Boost',          unit: 'bar', dir: 'high' },
};

const CAR_COLORS = ['#CC1111','#4FC3F7','#00C853','#FFB74D','#CE93D8','#80CBC4','#C9A84C','#FF6B6B'];

export default function SettingsTab({ t, lang, setLang }) {
  const [settings, setSettings] = useState(loadSettings);
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState('connection');

  function update(path, value) {
    setSettings(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = next;
      keys.slice(0, -1).forEach(k => { obj = obj[k]; });
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }

  function handleSave() {
    saveSettings(settings);
    if (settings.lang !== lang) setLang(settings.lang);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addCar() {
    const id = `CAR_0${settings.cars.length + 1}`;
    update('cars', [...settings.cars, { id, name: `Car ${settings.cars.length + 1}`, color: CAR_COLORS[settings.cars.length % CAR_COLORS.length] }]);
  }

  function removeCar(idx) {
    update('cars', settings.cars.filter((_, i) => i !== idx));
  }

  const sections = [
    { id: 'connection', label: 'Connection' },
    { id: 'language',   label: 'Language' },
    { id: 'thresholds', label: 'Alarm Thresholds' },
    { id: 'cars',       label: 'Car Management' },
  ];

  return (
    <div className="settings-tab">
      <div className="analysis-nav">
        {sections.map(s => (
          <button key={s.id} className={`analysis-nav-btn ${section === s.id ? 'active' : ''}`}
            onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
      </div>

      <div className="settings-content">

        {/* ── Connection ── */}
        {section === 'connection' && (
          <div className="settings-section">
            <div className="settings-title">WebSocket Connection</div>
            <div className="settings-desc">Address of the RPi Core Server or LTE Receiver.</div>
            <div className="settings-row">
              <label className="settings-label">Host / IP</label>
              <input className="settings-input" value={settings.wsHost}
                onChange={e => update('wsHost', e.target.value)}
                placeholder="localhost or 192.168.1.100" />
            </div>
            <div className="settings-row">
              <label className="settings-label">Port</label>
              <input className="settings-input" value={settings.wsPort}
                onChange={e => update('wsPort', e.target.value)}
                placeholder="8765" style={{ maxWidth: 120 }} />
            </div>
            <div className="settings-ws-preview">
              ws://{settings.wsHost}:{settings.wsPort}/ws/telemetry/CAR_01
            </div>
          </div>
        )}

        {/* ── Language ── */}
        {section === 'language' && (
          <div className="settings-section">
            <div className="settings-title">Interface Language</div>
            <div className="lang-grid">
              {LANGS.map(l => (
                <button key={l.code}
                  className={`lang-card ${settings.lang === l.code ? 'active' : ''}`}
                  onClick={() => update('lang', l.code)}>
                  <span className="lang-card-code">{l.code.toUpperCase()}</span>
                  <span className="lang-card-name">{l.label}</span>
                  {l.code !== 'en' && l.code !== 'sl' &&
                    <span className="lang-card-badge">Coming soon</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Thresholds ── */}
        {section === 'thresholds' && (
          <div className="settings-section">
            <div className="settings-title">Alarm Thresholds</div>
            <div className="settings-desc">Values trigger WARNING and CRITICAL alarms in the dashboard.</div>
            <table className="threshold-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Unit</th>
                  <th>Direction</th>
                  <th style={{ color: 'var(--warning)' }}>Warning</th>
                  <th style={{ color: 'var(--accent)' }}>Critical</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(THRESHOLD_LABELS).map(([key, meta]) => (
                  <tr key={key}>
                    <td className="thresh-label">{meta.label}</td>
                    <td className="thresh-unit">{meta.unit}</td>
                    <td><span className={`thresh-dir ${meta.dir}`}>{meta.dir === 'high' ? '↑ HIGH' : '↓ LOW'}</span></td>
                    <td>
                      <input type="number" className="thresh-input warn"
                        value={settings.thresholds[key]?.warning ?? ''}
                        onChange={e => update(`thresholds.${key}.warning`, parseFloat(e.target.value))} />
                    </td>
                    <td>
                      <input type="number" className="thresh-input crit"
                        value={settings.thresholds[key]?.critical ?? ''}
                        onChange={e => update(`thresholds.${key}.critical`, parseFloat(e.target.value))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Car Management ── */}
        {section === 'cars' && (
          <div className="settings-section">
            <div className="settings-title">Car Management</div>
            <div className="settings-desc">Add, rename or remove cars. Car ID must match the WebSocket channel.</div>
            <div className="car-list">
              {settings.cars.map((car, idx) => (
                <div key={idx} className="car-item">
                  <div className="car-color-dot" style={{ background: car.color }} />
                  <input className="settings-input car-id-input" value={car.id}
                    onChange={e => update(`cars.${idx}.id`, e.target.value)}
                    placeholder="CAR_01" />
                  <input className="settings-input car-name-input" value={car.name}
                    onChange={e => update(`cars.${idx}.name`, e.target.value)}
                    placeholder="Car name" />
                  <div className="car-color-picker">
                    {CAR_COLORS.map(c => (
                      <div key={c} className={`color-swatch ${car.color === c ? 'active' : ''}`}
                        style={{ background: c }}
                        onClick={() => update(`cars.${idx}.color`, c)} />
                    ))}
                  </div>
                  {settings.cars.length > 1 &&
                    <button className="car-remove-btn" onClick={() => removeCar(idx)}>✕</button>}
                </div>
              ))}
              <button className="add-car-btn" onClick={addCar}>+ Add Car</button>
            </div>
          </div>
        )}

        <button className={`settings-save-btn ${saved ? 'saved' : ''}`} onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
