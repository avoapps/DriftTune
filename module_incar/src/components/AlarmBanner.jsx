import { useState, useEffect } from 'react';

export default function AlarmBanner({ alarms }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const t = setInterval(() => setVisible(v => !v), 600);
    return () => clearInterval(t);
  }, [alarms.length]);

  if (!alarms || alarms.length === 0) return null;

  const top = alarms.find(a => a.severity === 'CRITICAL') || alarms[0];
  const color = top.severity === 'CRITICAL' ? '#CC1111' : '#FFB800';

  return (
    <div className="alarm-banner" style={{
      background: visible ? color : 'transparent',
      borderColor: color,
      color: visible ? '#fff' : color,
    }}>
      ⚠ {top.message.toUpperCase()}
    </div>
  );
}
