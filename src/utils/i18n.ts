import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import middleware from 'i18next-http-middleware';
import path from 'path';

export const initI18n = async () => {
  await i18next
    .use(Backend)
    .use(middleware.LanguageDetector)
    .init({
      fallbackLng: 'en',
      preload: ['en', 'ar'], // preload both languages
      backend: {
        loadPath: path.join(__dirname, '../locales/{{lng}}.json'),
      },
      detection: {
        order: ['header', 'querystring', 'cookie'],
        caches: false,
      },
      debug: false,
    });

  return middleware.handle(i18next);
};
