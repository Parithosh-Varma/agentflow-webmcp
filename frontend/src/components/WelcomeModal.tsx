import { useState, useEffect } from 'react';
import { BoltIcon, DiamondIcon, HexagonIcon } from './icons';
import './WelcomeModal.css';

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const STEPS = [
  {
    title: 'Welcome to AgentFlow',
    subtitle: 'Visual workflow builder where humans and AI agents co-create automation pipelines via WebMCP.',
    detail: 'Design, wire, and run workflows on a shared canvas — no code required to start.',
    icon: <DiamondIcon size={28} />,
  },
  {
    title: 'Three panels, one flow',
    subtitle: 'Your workspace is split for speed: build left, visualize center, execute right.',
    detail: null,
    icon: <HexagonIcon size={28} />,
  },
  {
    title: 'You are ready to build',
    subtitle: 'Add modules, connect wires, hit RUN — or let your agent do it for you.',
    detail: 'Tip: Click load example flow to see AgentFlow in action instantly.',
    icon: <BoltIcon size={24} />,
  },
];

export function WelcomeModal({ open, onClose, onComplete }: WelcomeModalProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && step < STEPS.length - 1) setStep((s) => s + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep((s) => s - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step, onClose]);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="ob-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Welcome to AgentFlow">
      <div className="ob-modal" onClick={(e) => e.stopPropagation()}>
        <button className="ob-close" onClick={onClose} aria-label="Close onboarding">×</button>

        <div className="ob-icon">{current.icon}</div>

        <h2 className="ob-title">{current.title}</h2>
        <p className="ob-subtitle">{current.subtitle}</p>

        {step === 1 && (
          <div className="ob-feature-grid">
            <div className="ob-feature">
              <span className="ob-feature-kicker">01 — Control Panel</span>
              <span className="ob-feature-label">Sidebar</span>
              <span className="ob-feature-desc">Add modules, search, and manage canvas nodes</span>
            </div>
            <div className="ob-feature">
              <span className="ob-feature-kicker">02 — Workspace</span>
              <span className="ob-feature-label">Canvas</span>
              <span className="ob-feature-desc">Visualize and wire your workflow</span>
            </div>
            <div className="ob-feature">
              <span className="ob-feature-kicker">03 — Execution</span>
              <span className="ob-feature-label">Run Panel</span>
              <span className="ob-feature-desc">Validate, run, and inspect outputs</span>
            </div>
          </div>
        )}

        {current.detail && <p className="ob-detail">{current.detail}</p>}

        <div className="ob-progress">
          <span className="ob-step-label">Step {step + 1} of {STEPS.length}</span>
          <div className="ob-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`ob-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
            ))}
          </div>
        </div>

        <div className="ob-actions">
          <button className="ob-btn-ghost" onClick={onClose}>Skip</button>
          <div className="ob-actions-right">
            {!isFirst && (
              <button className="ob-btn-secondary" onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            )}
            {!isLast ? (
              <button className="ob-btn-primary" onClick={() => setStep((s) => s + 1)}>
                Next
              </button>
            ) : (
              <button className="ob-btn-primary ob-btn-cta" onClick={onComplete}>
                Get Started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
