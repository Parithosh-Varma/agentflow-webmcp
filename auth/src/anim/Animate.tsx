// Drop-in reveal animation for React surfaces.
// Usage: <Animate variant="fade-up" delay={120}>…</Animate>
// Safe without JS/IntersectionObserver (content shows) and honors
// prefers-reduced-motion via anim.css.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './anim.css';

export type AnimVariant = 'fade-up' | 'fade-in' | 'scale-in';

export function animClass(variant: AnimVariant = 'fade-up'): string {
  return `af-anim af-${variant}`;
}

export function animStyle(delayMs = 0, durationMs?: number): CSSProperties {
  const style = { '--af-delay': `${Math.max(0, delayMs)}ms` } as CSSProperties;
  if (durationMs !== undefined && durationMs > 0) {
    (style as Record<string, string>)['--af-duration'] = `${durationMs}ms`;
  }
  return style;
}

function reduceMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface AnimateProps {
  children: ReactNode;
  variant?: AnimVariant;
  /** stagger/delay before playing, ms */
  delay?: number;
  /** play duration, ms */
  duration?: number;
  /** replay every time it re-enters the viewport (default: play once) */
  repeat?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'span' | 'section';
}

export function Animate({
  children,
  variant = 'fade-up',
  delay = 0,
  duration,
  repeat = false,
  className = '',
  style,
  as = 'div',
}: AnimateProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (typeof IntersectionObserver === 'undefined' || reduceMotion()) return true;
    return false;
  });

  useEffect(() => {
    try {
      document.documentElement.classList.add('af-js');
    } catch {}
    if (inView && !repeat) return;
    if (typeof IntersectionObserver === 'undefined' || reduceMotion()) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (!repeat) io.disconnect();
          } else if (repeat) {
            setInView(false);
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, repeat]);

  const Tag = as as 'div';
  return (
    <Tag
      ref={ref}
      className={`${animClass(variant)}${inView ? ' af-in' : ''}${className ? ` ${className}` : ''}`}
      style={{ ...animStyle(delay, duration), ...style }}
    >
      {children}
    </Tag>
  );
}
