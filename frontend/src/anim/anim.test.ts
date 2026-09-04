import { describe, it, expect } from 'vitest';
import { animClass, animStyle } from './Animate';

describe('anim helpers', () => {
  it('maps variants to classes', () => {
    expect(animClass()).toBe('af-anim af-fade-up');
    expect(animClass('fade-in')).toBe('af-anim af-fade-in');
    expect(animClass('scale-in')).toBe('af-anim af-scale-in');
  });
  it('builds delay/duration custom props', () => {
    expect(animStyle(120)).toMatchObject({ '--af-delay': '120ms' });
    expect(animStyle(0, 900)).toMatchObject({ '--af-delay': '0ms', '--af-duration': '900ms' });
    expect(animStyle(-5)).toMatchObject({ '--af-delay': '0ms' });
  });
});
