import { useState } from 'react';
import { CheckIcon, EmptyIcon } from '../components/icons';
import './onboarding.css';

export type ChecklistItem = { id: string; label: string; done: boolean; onClick?: () => void };

export function Checklist({ items, title = 'Get started' }: { items: ChecklistItem[]; title?: string }) {
  const [open, setOpen] = useState(true);
  const done = items.filter((i) => i.done).length;
  return (
    <div className="onboarding-checklist">
      <button className="onboarding-checklist-header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{title}</span>
        <span className="onboarding-checklist-count">{done}/{items.length}</span>
        <span className="onboarding-checklist-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="onboarding-checklist-list">
          {items.map((it) => (
            <li key={it.id} className={`onboarding-checklist-item ${it.done ? 'done' : ''}`}>
              <span className="onboarding-checklist-icon">{it.done ? <CheckIcon size={12} /> : <EmptyIcon size={12} />}</span>
              <span className="onboarding-checklist-label">{it.label}</span>
              {!it.done && it.onClick && <button className="onboarding-btn-ghost" onClick={it.onClick}>Go</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
