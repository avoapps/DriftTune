import React from 'react';
import { getAlarmColor as _getAlarmColor } from '../utils/alarmUtils'; // eslint-disable-line no-unused-vars

const ALARM_ICONS = { CRITICAL: '🔴', WARNING: '⚠' };

export default function AlarmsCard({ data, t }) {
  const alarms      = data?.alarms ?? [];
  const driverStyle = data?.driver_style ?? 'HYBRID';

  return (
    <div className="card">
      <div className="card-title">{t('alarms.WARNING')} / {t('alarms.CRITICAL')}</div>

      <div className="alarms-list">
        {alarms.length === 0 ? (
          <div className="no-alarms">
            <span>●</span> OK
          </div>
        ) : (
          alarms.map(alarm => (
            <div key={alarm.alarm_id} className={`alarm-badge ${alarm.severity}`}>
              <span className="alarm-icon">{ALARM_ICONS[alarm.severity]}</span>
              <span className="alarm-param">{alarm.parameter.toUpperCase()}</span>
              <span className="alarm-val">
                {t(`alarms.${alarm.severity}`).charAt(0)} {Number(alarm.value).toFixed(1)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="driver-style-box">
        <div className="driver-style-label">{t('params.driver_style')}</div>
        <div className={`driver-style-value ${driverStyle}`}>
          {t(`driver_styles.${driverStyle}`)}
        </div>
      </div>
    </div>
  );
}
