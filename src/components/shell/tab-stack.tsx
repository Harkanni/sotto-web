'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ProgressDriver,
  VelocityTracker,
  prefersReducedMotion,
  rubberband,
  type Track,
} from '@/lib/motion/driver';
import { springs } from '@/lib/motion/spring';
import { useIsWide, WIDE_QUERY } from '@/lib/hooks/use-media-query';
import { compareStacks, parseStack, type StackEntry, type Tab } from '@/lib/nav/routes';
import { navigateUp, type NavIntent } from '@/lib/nav/store';
import { onShellEvent } from './shell-events';
import { LayerContext, type LayerInfo } from './stack-context';

/**
 * One tab's navigation stack. Every screen in the stack stays mounted (with its scroll position
 * and state), layered like iOS: pushing slides the new screen in from the right while the one
 * below drifts left and dims; popping reverses it. On wide windows the same layers become the
 * list and detail panes instead.
 *
 * All motion runs on the compositor through ProgressDriver. A transition can be reversed mid-
 * flight (tap a row, then back at once) and the edge swipe can catch a screen at any point.
 */

type Layer = { entry: StackEntry; exiting: boolean };

type Planned = { type: 'none' } | { type: 'push' | 'pop'; top: string; under: string };

type StackState = {
  path: string;
  entries: StackEntry[];
  layers: Layer[];
  change: Planned;
  seq: number;
};

type Running = {
  type: 'push' | 'pop';
  top: string;
  under: string;
  driver: ProgressDriver;
  /** A committed swipe-back: the navigation that removes the layer may arrive after it lands. */
  gesture: boolean;
};

const EDGE = 24; // px from the left edge where the back swipe starts
const PARALLAX = 0.3; // how far the screen below drifts, as a share of the width

function plan(
  prev: StackState,
  entries: StackEntry[],
  animate: boolean,
  intent: NavIntent,
): Planned & { layers: Layer[] } {
  const fresh = entries.map((entry) => ({ entry, exiting: false }));
  const change = compareStacks(prev.entries, entries);
  const prevTop = prev.entries[prev.entries.length - 1];
  const nextTop = entries[entries.length - 1];
  if (change.type === 'same' || !prevTop || !nextTop) return { type: 'none', layers: prev.layers };
  if (!animate) return { type: 'none', layers: fresh };

  if (change.type === 'push') {
    return { type: 'push', top: nextTop.key, under: prevTop.key, layers: fresh };
  }
  if (change.type === 'pop') {
    const leaving = prev.entries.slice(entries.length).map((entry) => ({ entry, exiting: true }));
    return { type: 'pop', top: prevTop.key, under: nextTop.key, layers: [...fresh, ...leaving] };
  }
  // Sideways (a different screen at the same depth): forward slides the new one over the old,
  // back slides the old one off the new.
  const common = fresh.slice(0, change.common);
  const leaving = prev.entries.slice(change.common).map((entry) => ({ entry, exiting: true }));
  const arriving = fresh.slice(change.common);
  if (intent === 'back') {
    return {
      type: 'pop',
      top: prevTop.key,
      under: nextTop.key,
      layers: [...common, ...arriving, ...leaving],
    };
  }
  if (intent === 'forward') {
    return {
      type: 'push',
      top: nextTop.key,
      under: prevTop.key,
      layers: [...common, ...leaving, ...arriving],
    };
  }
  return { type: 'none', layers: fresh };
}

/** Where each visible screen goes on a wide window. */
function panesFor(entries: StackEntry[]): Map<string, 'list' | 'detail' | 'full' | 'hidden'> {
  const panes = new Map<string, 'list' | 'detail' | 'full' | 'hidden'>();
  const top = entries[entries.length - 1];
  let listIdx = -1;
  entries.forEach((entry, i) => {
    if (entry.role === 'list' || entry.role === 'full') listIdx = i;
  });
  const fullTop = top?.role === 'full' || entries[listIdx]?.role === 'full';
  entries.forEach((entry, i) => {
    if (fullTop) panes.set(entry.key, i === entries.length - 1 ? 'full' : 'hidden');
    else if (i === listIdx) panes.set(entry.key, 'list');
    else if (i === entries.length - 1 && i > listIdx) panes.set(entry.key, 'detail');
    else panes.set(entry.key, 'hidden');
  });
  return panes;
}

