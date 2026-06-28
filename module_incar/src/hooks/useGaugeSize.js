import { useState, useEffect } from 'react';

export function useGaugeSize() {
  const [sizes, setSizes] = useState(calcSizes());

  function calcSizes() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const base = Math.min(w, h);
    return {
      small: Math.round(base * 0.26),
      large: Math.round(base * 0.44),
      logoW: Math.round(base * 0.12),
    };
  }

  useEffect(() => {
    function onResize() { setSizes(calcSizes()); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return sizes;
}
