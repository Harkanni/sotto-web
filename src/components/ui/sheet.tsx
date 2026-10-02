'use client';

import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ProgressDriver,
  VelocityTracker,
  prefersReducedMotion,
  rubberband,
  type Track,
} from '@/lib/motion/driver';
import { springs } from '@/lib/motion/spring';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';

export type Detent = 'content' | 'medium' | 'large';

/**
 * Bottom sheet (brief §8): medium and large detents, a grabber, drag-to-dismiss with velocity,
 * and the page behind scaling back to 0.94 and dimming as the sheet rises. On tablets and
 * desktops it becomes a centred dialog. Built on Radix Dialog for focus, Escape and labelling.
 *
 * Every frame of motion is a compositor animation (ProgressDriver); dragging writes transforms
 * directly. Progress `p` is the sheet's offset from fully open, in pixels.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  detents = ['content'],
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Keep the title for screen readers only (custom headers). */
  hideTitle?: boolean;
  detents?: Detent[];
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const dialog = useMediaQuery('(min-width: 768px)');
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const onExited = useCallback(() => setPresent(false), []);
  const onDismiss = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog.Root open={present} onOpenChange={(next) => !next && onOpenChange(false)}>
      {present && (
        <Dialog.Portal forceMount>
          {dialog ? (
            <DialogPresentation
              open={open}
              onExited={onExited}
              {...{ title, description, hideTitle, footer, className }}
            >
              {children}
            </DialogPresentation>
          ) : (
            <SheetPresentation
              open={open}
              onExited={onExited}
              onDismiss={onDismiss}
              {...{ title, description, hideTitle, detents, footer, className }}
            >
              {children}
            </SheetPresentation>
          )}
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}

type PresentationProps = {
  open: boolean;
  onExited: () => void;
  title: string;
  description?: string;
  hideTitle: boolean;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

function Header({
  title,
  description,
  hideTitle,
}: {
  title: string;
  description?: string;
  hideTitle: boolean;
}) {
  return (
    <div className={cn('relative px-[var(--gutter)] pb-2', hideTitle && 'sr-only')}>
      <Dialog.Title className="pr-12 text-title-3">{title}</Dialog.Title>
      {description ? (
        <Dialog.Description className="mt-1 text-callout text-muted-foreground">
          {description}
        </Dialog.Description>
      ) : (
        <Dialog.Description className="sr-only">{title}</Dialog.Description>
      )}
    </div>
  );
}

function CloseButton() {
  return (
    <Dialog.Close
      aria-label="Close"
      className="group/close absolute top-2 right-2 z-10 grid size-11 place-items-center rounded-full text-muted-foreground outline-none select-none active:opacity-50"
    >
      {/* The focus ring hugs the visible circle, not the larger tap target around it. */}
      <span className="grid size-[30px] place-items-center rounded-full bg-fill outline-offset-2 group-focus-visible/close:outline-2 group-focus-visible/close:outline-ring">
        <X aria-hidden className="size-4" strokeWidth={2.5} />
      </span>
    </Dialog.Close>
  );
}

// ── Phone: bottom sheet ────────────────────────────────────────────────────────────────────

function viewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

function safeTop(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--safe-top');
  return parseFloat(v) || 0;
}

function SheetPresentation({
  open,
  onExited,
  onDismiss,
  title,
  description,
  hideTitle,
  detents,
  footer,
  className,
  children,
}: PresentationProps & { detents: Detent[]; onDismiss: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const driver = useRef<ProgressDriver | null>(null);
  const geometry = useRef({ panel: 0, stops: [0] as number[] });
  // Measured once per opening; applied directly to the element (no re-render needed).
  const measured = useRef(false);

  /** Offsets (from fully open) where the sheet rests, smallest sheet first. */
  const measure = useCallback(() => {
    const vh = viewportHeight();
    const large = vh - safeTop() - 10;
    // Natural height of the whole sheet (grabber, header, body, footer), measured before any
    // height is set on it.
    const content = Math.min(large, Math.ceil(panelRef.current?.scrollHeight ?? 0));
    const heights = detents
      .map((d) => (d === 'large' ? large : d === 'medium' ? Math.round(vh * 0.52) : content))
      .sort((a, b) => a - b);
    const panel = heights[heights.length - 1]!;
    geometry.current = { panel, stops: heights.map((h) => panel - h) };
    return panel;
  }, [detents]);

  const buildDriver = useCallback(() => {
    const panel = panelRef.current!;
    const overlay = overlayRef.current!;
    const surface = document.querySelector<HTMLElement>('[data-shell-surface]');
    const { panel: H, stops } = geometry.current;
    const smallest = H - stops[0]!;
    const vh = viewportHeight();
    const reduced = prefersReducedMotion();
    const tracks: Track[] = [
      reduced
        ? {
            el: panel,
            style: (p) => ({ opacity: String(Math.max(0, Math.min(1, (H - p) / smallest))) }),
          }
        : { el: panel, style: (p) => ({ transform: `translate3d(0,${p}px,0)` }) },
      {
        el: overlay,
        style: (p) => ({ opacity: String(Math.max(0, Math.min(1, (H - p) / smallest))) }),
      },
    ];
    if (surface && !reduced) {
      // The page behind recedes in proportion to how much of the screen the sheet covers.
      const top = safeTop();
      tracks.push({
        el: surface,
        style: (p) => {
          const k = Math.max(0, Math.min(1, (H - p) / vh));
          return { transform: `translate3d(0,${k * (top + 10)}px,0) scale(${1 - 0.06 * k})` };
        },
      });
    }
    driver.current = new ProgressDriver(tracks, H);
    return driver.current;
  }, []);

  // Open: measure, start below the screen, spring to the first detent. Close: spring out, then
  // unmount and give the page back its styles. Opening again mid-close just turns around.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (open) {
      if (!measured.current) {
        const H = measure();
        panel.style.height = `${H}px`;
        measured.current = true;
      }
      document.querySelector('[data-app-shell]')?.setAttribute('data-receded', '');
      const d = driver.current ?? buildDriver();
      void d.animateTo(geometry.current.stops[0]!, { config: springs.sheet });
      return;
    }
    const d = driver.current;
    if (!d) {
      onExited();
      return;
    }
    let cancelled = false;
    void d.animateTo(geometry.current.panel, { config: springs.push }).then(() => {
      if (cancelled) return;
      // Hand the page back; the sheet itself stays off-screen until it unmounts.
      const surface = document.querySelector<HTMLElement>('[data-shell-surface]');
      surface?.style.removeProperty('transform');
      document.querySelector('[data-app-shell]')?.removeAttribute('data-receded');
      onExited();
    });
    return () => {
      cancelled = true;
    };
  }, [open, measure, buildDriver, onExited]);

  // Never leave the page scaled if this unmounts mid-animation.
  useEffect(() => {
    return () => {
      driver.current?.clear();
      document.querySelector('[data-app-shell]')?.removeAttribute('data-receded');
    };
  }, []);

  // ── Drag ──
  const drag = useRef<{
    startY: number;
    startP: number;
    tracker: VelocityTracker;
    active: boolean;
    fromBody: boolean;
  } | null>(null);

  const settle = useCallback(
    (velocity: number) => {
      const d = driver.current;
      if (!d) return;
      const { panel: H, stops } = geometry.current;
      const { p } = d.current();
      // Where a flick would carry the sheet, then the nearest resting place to that.
      const projected = p + velocity * 0.18;
      const smallest = stops[0]!;
      if (projected > smallest + (H - smallest) * 0.4 || (velocity > 900 && p > smallest - 4)) {
        onDismiss();
        return;
      }
      const target = stops.reduce((best, s) =>
        Math.abs(s - projected) < Math.abs(best - projected) ? s : best,
      );
      void d.animateTo(target, { velocity, config: springs.sheet });
    },
    [onDismiss],
  );

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !driver.current) return;
    const touch = e.touches[0]!;
    const body = bodyRef.current;
    const fromBody = Boolean(body && body.contains(e.target as Node));
    const tracker = new VelocityTracker();
    tracker.add(touch.clientY);
    // Nothing moves until the finger does: a tap on a row must not stop the sheet mid-spring.
    drag.current = { startY: touch.clientY, startP: 0, tracker, active: false, fromBody };
  };

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Non-passive, so a drag that starts in scrolled content can take over from scrolling.
    const onMove = (e: TouchEvent) => {
      const state = drag.current;
      const d = driver.current;
      const touch = e.touches[0];
      if (!state || !d || !touch) return;
      const dy = touch.clientY - state.startY;
      state.tracker.add(touch.clientY);
      if (!state.active) {
        const body = bodyRef.current;
        const atTop = !state.fromBody || !body || body.scrollTop <= 0;
        const { stops } = geometry.current;
        const current = d.current().p;
        const expanded = current <= stops[stops.length - 1]! + 1;
        // Pull down from the top of the content, or push up while there's room to grow.
        if ((dy > 4 && atTop) || (dy < -4 && (!expanded || !state.fromBody))) {
          d.halt();
          state.active = true;
          state.startY = touch.clientY;
          state.startP = d.current().p;
        } else return;
      }
      e.preventDefault();
      const { stops } = geometry.current;
      const top = stops[stops.length - 1]!;
      const raw = state.startP + dy;
      d.set(raw < top ? top + rubberband(raw - top, 120, 0.4) : raw);
    };
    panel.addEventListener('touchmove', onMove, { passive: false });
    return () => panel.removeEventListener('touchmove', onMove);
  }, []);

  const onTouchEnd = () => {
    const state = drag.current;
    drag.current = null;
    if (!state?.active) return;
    settle(state.tracker.velocity());
  };

  return (
    <>
      <Dialog.Overlay
        ref={overlayRef}
        forceMount
        className="fixed inset-0 z-[var(--z-overlay)] bg-overlay opacity-0"
      />
      <Dialog.Content
        ref={panelRef}
        forceMount
        // On its way out: keyboard shortcuts work again at once (src/components/shell/shortcuts).
        data-closing={!open || undefined}
        aria-modal
        onOpenAutoFocus={(e) => {
          // Focus the sheet itself, not its first button, so nothing looks pre-selected.
          e.preventDefault();
          panelRef.current?.focus({ preventScroll: true });
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className={cn(
          'fixed inset-x-0 bottom-[var(--keyboard-inset,0px)] z-[var(--z-sheet)] flex flex-col rounded-t-sheet bg-card shadow-sheet outline-none',
          '[--surface:var(--card)]',
          className,
        )}
        // Below the screen until measured; the driver takes over from the first frame.
        style={{ transform: 'translate3d(0,100%,0)' }}
      >
        {/* The grabber, and room to grab. */}
        <div
          aria-hidden
          className="flex h-5 shrink-0 cursor-grab touch-none justify-center pt-[5px]"
        >
          <span className="h-[5px] w-9 rounded-full bg-fill-strong" />
        </div>
        <div
          ref={contentRef}
          className="flex min-h-0 flex-1 flex-col pb-[max(var(--safe-bottom),12px)]"
        >
          <Header title={title} description={description} hideTitle={hideTitle} />
          <CloseButton />
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
          {footer && <div className="shrink-0 px-[var(--gutter)] pt-2 pb-3">{footer}</div>}
        </div>
      </Dialog.Content>
    </>
  );
}

// ── Tablet and desktop: centred dialog ───────────────────────────────────────────────────

function DialogPresentation({
  open,
  onExited,
  title,
  description,
  hideTitle,
  footer,
  className,
  children,
}: PresentationProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const driver = useRef<ProgressDriver | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return;
    if (!driver.current) {
      const reduced = prefersReducedMotion();
      driver.current = new ProgressDriver(
        [
          {
            el: panel,
            style: (p) => ({
              opacity: String(1 - p),
              transform: reduced ? 'none' : `translate3d(0,${p * 12}px,0) scale(${1 - p * 0.04})`,
            }),
          },
          { el: overlay, style: (p) => ({ opacity: String(1 - p) }) },
        ],
        1,
      );
      driver.current.set(1);
    }
    const d = driver.current;
    if (open) void d.animateTo(0, { config: springs.standard });
    else
      void d.animateTo(1, { config: springs.snappy }).then((done) => {
        if (done) onExited();
      });
  }, [open, onExited]);

  return (
    <>
      <Dialog.Overlay
        ref={overlayRef}
        forceMount
        className="fixed inset-0 z-[var(--z-overlay)] bg-overlay opacity-0"
      />
      <div className="pointer-events-none fixed inset-0 z-[var(--z-sheet)] grid place-items-center p-6">
        <Dialog.Content
          ref={panelRef}
          forceMount
          data-closing={!open || undefined}
          className={cn(
            'pointer-events-auto relative flex max-h-[min(720px,90dvh)] w-full max-w-[480px] flex-col overflow-hidden rounded-sheet bg-card pt-5 shadow-menu outline-none',
            '[--surface:var(--card)]',
            className,
          )}
          style={{ opacity: 0 }}
        >
          <Header title={title} description={description} hideTitle={hideTitle} />
          <CloseButton />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">{children}</div>
          {footer && <div className="shrink-0 px-[var(--gutter)] pt-2 pb-4">{footer}</div>}
        </Dialog.Content>
      </div>
    </>
  );
}
