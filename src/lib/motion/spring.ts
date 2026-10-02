/**
 * Damped-spring maths for every motion in Sotto.
 *
 * Why our own instead of a library: navigation, sheets and swipes run as Web Animations on the
 * compositor thread, so they stay smooth while React renders the next screen on the main thread.
 * The browser can only run a spring there if we hand it the curve as a CSS `linear()` easing,
 * which this module generates. It also gives us the exact position and velocity at any moment,
 * so a gesture can take over a running animation (or hand back to one) without a jump.
 *
 * Units: positions are normalised (0 = start, 1 = target); velocity is "distances per second"
 * in the same normalised space. A finger moving 600 px/s on a 300 px animation is velocity 2.
 */

export type SpringConfig = {
  /** Stiffness k. Higher is faster. */
  stiffness: number;
  /** Damping c. Damping ratio = c / (2·√(k·m)); 1 is critically damped (no overshoot). */
  damping: number;
  /** Mass m. Defaults to 1. */
  mass?: number;
};

/** The springs the design system uses (brief §8: about stiffness 400, damping 30). */
export const springs = {
  /** Default UI spring: sheets, presses, toggles. Damping ratio 0.75, a hint of overshoot. */
  standard: { stiffness: 400, damping: 30 },
  /** Short presses and small state changes. Ratio 0.85, settles in ~150 ms. */
  snappy: { stiffness: 700, damping: 45 },
  /** Push and pop. Critically damped so a full-width screen never overshoots its edge. */
  push: { stiffness: 340, damping: 37 },
  /** Sheets snapping to a detent. Ratio 0.8. */
  sheet: { stiffness: 400, damping: 32 },
} as const satisfies Record<string, SpringConfig>;

export type SpringState = { value: number; velocity: number };

/**
 * Position and velocity of a spring released at 0 with `velocity`, heading to 1, after `t`
 * seconds. Closed-form solutions of m·x″ = −k·(x − 1) − c·x′.
 */
export function springAt(config: SpringConfig, t: number, velocity = 0): SpringState {
  const { stiffness: k, damping: c, mass: m = 1 } = config;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  // Work in displacement from the target: d(0) = −1, d′(0) = velocity.
  const d0 = -1;
  const v0 = velocity;

  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * t);
    const a = d0;
    const b = (v0 + zeta * w0 * d0) / wd;
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    const d = decay * (a * cos + b * sin);
    const dv = decay * ((b * wd - zeta * w0 * a) * cos - (a * wd + zeta * w0 * b) * sin);
    return { value: 1 + d, velocity: dv };
  }

  if (zeta === 1) {
    const decay = Math.exp(-w0 * t);
    const b = v0 + w0 * d0;
    const d = decay * (d0 + b * t);
    const dv = decay * (b - w0 * (d0 + b * t));
    return { value: 1 + d, velocity: dv };
  }

  // Overdamped: two real roots.
  const s = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + s;
  const r2 = -zeta * w0 - s;
  const c2 = (v0 - r1 * d0) / (r2 - r1);
  const c1 = d0 - c2;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return { value: 1 + c1 * e1 + c2 * e2, velocity: c1 * r1 * e1 + c2 * r2 * e2 };
}

/**
 * Seconds until the spring is visually at rest: within `restDelta` of the target and slower
 * than `restSpeed`. Defaults suit distances up to ~1000 px (0.0005 of 1000 px is half a pixel).
 */
export function springDuration(
  config: SpringConfig,
  velocity = 0,
  restDelta = 0.0005,
  restSpeed = 0.005,
): number {
  const step = 1 / 240;
  for (let t = step; t < 5; t += step) {
    const { value, velocity: v } = springAt(config, t, velocity);
    if (Math.abs(1 - value) < restDelta && Math.abs(v) < restSpeed) return t;
  }
  return 5;
}

/**
 * A CSS `linear()` easing that traces the spring, plus the duration to pair it with. Output can
 * exceed 1 for springs that overshoot; CSS extrapolates the keyframes, so that works.
 */
export function springEasing(
  config: SpringConfig,
  velocity = 0,
  {
    resolution = 1 / 90,
    restDelta,
    restSpeed,
  }: { resolution?: number; restDelta?: number; restSpeed?: number } = {},
): { easing: string; duration: number } {
  const duration = springDuration(config, velocity, restDelta, restSpeed);
  const steps = Math.max(2, Math.ceil(duration / resolution));
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    const value = i === steps ? 1 : springAt(config, t, velocity).value;
    points.push(String(Math.round(value * 10000) / 10000));
  }
  return { easing: `linear(${points.join(', ')})`, duration: Math.round(duration * 1000) };
}

/** Damping ratio, for documentation and tests. */
export function dampingRatio({ stiffness, damping, mass = 1 }: SpringConfig): number {
  return damping / (2 * Math.sqrt(stiffness * mass));
}
