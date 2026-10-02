/**
 * Drives several elements from one progress value, either directly (a finger dragging) or with a
 * spring (a release, a push, a pop). Springs run as Web Animations with a linear() easing, so
 * the compositor animates them even while React renders on the main thread.
 *
 * Every animation can be interrupted: `current()` reads the exact position and velocity off the
 * spring curve, so a new gesture or a new target continues from there without a jump.
 */

import { springAt, springEasing, springs, type SpringConfig } from './spring';

/** One element's styles as a function of progress. Must be linear in `p` (translate, opacity). */
export type Track = {
  el: HTMLElement;
  style: (p: number) => Keyframe;
};

type Running = {
  animations: Animation[];
  from: number;
  to: number;
  velocity: number; // normalised initial velocity of the curve
  config: SpringConfig;
  resolve: (completed: boolean) => void;
};

function applyStyle(el: HTMLElement, frame: Keyframe) {
  for (const [key, value] of Object.entries(frame)) {
    if (key === 'offset' || key === 'easing' || key === 'composite') continue;
    if (value == null) el.style.removeProperty(toCssProperty(key));
    else el.style.setProperty(toCssProperty(key), String(value));
  }
}

function toCssProperty(key: string): string {
  return key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

const canAnimate =
  typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

export class ProgressDriver {
  private tracks: Track[];
  private p: number;
  private running: Running | null = null;

  constructor(tracks: Track[], initial = 0) {
    this.tracks = tracks;
    this.p = initial;
  }

  /** Progress and velocity (progress per second) right now. */
  current(): { p: number; v: number } {
    const run = this.running;
    if (!run) return { p: this.p, v: 0 };
    const t = Number(run.animations[0]?.currentTime ?? 0) / 1000;
    const { value, velocity } = springAt(run.config, Math.max(0, t), run.velocity);
    const dist = run.to - run.from;
    return { p: run.from + dist * value, v: dist * velocity };
  }

  get animating(): boolean {
    return this.running !== null;
  }

  get target(): number | null {
    return this.running?.to ?? null;
  }

  /** Jump to `p` (a finger moving). Stops any animation where it is first. */
  set(p: number) {
    this.halt();
    this.p = p;
    for (const track of this.tracks) applyStyle(track.el, track.style(p));
  }

  /** Spring to `to`, starting at the current position and velocity unless `velocity` is given. */
  animateTo(
    to: number,
    { velocity, config = springs.push }: { velocity?: number; config?: SpringConfig } = {},
  ): Promise<boolean> {
    const now = this.current();
    const from = now.p;
    const v = velocity ?? now.v;
    this.halt();
    this.p = from;

    const dist = to - from;
    if (Math.abs(dist) < 1e-4 || !canAnimate) {
      this.set(to);
      return Promise.resolve(true);
    }

    const normalised = v / dist;
    const { easing, duration } = springEasing(config, normalised, { resolution: 1 / 120 });
    // Inline styles hold the start, so the very first frame is already right.
    for (const track of this.tracks) applyStyle(track.el, track.style(from));
    const animations = this.tracks.map((track) =>
      track.el.animate([track.style(from), track.style(to)], {
        duration,
        easing,
        fill: 'forwards',
      }),
    );

    return new Promise<boolean>((resolve) => {
      const run: Running = { animations, from, to, velocity: normalised, config, resolve };
      this.running = run;
      animations[0]!.finished.then(
        () => {
          if (this.running !== run) return;
          this.running = null;
          this.p = to;
          for (const track of this.tracks) applyStyle(track.el, track.style(to));
          for (const animation of animations) animation.cancel();
          resolve(true);
        },
        () => {
          // Cancelled: halt() already settled the promise.
        },
      );
    });
  }

  /** Freeze where it is: the current position becomes inline style. */
  halt() {
    const run = this.running;
    if (!run) return;
    const { p } = this.current();
    this.running = null;
    this.p = p;
    for (const track of this.tracks) applyStyle(track.el, track.style(p));
    for (const animation of run.animations) animation.cancel();
    run.resolve(false);
  }

  /** Jump to the end of the running animation (or stay put). */
  finish() {
    const run = this.running;
    if (!run) return;
    this.halt();
    this.set(run.to);
  }

  /** Remove every style this driver set (back to the stylesheet). */
  clear() {
    this.halt();
    for (const track of this.tracks) {
      for (const key of Object.keys(track.style(0)))
        track.el.style.removeProperty(toCssProperty(key));
    }
  }
}

/**
 * Tracks pointer positions to estimate release velocity (px/s) over the last ~100 ms, which is
 * what makes a flick feel like a flick.
 */
export class VelocityTracker {
  private samples: { t: number; x: number }[] = [];

  add(x: number, t = performance.now()) {
    this.samples.push({ t, x });
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift();
  }

  velocity(now = performance.now()): number {
    const recent = this.samples.filter((s) => now - s.t < 120);
    if (recent.length < 2) return 0;
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  }

  reset() {
    this.samples = [];
  }
}

/** Rubber-band resistance past a limit, like iOS scroll views: never stops, always slows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const sign = Math.sign(overshoot);
  const x = Math.abs(overshoot);
  return sign * (1 - 1 / ((x * constant) / dimension + 1)) * dimension;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
