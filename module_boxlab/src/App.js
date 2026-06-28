import React, { useState } from 'react';
import TopBar from './components/TopBar';
import CarBar from './components/CarBar';
import GaugeRow from './components/GaugeRow';
import DriverInputs from './components/DriverInputs';
import TemperaturesCard from './components/TemperaturesCard';
import GForcePlot from './components/GForcePlot';
import SectorCard from './components/SectorCard';
import AlarmsCard from './components/AlarmsCard';
import Footer from './components/Footer';
import AnalysisTab, { recordFrame } from './components/AnalysisTab';
import SettingsTab from './components/SettingsTab';
import OBDScannerTab from './components/OBDScannerTab';
import useTelemetry from './hooks/useTelemetry';
import useI18n from './hooks/useI18n';

const STORAGE_KEY = 'drifttune_settings';

function loadConnConfig() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      // v2: connMode must be explicitly saved — never inherit old 'simulator' default
      const mode = (p._v >= 2 && p.connMode) ? p.connMode : 'off';
      return { mode, wsHost: p.wsHost || 'localhost', wsPort: p.wsPort || '8765' };
    }
  } catch { /* ignore */ }
  return { mode: 'off', wsHost: 'localhost', wsPort: '8765' };
}

const CARS = ['CAR_01', 'CAR_02'];

export default function App() {
  const [lang, setLang] = useState('en');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCar, setSelectedCar] = useState('CAR_01');
  const [connConfig, setConnConfig] = useState(loadConnConfig);

  const { t } = useI18n(lang);
  const { data, connected, connState, lastUpdate, hz } = useTelemetry(selectedCar, connConfig);

  // Record frames for analysis
  React.useEffect(() => { if (data) recordFrame(data); }, [data]);

  function handleConnect() {
    // if mode is 'off', activate last selected mode (default simulator)
    const mode = (!connConfig.mode || connConfig.mode === 'off') ? 'simulator' : connConfig.mode;
    setConnConfig(cfg => ({ ...cfg, mode }));
  }

  function handleDisconnect() {
    setConnConfig(cfg => ({ ...cfg, mode: 'off' }));
  }

  return (
    <div className="app">
      <TopBar
        t={t} lang={lang} setLang={setLang}
        activeTab={activeTab} setActiveTab={setActiveTab}
        connState={connState} connConfig={connConfig}
        onConnect={handleConnect} onDisconnect={handleDisconnect}
      />

      {activeTab === 'dashboard' && (
        <>
          <CarBar t={t} cars={CARS} selectedCar={selectedCar} setSelectedCar={setSelectedCar} data={data} />
          <main className="main-content">
            <GaugeRow t={t} data={data} />
            <div className="cards-row">
              <DriverInputs t={t} data={data} />
              <GForcePlot t={t} data={data} />
              <SectorCard t={t} data={data} />
              <AlarmsCard t={t} data={data} />
            </div>
            <TemperaturesCard t={t} data={data} />
          </main>
          <Footer t={t} data={data} connected={connected} connState={connState} lastUpdate={lastUpdate} hz={hz} />
        </>
      )}

      {activeTab === 'analysis' && (
        <main className="main-content">
          <AnalysisTab t={t} data={data} />
        </main>
      )}

      {activeTab === 'obd' && (
        <main className="main-content obd-full">
          <OBDScannerTab />
        </main>
      )}

      {activeTab === 'settings' && (
        <main className="main-content">
          <SettingsTab t={t} lang={lang} setLang={setLang}
            connConfig={connConfig} setConnConfig={setConnConfig} />
        </main>
      )}
    </div>
  );
}
