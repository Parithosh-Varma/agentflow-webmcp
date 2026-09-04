import { useLayoutEffect, useState } from 'react';
import './onboarding.css';

export function Tooltip({
  target,
  title,
  body,
  onDismiss,
}: {
  target?: string | null;
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  useLayoutEffect(() => {
    if (!target) return;
    setMissing(false);
    const query = () => {
      const el = document.querySelector(`[data-onboarding="${target}"]`) as HTMLElement | null;
      if (el) { setRect(el.getBoundingClientRect()); setMissing(false); return true; }
      return false;
    };
    if (query()) { /* found immediately */ }
    const onReposition = () => { query(); };
    window.addEventListener('resize', onReposition);
    // Scroll moves the target — resize alone leaves the card stale.
    window.addEventListener('scroll', onReposition, true);
    // Target may mount after this tooltip (canvas lazy-load): retry briefly
    // instead of silently never showing.
    let retries = 0;
    const retry = setInterval(() => {
      if (query() || ++retries >= 10) {
        clearInterval(retry);
        if (retries >= 10) setMissing(true);
      }
    }, 300);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      clearInterval(retry);
    };
  }, [target]);

  if (!target) return null;
  if (missing) return null;
  if (!rect) return null;
  const clampedLeft = Math.max(150, Math.min(window.innerWidth - 150, rect.left + rect.width / 2));
  const clampedTop = Math.max(12, Math.min(window.innerHeight - 120, rect.bottom + 10));
  const style: React.CSSProperties = {
    left: clampedLeft,
    top: clampedTop,
    transform: 'translateX(-50%)',
  };
  return (
    <div className="onboarding-tooltip" style={style} role="tooltip">
      <div className="onboarding-tooltip-title">{title}</div>
      <div className="onboarding-tooltip-body">{body}</div>
      <button className="onboarding-btn-ghost" onClick={onDismiss}>Got it</button>
    </div>
  );
}
