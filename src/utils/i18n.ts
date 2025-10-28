import i18next from 'i18next';
import middleware from 'i18next-http-middleware';
import en from '../locales/en.json';
import ar from '../locales/ar.json';

export const initI18n = async () => {
  await i18next
    .use(middleware.LanguageDetector)
    .init({
      fallbackLng: 'en',
      preload: ['en', 'ar'], // preload both languages
      resources: {
        en: { translation: en },
        ar: { translation: ar },
      },
      detection: {
        order: ['header', 'querystring', 'cookie'],
        caches: false,
      },
      debug: false,
    });

  return middleware.handle(i18next);
};
