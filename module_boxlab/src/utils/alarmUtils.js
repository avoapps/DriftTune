export function getAlarmColor(severity) {
  if (severity === 'CRITICAL') return '#ff4444';
  if (severity === 'WARNING')  return '#FFB800';
  return '#6B6B7E';
}

export function formatAlarm(alarm) {
  return {
    ...alarm,
    color: getAlarmColor(alarm.severity),
    label: `${alarm.parameter.toUpperCase()} — ${Number(alarm.value).toFixed(1)}`,
  };
}
