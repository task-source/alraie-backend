import * as Sentry from '@sentry/node';

export const initSentry = (dsn?: string) => {
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0, // adjust for production
  });
};
