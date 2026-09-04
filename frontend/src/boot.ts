// Boot splash dismissal — hides the inline index.html splash as soon as the
// app is ready, with a short minimum display so the brand registers.
// Pure timing helper is unit-tested; DOM work is idempotent (StrictMode-safe).

export const BOOT_MIN_MS = 700;
export const BOOT_FADE_MS = 350;

/** How much longer to wait given elapsed ms since navigation start. */
export function bootRemainingMs(elapsedMs: number, minMs: number = BOOT_MIN_MS): number {
  return Math.max(0, minMs - Math.max(0, elapsedMs));
}

export function dismissBootSplash(now: number = Date.now()): void {
  try {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('boot-splash');
    if (!el) return;
    const navStart = (() => {
      try {
        return performance?.timeOrigin ?? now;
      } catch {
        return now;
      }
    })();
    const wait = bootRemainingMs(now - navStart);
    window.setTimeout(() => {
      try {
        el.classList.add('boot-done');
        window.setTimeout(() => {
          try {
            el.remove();
            sessionStorage.setItem('af_boot_seen', '1');
          } catch {}
        }, BOOT_FADE_MS);
      } catch {}
    }, wait);
  } catch {}
}
