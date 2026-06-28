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
import useTelemetry from './hooks/useTelemetry';
import useI18n from './hooks/useI18n';

const CARS = ['CAR_01', 'CAR_02'];

export default function App() {
  const [lang, setLang] = useState('en');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCar, setSelectedCar] = useState('CAR_01');

  const { t } = useI18n(lang);
  const { data, connected, connState, lastUpdate, hz } = useTelemetry(selectedCar);

  // Record frames for analysis
  React.useEffect(() => { if (data) recordFrame(data); }, [data]);

  return (
    <div className="app">
      <TopBar
        t={t} lang={lang} setLang={setLang}
        activeTab={activeTab} setActiveTab={setActiveTab}
        connState={connState}
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

      {activeTab === 'settings' && (
        <main className="main-content">
          <SettingsTab t={t} lang={lang} setLang={setLang} />
        </main>
      )}
    </div>
  );
}
