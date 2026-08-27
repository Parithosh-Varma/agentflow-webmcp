import { useEffect, useState } from 'react';
import './OnboardingTour.css';

export interface TourStep {
  target: string; // data-tour attribute
  title: string;
  description: string;
  position: 'left' | 'right' | 'center';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'sidebar',
    title: 'Control Panel',
    description: 'Add modules, search the library, and configure nodes. Drag or click to place on canvas.',
    position: 'right',
  },
  {
    target: 'canvas',
    title: 'Workspace / Canvas',
    description: 'Your visual workflow lives here. Connect modules with wires, drag to rearrange — the canvas auto-fits every change.',
    position: 'center',
  },
  {
    target: 'run',
    title: 'Run & Inspect',
    description: 'Validate and execute the workflow. Watch live status LEDs, then inspect outputs and telemetry.',
    position: 'left',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingTour({ open, onClose, onComplete }: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(i + 1, TOUR_STEPS.length - 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Apply highlight ring to active target
  useEffect(() => {
    if (!open) return;
    const step = TOUR_STEPS[idx];
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) el.classList.add('tour-highlight');
    return () => {
      if (el) el.classList.remove('tour-highlight');
    };
  }, [open, idx]);

  if (!open) return null;

  const step = TOUR_STEPS[idx];
  const isLast = idx === TOUR_STEPS.length - 1;
  const isFirst = idx === 0;

  return (
    <div className="tour-backdrop" onClick={onClose}>
      <div className="tour-overlay" aria-hidden="true" />

      <div className={`tour-card tour-${step.position}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="tour-card-kicker">Step {idx + 1} of {TOUR_STEPS.length} — Feature Tour</div>
        <h3 className="tour-card-title">{step.title}</h3>
        <p className="tour-card-desc">{step.description}</p>

        <div className="tour-dots">
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className={`tour-dot ${i === idx ? 'active' : ''} ${i < idx ? 'done' : ''}`} />
          ))}
        </div>

        <div className="tour-actions">
          <button className="tour-skip" onClick={onClose}>Skip tour</button>
          <div className="tour-actions-right">
            {!isFirst && (
              <button className="tour-btn-secondary" onClick={() => setIdx((i) => i - 1)}>Back</button>
            )}
            {!isLast ? (
              <button className="tour-btn-primary" onClick={() => setIdx((i) => i + 1)}>Next</button>
            ) : (
              <button className="tour-btn-primary tour-btn-cta" onClick={onComplete}>Finish</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ONBOARDING_TOUR_STEPS = TOUR_STEPS;
