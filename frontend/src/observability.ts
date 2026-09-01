let Sentry: any = null;
export function initObservability() {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN;
  if (!dsn) return;
  // @vite-ignore — optional dep, don't fail dev/build if not installed
  import(/* @vite-ignore */ '@sentry/react').then(mod => {
    Sentry = mod;
    (Sentry as any).init?.({ dsn, tracesSampleRate: 0.1, environment: (import.meta as any).env?.MODE || 'production' });
    console.log('[observability] Sentry enabled');
  }).catch(e => console.warn('[observability] Sentry not installed or failed', (e as any)?.message || e));
}
export function captureError(err: any, ctx?: any) {
  if (Sentry) Sentry.captureException(err, { extra: ctx });
  else console.error('[observability]', err, ctx);
}
