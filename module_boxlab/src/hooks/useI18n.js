import en from '../locales/en.json';
import sl from '../locales/sl.json';

const LOCALES = { en, sl };

export default function useI18n(lang = 'en') {
  const translations = LOCALES[lang] || LOCALES.en;

  const t = (key) => {
    const parts = key.split('.');
    let val = translations;
    for (const k of parts) {
      val = val?.[k];
      if (val === undefined) return key;
    }
    return typeof val === 'string' ? val : key;
  };

  return { t };
}
