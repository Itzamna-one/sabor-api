import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry() {
  if (initialized || !process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'production',
    tracesSampleRate: 0.1,
  });
  initialized = true;
}

export function captureException(err, context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(err);
    });
  }
  // Always log to console so Vercel function logs capture it regardless
  console.error('[ERROR]', err?.message || err, context);
}
