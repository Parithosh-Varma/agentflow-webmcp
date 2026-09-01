let Sentry: any = null;
export function initObservability() {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN;
  if (!dsn) return;
  // @ts-ignore — vite-ignore lets dynamic imports be skipped when package is missing
  import(/* @vite-ignore */ '@sentry/react').then((mod: any) => {
    Sentry = mod;
    Sentry.init({ dsn, tracesSampleRate: 0.1, environment: (import.meta as any).env?.MODE || 'production' });
    console.log('[observability] Sentry enabled');
  }).catch((e: any) => console.warn('[observability] Sentry failed', e));
}
export function captureError(err: any, ctx?: any) {
  if (Sentry) Sentry.captureException(err, { extra: ctx });
  else console.error('[observability]', err, ctx);
}
