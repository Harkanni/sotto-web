import { describe, expect, it } from 'vitest';
import { dampingRatio, springAt, springDuration, springEasing, springs } from '@/lib/motion/spring';

function peak(config: (typeof springs)[keyof typeof springs]) {
  let max = 0;
  for (let t = 0; t < 2; t += 0.001) max = Math.max(max, springAt(config, t).value);
  return max;
}

describe('springAt', () => {
  it('starts at 0 with the velocity it was given', () => {
    expect(springAt(springs.standard, 0)).toEqual({ value: 0, velocity: 0 });
    expect(springAt(springs.standard, 0, 3).velocity).toBeCloseTo(3, 6);
  });

  it('settles on the target', () => {
    for (const config of Object.values(springs)) {
      const end = springAt(config, 3);
      expect(end.value).toBeCloseTo(1, 4);
      expect(Math.abs(end.velocity)).toBeLessThan(1e-3);
    }
  });

  it('overshoots a little on the standard spring and never on a push', () => {
    expect(peak(springs.standard)).toBeGreaterThan(1.02);
    expect(peak(springs.standard)).toBeLessThan(1.04);
    // A full-width screen must never pass its edge.
    expect(peak(springs.push)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('covers under-, critically and over-damped springs continuously', () => {
    const critical = { stiffness: 400, damping: 40 };
    const near = springAt({ stiffness: 400, damping: 39.999 }, 0.1).value;
    expect(springAt(critical, 0.1).value).toBeCloseTo(near, 3);
    expect(springAt({ stiffness: 400, damping: 40.001 }, 0.1).value).toBeCloseTo(near, 3);
  });
});

describe('damping ratios', () => {
  it('match the design system', () => {
    expect(dampingRatio(springs.standard)).toBeCloseTo(0.75, 2);
    expect(dampingRatio(springs.snappy)).toBeCloseTo(0.85, 2);
    expect(dampingRatio(springs.push)).toBeGreaterThanOrEqual(1);
  });
});

describe('springEasing', () => {
  it('traces the spring as a CSS linear() easing paired with its duration', () => {
    const { easing, duration } = springEasing(springs.standard);
    expect(easing.startsWith('linear(0, ')).toBe(true);
    expect(easing.endsWith(', 1)')).toBe(true);
    expect(duration).toBe(Math.round(springDuration(springs.standard) * 1000));
  });

  it('hands a gesture’s speed to the spring: a fling settles differently', () => {
    const still = springEasing(springs.push, 0).easing;
    const flung = springEasing(springs.push, 4).easing;
    expect(flung).not.toBe(still);
    // Faster at the start: the second point is further along.
    const second = (e: string) => Number(e.slice(7).split(', ')[1]);
    expect(second(flung)).toBeGreaterThan(second(still));
  });
});
