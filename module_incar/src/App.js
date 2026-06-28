import './styles.css';
import { useTelemetry } from './hooks/useTelemetry';
import RPMBar from './components/RPMBar';
import BigNumbers from './components/BigNumbers';
import InputBars from './components/InputBars';
import StatusRow from './components/StatusRow';
import AlarmBanner from './components/AlarmBanner';

export default function App() {
  const { data, status } = useTelemetry();

  return (
    <div className="app">
      <RPMBar rpm={data.raw.rpm} />
      <BigNumbers data={data} />
      <InputBars data={data} />
      <StatusRow data={data} status={status} />
      {data.alarms && data.alarms.length > 0 && (
        <AlarmBanner alarms={data.alarms} />
      )}
    </div>
  );
}
