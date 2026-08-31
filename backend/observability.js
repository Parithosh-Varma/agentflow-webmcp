const pino = require('pino');

// Sentry optional — only if SENTRY_DSN is set
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
    console.log('[observability] Sentry enabled');
  } catch (e) { console.warn('[observability] Sentry init failed', e.message); }
}

function getLogger() {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
    // In prod, ship to Loki via pino-loki if LOKI_URL is set
    transport: process.env.LOKI_URL ? {
      target: 'pino-loki',
      options: { host: process.env.LOKI_URL, labels: { app: 'agentflow' } }
    } : undefined,
  });
}

// Prometheus-style metrics already in backend/index.js, expose helper to add custom metrics
function recordMetric(name, value, labels = {}) {
  // No-op for now, could push to Prometheus pushgateway
  if (Sentry) Sentry.metrics?.increment?.(name, value, { tags: labels });
}

module.exports = { getLogger, Sentry, recordMetric };
