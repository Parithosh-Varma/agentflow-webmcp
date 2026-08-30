import { useLayoutEffect, useState } from 'react';
import './onboarding.css';

export function Tooltip({
  target,
  title,
  body,
  onDismiss,
}: {
  target: string;
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = document.querySelector(`[data-onboarding="${target}"]`) as HTMLElement | null;
    if (el) setRect(el.getBoundingClientRect());
    const onResize = () => {
      const e = document.querySelector(`[data-onboarding="${target}"]`) as HTMLElement | null;
      if (e) setRect(e.getBoundingClientRect());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [target]);

  if (!rect) return null;
  const style: React.CSSProperties = {
    left: rect.left + rect.width / 2,
    top: rect.bottom + 10,
    transform: 'translateX(-50%)',
  };
  return (
    <div className="onboarding-tooltip" style={style} role="note">
      <div className="onboarding-tooltip-title">{title}</div>
      <div className="onboarding-tooltip-body">{body}</div>
      <button className="onboarding-btn-ghost" onClick={onDismiss}>Got it</button>
    </div>
  );
}
