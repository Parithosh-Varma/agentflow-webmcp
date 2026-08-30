import { useEffect, useLayoutEffect, useState } from 'react';
import './onboarding.css';

export type OnboardingStep = {
  id: string;
  target: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
};

function getPlacement(
  targetRect: DOMRect,
  cardW: number,
  cardH: number,
  preferred: OnboardingStep['placement'] = 'bottom'
): OnboardingStep['placement'] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Large target (canvas) — center instead of side
  if (targetRect.width > 500 || targetRect.height > 400) return 'bottom';
  const space = {
    top: targetRect.top,
    bottom: vh - targetRect.bottom,
    left: targetRect.left,
    right: vw - targetRect.right,
  };
  const needs = { top: cardH + 16, bottom: cardH + 16, left: cardW + 16, right: cardW + 16 };
  // Prefer fitting side
  if (space[preferred] >= needs[preferred]) return preferred;
  const fitting = (Object.keys(space) as Array<keyof typeof space>).filter((k) => space[k] >= needs[k]);
  if (fitting.length) {
    fitting.sort((a, b) => space[b] - space[a]);
    return fitting[0] as OnboardingStep['placement'];
  }
  // No side fits — default to bottom (will be clamped)
  return 'bottom';
}

export function TourOverlay({
  steps,
  onComplete,
  onSkip,
}: {
  steps: OnboardingStep[];
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [placement, setPlacement] = useState<OnboardingStep['placement']>('bottom');

  const step = steps[idx];

  const measure = () => {
    const el = document.querySelector(`[data-onboarding="${step.target}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect(r);
    // estimate card size 320x140 for placement flip
    setPlacement(getPlacement(r, 340, 160, step.placement));
  };

  useLayoutEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  }, [idx, step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(steps.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip, steps.length]);

  if (!step) return null;

  const highlightStyle = rect
    ? { left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }
    : { left: '50%', top: '50%', width: 0, height: 0 };

  const cardPos: React.CSSProperties = {};
  if (rect) {
    const gap = 14;
    const cardW = 340;
    const cardH = 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    if (placement === 'bottom') {
      let left = rect.left + rect.width / 2 - cardW / 2;
      let top = rect.bottom + gap;
      left = clamp(left, 12, vw - cardW - 12);
      top = clamp(top, 12, vh - cardH - 12);
      // Large canvas — center in viewport instead of below
      if (rect.width > 500 || rect.height > 400) {
        left = (vw - cardW) / 2;
        top = vh / 2 - cardH / 2;
      }
      cardPos.left = left; cardPos.top = top;
    } else if (placement === 'top') {
      let left = rect.left + rect.width / 2 - cardW / 2;
      let top = rect.top - gap - cardH;
      left = clamp(left, 12, vw - cardW - 12);
      top = clamp(top, 12, vh - cardH - 12);
      cardPos.left = left; cardPos.top = top;
    } else if (placement === 'left') {
      let left = rect.left - gap - cardW;
      let top = rect.top + rect.height / 2 - cardH / 2;
      left = clamp(left, 12, vw - cardW - 12);
      top = clamp(top, 12, vh - cardH - 12);
      cardPos.left = left; cardPos.top = top;
    } else if (placement === 'right') {
      let left = rect.right + gap;
      let top = rect.top + rect.height / 2 - cardH / 2;
      left = clamp(left, 12, vw - cardW - 12);
      top = clamp(top, 12, vh - cardH - 12);
      cardPos.left = left; cardPos.top = top;
    }
  } else {
    cardPos.left = '50%'; cardPos.top = '50%'; (cardPos as any).transform = 'translate(-50%, -50%)';
  }

  const isLast = idx === steps.length - 1;
  const isFirst = idx === 0;

  return (
    <div className="onboarding-root" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      <div className="onboarding-backdrop" onClick={onSkip} />
      {rect && <div className="onboarding-highlight" style={highlightStyle as React.CSSProperties} />}
      <div className="onboarding-card" style={cardPos}>
        <div className="onboarding-card-kicker">Step {idx + 1} / {steps.length}</div>
        <h3 className="onboarding-card-title">{step.title}</h3>
        <p className="onboarding-card-body">{step.body}</p>
        <div className="onboarding-card-actions">
          <button className="onboarding-btn-ghost" onClick={onSkip}>Skip</button>
          <div className="onboarding-card-nav">
            {!isFirst && <button className="onboarding-btn-secondary" onClick={() => setIdx((i) => i - 1)}>Back</button>}
            {!isLast ? <button className="onboarding-btn-primary" onClick={() => setIdx((i) => i + 1)}>Next</button>
              : <button className="onboarding-btn-primary" onClick={onComplete}>Done</button>}
          </div>
        </div>
        <div className="onboarding-dots" aria-hidden="true">
          {steps.map((_, i) => <span key={i} className={`onboarding-dot ${i === idx ? 'active' : ''} ${i < idx ? 'done' : ''}`} />)}
        </div>
      </div>
    </div>
  );
}
