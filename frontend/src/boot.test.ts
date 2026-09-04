import { describe, it, expect } from 'vitest';
import { bootRemainingMs, BOOT_MIN_MS } from './boot';

describe('boot splash timing', () => {
  it('waits out the minimum display', () => {
    expect(bootRemainingMs(0)).toBe(BOOT_MIN_MS);
    expect(bootRemainingMs(200)).toBe(BOOT_MIN_MS - 200);
  });
  it('never waits once past the minimum', () => {
    expect(bootRemainingMs(BOOT_MIN_MS)).toBe(0);
    expect(bootRemainingMs(BOOT_MIN_MS + 5000)).toBe(0);
  });
  it('clamps negative elapsed', () => {
    expect(bootRemainingMs(-100)).toBe(BOOT_MIN_MS);
  });
});
