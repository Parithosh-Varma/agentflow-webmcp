import { useCallback, useState } from 'react';

const PREFIX = 'onboarding_dismissed_';

function loadDismissed(key: string): boolean {
  try { return localStorage.getItem(PREFIX + key) === 'true'; } catch { return false; }
}
function saveDismissed(key: string) {
  try { localStorage.setItem(PREFIX + key, 'true'); } catch {}
}
// Swap these two for API calls if onboarding persists server-side:
// async loadDismissed(key) => fetch(`/api/onboarding/${key}`)
// async saveDismissed(key) => fetch(..., {method:'POST'})

export function useOnboarding() {
  const [, bump] = useState(0);
  const isDismissed = useCallback((key: string) => loadDismissed(key), []);
  const dismissTour = useCallback((key: string) => {
    saveDismissed(key);
    bump((n) => n + 1);
  }, []);
  const resetTour = useCallback((key: string) => {
    try { localStorage.removeItem(PREFIX + key); } catch {}
    bump((n) => n + 1);
  }, []);
  return { isDismissed, dismissTour, resetTour };
}
