import { useState, useEffect } from 'react';
import { CloseIcon } from './icons';
import './ChallengeBanner.css';

const CHALLENGE_IMG = 'https://d112y698adiu2z.cloudfront.net/photos/production/challenge_photos/005/137/486/datas/full_width.png';
const DISMISS_KEY = 'agentflow_challenge_banner_dismissed_v1';

interface Props {
  variant?: 'banner' | 'card' | 'hero';
}

export function ChallengeBanner({ variant = 'banner' }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === 'true') { setDismissed(true); return; }
    const t = setTimeout(() => handleDismiss(), 10000);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  if (variant === 'card') {
    return (
      <div className="challenge-card">
        <div className="challenge-card-header">
          <span className="challenge-card-kicker">Featured Challenge</span>
          <button className="challenge-card-close" onClick={handleDismiss} aria-label="Dismiss"><CloseIcon size={12} /></button>
        </div>
        <div className="challenge-card-img-wrap" onClick={() => setExpanded(!expanded)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }} title={expanded ? 'Collapse' : 'Expand'}>
          <img src={CHALLENGE_IMG} alt="Challenge banner" className="challenge-card-img" loading="lazy" />
          <span className="challenge-card-expand">{expanded ? 'Collapse' : 'Expand'}</span>
        </div>
        {expanded && (
          <div className="challenge-card-expanded">
            <img src={CHALLENGE_IMG} alt="Challenge banner full width" className="challenge-card-img-full" loading="lazy" />
          </div>
        )}
      </div>
    );
  }

  // hero / banner — full-width, centered, not small thumbnail
  return (
    <div className="challenge-hero" role="banner">
      <div className="challenge-hero-inner">
        <div className="challenge-hero-label">
          <span className="challenge-hero-kicker">Hackathon Challenge</span>
          <span className="challenge-hero-title">AgentFlow × WebMCP — Build human × agent workflows</span>
        </div>
        <a href={CHALLENGE_IMG} target="_blank" rel="noreferrer" className="challenge-hero-img-link" title="View full image">
          <img src={CHALLENGE_IMG} alt="Challenge — AgentFlow WebMCP hackathon" className="challenge-hero-img" loading="eager" />
        </a>
      </div>
    </div>
  );
}

export function resetChallengeBanner() {
  localStorage.removeItem(DISMISS_KEY);
}
