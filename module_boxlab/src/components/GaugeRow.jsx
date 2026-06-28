import React from 'react';
import GaugeCard from './GaugeCard';

const GAUGES = [
  { param: 'rpm',         unit: 'rpm'   },
  { param: 'spd',         unit: 'km/h'  },
  { param: 'drift_angle', unit: '°'     },
  { param: 'afr',         unit: 'AFR'   },
  { param: 'boost',       unit: 'bar'   },
  { param: 'ai_score',    unit: '/10'   },
];

export default function GaugeRow({ data, t }) {
  return (
    <div className="gauge-row">
      {GAUGES.map(({ param, unit }) => {
        /* afr, boost, drift_angle, ai_score come from top-level computed fields;
           rpm and spd come from raw */
        const value = ['afr', 'boost'].includes(param)
          ? data?.raw?.[param]
          : ['drift_angle', 'ai_score'].includes(param)
          ? data?.[param]
          : data?.raw?.[param];

        return <GaugeCard key={param} param={param} value={value} unit={unit} t={t} />;
      })}
    </div>
  );
}