function swipeBackEnabled(): boolean {
  const html = document.documentElement;
  let setting: string | null = null;
  try {
    setting = localStorage.getItem('sotto.swipe');
  } catch {}
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  // Installed on iPhone/iPad there's no browser gesture, so Sotto draws its own. In Safari the
  // browser's swipe-back already works (and Sotto skips its own animation for it).
  return html.dataset.platform === 'apple' && html.dataset.standalone !== undefined;
}

type RenderScreen = (entry: StackEntry) => React.ReactNode;

/**
 * A layer and its screen. Memoised on the entry's key: pushing or popping re-renders only the
 * <section> wrappers (cheap), never the screens already in the stack.
 */
const StackLayer = memo(function StackLayer({
  tab,
  entry,
  pane,
  parentBeside,
  register,
  registerScroller,
  renderScreen,
}: {
  tab: Tab;
  entry: StackEntry;
  pane: string;
  parentBeside: boolean;
  register: (key: string, el: HTMLElement | null) => void;
  registerScroller: LayerInfo['registerScroller'];
  renderScreen: RenderScreen;
}) {
  const info = useMemo<LayerInfo>(() => {
    const own = parseStack(entry.key);
    return {
      tab,
      entry,
      depth: own.length - 1,
      parent: own.length > 1 ? own[own.length - 2]! : null,
      registerScroller,
    };
    // The entry object changes identity on every parse; its key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, entry.key, registerScroller]);
  const screen = useMemo(
    () => renderScreen(info.entry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [info.entry.key, renderScreen],
  );
  return (
    <section
      ref={(el) => register(entry.key, el)}
      className="stack-layer"
      data-role={entry.role}
      data-pane={pane}
      data-depth={info.depth}
      // On wide windows a detail screen's parent sits in the list pane beside it, so its back
      // button hides (with CSS, so server and client markup agree).
      data-parent-beside={parentBeside ? '' : undefined}
    >
      <LayerContext value={info}>{screen}</LayerContext>
      <div data-scrim aria-hidden className="stack-scrim" />
    </section>
  );
});

export const TabStack = memo(function TabStack({
  tab,
  href,
  active,
  intent,
  uaTransition,
  renderScreen,
  placeholder,
}: {
  tab: Tab;
  href: string;
  active: boolean;
  /** How the current navigation feels (only meaningful for the active tab). */
  intent: NavIntent;
  /** The browser already animated this navigation. */
  uaTransition: boolean;
  renderScreen: RenderScreen;
  /** Shown in the detail pane on wide windows when nothing is selected. */
  placeholder?: React.ReactNode;
}) {
  const wide = useIsWide();
  const pathname = href.split('?')[0]!;
  const entries = useMemo(() => parseStack(pathname), [pathname]);

  const [state, setState] = useState<StackState>(() => ({
    path: pathname,
    entries,
    layers: entries.map((entry) => ({ entry, exiting: false })),
    change: { type: 'none' },
    seq: 0,
  }));

  // Was this tab on screen before this render? A tab that is just appearing switches instantly.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) setWasActive(active);

  // Derive the layers for a new path during render, so a leaving screen never unmounts first.
  if (pathname !== state.path) {
    const animate = active && wasActive && !uaTransition && !wide;
    const planned = plan(state, entries, animate, intent);
    const { layers, ...change } = planned;
    setState({ path: pathname, entries, layers, change, seq: state.seq + 1 });
  }

  const rootRef = useRef<HTMLDivElement>(null);
  // The stack's width, kept current without ever forcing a layout mid-transition.
  const widthRef = useRef(0);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) widthRef.current = entry.contentRect.width;
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const layerEls = useRef(new Map<string, HTMLElement>());
  const scrollers = useRef(new Map<string, HTMLElement>());
  const running = useRef<Running | null>(null);

  const registerScroller = useCallback((key: string, el: HTMLElement | null) => {
    if (el) scrollers.current.set(key, el);
    else scrollers.current.delete(key);
  }, []);
  const registerLayer = useCallback((key: string, el: HTMLElement | null) => {
    if (el) layerEls.current.set(key, el);
    else layerEls.current.delete(key);
  }, []);

  /** Tracks for a top layer sliding over an under layer. p: 0 = top in place, 1 = top gone. */
  const tracksFor = useCallback((topKey: string, underKey: string): Track[] => {
    const top = layerEls.current.get(topKey);
    const under = layerEls.current.get(underKey);
    const width = widthRef.current || window.innerWidth;
    const tracks: Track[] = [];
    if (prefersReducedMotion()) {
      // Reduced motion: a crossfade, nothing moves.
      if (top) tracks.push({ el: top, style: (p) => ({ opacity: String(1 - p) }) });
      if (under) tracks.push({ el: under, style: () => ({ contentVisibility: 'visible' }) });
      return tracks;
    }
    if (top) {
      tracks.push({ el: top, style: (p) => ({ transform: `translate3d(${p * width}px,0,0)` }) });
    }
    if (under) {
      tracks.push({
        el: under,
        style: (p) => ({
          transform: `translate3d(${-(1 - p) * width * PARALLAX}px,0,0)`,
          contentVisibility: 'visible',
        }),
      });
      const scrim = under.querySelector<HTMLElement>(':scope > [data-scrim]');
      if (scrim) tracks.push({ el: scrim, style: (p) => ({ opacity: String(1 - p) }) });
    }
    return tracks;
  }, []);

  /**
   * Keyboard and screen-reader users land somewhere sensible: on the new screen's title after a
   * push; back on the row they came from after a pop. Only when focus was in this stack.
   */
  const moveFocus = useCallback((type: 'push' | 'pop', top: string, under: string) => {
    const root = rootRef.current;
    const active = document.activeElement;
    if (!root || !(active === document.body || root.contains(active))) return;
    const target = type === 'push' ? layerEls.current.get(top) : layerEls.current.get(under);
    if (!target) return;
    const origin =
      type === 'pop' ? target.querySelector<HTMLElement>(`a[href="${CSS.escape(top)}"]`) : null;
    (origin ?? target.querySelector<HTMLElement>('[data-screen-title]'))?.focus({
      preventScroll: true,
    });
  }, []);

  /** Ends a transition: drop leaving layers, hand styling back to the stylesheet. */
  const settle = useCallback(
    (run: Running, { sync }: { sync: boolean }) => {
      if (running.current === run) running.current = null;
      rootRef.current?.removeAttribute('data-transitioning');
      const removeLeaving = () =>
        setState((s) =>
          s.layers.some((l) => l.exiting)
            ? { ...s, layers: s.layers.filter((l) => !l.exiting) }
            : s,
        );
      if (sync) removeLeaving();
      else flushSync(removeLeaving);
      run.driver.clear();
      if (run.type === 'pop') {
        // The row that opened the screen fades back to normal now that we're back.
        for (const el of layerEls.current.get(run.under)?.querySelectorAll('[data-just-opened]') ??
          []) {
          el.removeAttribute('data-just-opened');
        }
        if (!sync) moveFocus('pop', run.top, run.under);
      }
    },
    [moveFocus],
  );

  const start = useCallback(
    (type: 'push' | 'pop', top: string, under: string, gesture = false): Running => {
      const driver = new ProgressDriver(tracksFor(top, under), type === 'push' ? 1 : 0);
      driver.set(type === 'push' ? 1 : 0);
      const run: Running = { type, top, under, driver, gesture };
      running.current = run;
      rootRef.current?.setAttribute('data-transitioning', '');
      // Focusing forces a layout: wait until the first frame of the push is on screen.
      if (type === 'push') {
        requestAnimationFrame(() => requestAnimationFrame(() => moveFocus('push', top, under)));
      }
      return run;
    },
    [tracksFor, moveFocus],
  );

  const animate = useCallback(
    (run: Running, to: 0 | 1, velocity?: number) => {
      run.type = to === 0 ? 'push' : 'pop';
      run.driver
        .animateTo(to, { velocity, config: prefersReducedMotion() ? springs.snappy : springs.push })
        .then((completed) => {
          if (!completed || running.current !== run) return;
          // A swipe that landed before its navigation: wait for the pop to arrive.
          if (run.gesture && to === 1 && !stateRef.current.layers.some((l) => l.exiting)) return;
          settle(run, { sync: false });
        });
    },
    [settle],
  );

  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  // Run the transition planned for this render.
  useLayoutEffect(() => {
    const change = state.change;
    const current = running.current;

    if (change.type === 'none') {
      if (current) {
        current.driver.finish();
        settle(current, { sync: true });
      }
      // Wide windows: fade the newly shown pane in.
      if (state.seq > 0 && window.matchMedia(WIDE_QUERY).matches && !prefersReducedMotion()) {
        const top = state.entries[state.entries.length - 1];
        const el = top && layerEls.current.get(top.key);
        el?.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 180,
          easing: 'cubic-bezier(0.22,1,0.36,1)',
        });
      }
      return;
    }

    if (current) {
      const sameLayers = current.top === change.top && current.under === change.under;
      if (sameLayers && change.type === 'pop') {
        // Reversing a push, or the navigation for a committed swipe arriving.
        if (current.driver.animating && current.driver.target === 1) return;
        if (!current.driver.animating && current.gesture) {
          settle(current, { sync: true });
          return;
        }
        animate(current, 1);
        return;
      }
      if (sameLayers && change.type === 'push') {
        // Reversing a pop (forward straight after back).
        current.gesture = false;
        animate(current, 0);
        return;
      }
      current.driver.finish();
      settle(current, { sync: true });
    }

    const run = start(change.type, change.top, change.under);
    animate(run, change.type === 'push' ? 0 : 1);
  }, [state.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // A hidden tab (or an unmount) never leaves a transition half-done.
  useLayoutEffect(() => {
    return () => {
      const current = running.current;
      if (current) {
        current.driver.finish();
        current.driver.clear();
        running.current = null;
      }
    };
  }, []);

  // Tapping the active tab again: pop to the root, or scroll the root to the top.
  useEffect(() => {
    if (!active) return;
    return onShellEvent('tab-reselect', (target) => {
      if (target !== tab) return;
      const visible = stateRef.current.entries;
      if (visible.length > 1) {
        navigateUp(visible[0]!.key);
        return;
      }
      const scroller = scrollers.current.get(visible[0]!.key);
      scroller?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  }, [active, tab]);

  // ── Edge swipe back ────────────────────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      if (window.matchMedia(WIDE_QUERY).matches || !swipeBackEnabled()) return;
      const root = rootRef.current;
      if (!root) return;
      // The stack starts after the sidebar on tablets; phones have no sidebar.
      const left = window.innerWidth - (widthRef.current || window.innerWidth);
      if (event.clientX - left > EDGE) return;
      const visible = stateRef.current.entries;
      if (visible.length < 2) return;
      const top = visible[visible.length - 1]!.key;
      const under = visible[visible.length - 2]!.key;

      const startX = event.clientX;
      const startY = event.clientY;
      const width = widthRef.current || window.innerWidth;
      const tracker = new VelocityTracker();
      tracker.add(startX);
      let run: Running | null = null;
      let startP = 0;

      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        root.removeAttribute('data-swiping');
      };

      const move = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        tracker.add(e.clientX);
        if (!run) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return end();
          if (dx < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          // Catch a screen that is still sliding in, from wherever it is.
          const current = running.current;
          if (current && current.top === top && current.under === under) {
            current.driver.halt();
            current.gesture = true;
            run = current;
            startP = current.driver.current().p;
          } else {
            if (current) {
              current.driver.finish();
              settle(current, { sync: false });
            }
            run = start('pop', top, under, true);
            startP = 0;
          }
          root.setAttribute('data-swiping', '');
        }
        const raw = startP + dx / width;
        run.driver.set(raw < 0 ? rubberband(raw * width, width, 0.2) / width : Math.min(raw, 1));
      };

      const finishGesture = (commit: boolean, velocity: number) => {
        if (!run) return;
        if (commit) {
          animate(run, 1, velocity);
          navigateUp(under);
        } else {
          run.gesture = false;
          animate(run, 0, velocity);
        }
        // The finger lifting must not also tap whatever is under it.
        const swallow = (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 350);
      };

      const up = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        end();
        if (!run) return;
        const v = tracker.velocity() / width; // progress per second
        const p = run.driver.current().p;
        // Commit on a flick to the right, or past halfway without a flick back.
        const commit = v > 0.35 || (p > 0.5 && v > -0.35);
        finishGesture(commit, v);
      };

      const cancel = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        end();
        if (run) finishGesture(false, 0);
      };

      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
    [animate, settle, start],
  );

  const panes = useMemo(() => panesFor(state.entries), [state.entries]);
  const hasDetail = [...panes.values()].some((p) => p === 'detail' || p === 'full');

  return (
    <div ref={rootRef} className="tab-stack" data-tab={tab} onPointerDown={onPointerDown}>
      {state.layers.map((layer) => {
        const key = layer.entry.key;
        const pane = layer.exiting ? 'hidden' : (panes.get(key) ?? 'hidden');
        const own = parseStack(key);
        const parent = own.length > 1 ? own[own.length - 2]! : null;
        return (
          <StackLayer
            key={key}
            tab={tab}
            entry={layer.entry}
            pane={pane}
            parentBeside={pane === 'detail' && parent !== null && panes.get(parent.key) === 'list'}
            register={registerLayer}
            registerScroller={registerScroller}
            renderScreen={renderScreen}
          />
        );
      })}
      <div aria-hidden className="stack-blocker" />
      {placeholder && !hasDetail && <div className="stack-placeholder">{placeholder}</div>}
    </div>
  );
});
