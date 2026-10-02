'use client';

import { Ellipsis, type LucideIcon } from 'lucide-react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ProgressDriver,
  VelocityTracker,
  prefersReducedMotion,
  rubberband,
} from '@/lib/motion/driver';
import { springEasing, springs } from '@/lib/motion/spring';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';

export type RowAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  /** Reveal by swiping: leading (right swipe) or trailing (left swipe). */
  swipe?: 'leading' | 'trailing';
  /** Swipe button colour; text on it holds 4.5:1. */
  tone?: 'orange' | 'blue' | 'indigo' | 'red' | 'gray';
};

const TONES: Record<NonNullable<RowAction['tone']>, string> = {
  orange: 'bg-[#c93400]',
  blue: 'bg-[#0040dd]',
  indigo: 'bg-[#5856d6]',
  red: 'bg-[#d70015]',
  gray: 'bg-[#636366]',
};

const ACTION_WIDTH = 76;

// Only one row is open at a time, like iOS.
let openRow: { owner: object; close: () => void } | null = null;

// ── Menus ────────────────────────────────────────────────────────────────────────────────

export const menuContent =
  'surface-elevated material-thick z-[var(--z-popover)] min-w-[220px] overflow-hidden rounded-menu p-1 shadow-menu outline-none data-[state=open]:animate-[menu-in_180ms_var(--ease-out)] data-[state=closed]:animate-[menu-out_120ms_ease-in] [transform-origin:var(--radix-dropdown-menu-content-transform-origin,var(--radix-context-menu-content-transform-origin))]';
export const menuItem =
  'flex min-h-11 cursor-default items-center gap-3 rounded-[9px] px-3 text-body outline-none select-none data-[highlighted]:bg-fill can-hover:min-h-9';

function MenuItems({
  actions,
  onAction,
  Item,
  Separator,
}: {
  actions: RowAction[];
  onAction: (action: RowAction) => void;
  Item: typeof DropdownMenu.Item | typeof ContextMenu.Item;
  Separator: typeof DropdownMenu.Separator | typeof ContextMenu.Separator;
}) {
  const regular = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);
  return (
    <>
      {regular.map((a) => (
        <Item key={a.id} className={menuItem} onSelect={() => onAction(a)}>
          <span className="flex-1">{a.label}</span>
          <a.icon aria-hidden className="size-5 text-muted-foreground" />
        </Item>
      ))}
      {destructive.length > 0 && regular.length > 0 && (
        <Separator className="mx-1 my-1 h-px bg-separator" />
      )}
      {destructive.map((a) => (
        <Item
          key={a.id}
          className={cn(menuItem, 'text-destructive-text')}
          onSelect={() => onAction(a)}
        >
          <span className="flex-1">{a.label}</span>
          <a.icon aria-hidden className="size-5" />
        </Item>
      ))}
    </>
  );
}

/**
 * The "…" button: the keyboard and screen-reader route to a row's actions (brief §9). Hidden
 * until focused (or hovered with a mouse), so it never clutters a touch screen.
 */
export function MoreButton({
  actions,
  label,
  onAction = (a) => a.onSelect(),
}: {
  actions: RowAction[];
  label: string;
  onAction?: (action: RowAction) => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`Actions for ${label}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'more-button grid size-11 shrink-0 place-items-center rounded-full text-primary-text',
          // Invisible and untappable on touch (swipe and long-press cover it there); appears for
          // keyboard focus and mouse hover. Screen readers reach it regardless.
          'pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100',
          'data-[state=open]:pointer-events-auto data-[state=open]:opacity-100',
          'can-hover:group-hover/item:pointer-events-auto can-hover:group-hover/item:opacity-100 hover:bg-fill-subtle',
        )}
      >
        <Ellipsis aria-hidden className="size-5" strokeWidth={2} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className={menuContent}
        >
          <MenuItems
            actions={actions}
            onAction={onAction}
            Item={DropdownMenu.Item}
            Separator={DropdownMenu.Separator}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ── Long-press preview (touch) ──────────────────────────────────────────────────────────

/** How far a held row sinks before it lifts out as a preview, like iOS. */
const PRESS_SCALE = 0.97;

/** Holds a scroller still (no touch scrolling) until the returned function is called. */
function holdStill(scroller: HTMLElement | null) {
  if (!scroller) return () => {};
  const previous = scroller.style.overflowY;
  scroller.style.overflowY = 'hidden';
  return () => {
    scroller.style.overflowY = previous;
  };
}

/**
 * Long-press on touch: the row lifts out of a blurred page as a preview, with the actions
 * beneath it (brief §9). While the finger is still down it can slide onto an action and let go
 * to choose it; after that, tapping the preview opens the item and anywhere else closes.
 */
function PreviewMenu({
  rect,
  fromScale,
  freeze,
  preview,
  actions,
  onAction,
  onOpenItem,
  onClose,
  label,
}: {
  /** The row's untransformed rectangle. */
  rect: DOMRect;
  /** The row's scale when the press became a long press, so the lift starts where it is. */
  fromScale: number;
  /** Holds the page under the row still while the opening finger is down; returns a release. */
  freeze: () => () => void;
  preview: React.ReactNode;
  actions: RowAction[];
  /** Runs a chosen action (the row folds away for a destructive one). */
  onAction: (action: RowAction) => void;
  onOpenItem?: () => void;
  onClose: () => void;
  label: string;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top: number; menuTop: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const closing = useRef(false);

  // Fit preview and menu on screen: start where the row is, then move only as far as needed.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const menu = menuRef.current;
    if (!card || !menu) return;
    const vh = window.innerHeight;
    const safeTop = 56;
    const cardH = card.offsetHeight;
    const menuH = menu.offsetHeight;
    const gap = 10;
    let top = rect.top;
    if (top + cardH + gap + menuH > vh - 24) top = vh - 24 - menuH - gap - cardH;
    top = Math.max(safeTop, top);
    setPlacement({ top, menuTop: top + cardH + gap });
  }, [rect]);

  useLayoutEffect(() => {
    if (!placement) return;
    const reduced = prefersReducedMotion();
    const dy = rect.top - placement.top;
    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 220,
      easing: 'ease-out',
    });
    // The card rises from the pressed row with a little overshoot, so it feels picked up.
    const lift = springEasing(springs.standard);
    cardRef.current?.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { transform: `translate3d(0,${dy}px,0) scale(${fromScale})` },
            { transform: 'translate3d(0,0,0) scale(1)' },
          ],
      { duration: lift.duration, easing: lift.easing },
    );
    const pop = springEasing(springs.snappy);
    menuRef.current?.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'scale(0.5)' },
            { opacity: 1, transform: 'scale(1)', offset: 0.35 },
            { opacity: 1, transform: 'scale(1)' },
          ],
      reduced ? { duration: 160 } : { duration: pop.duration, easing: pop.easing },
    );
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, [placement, rect, fromScale]);

  /**
   * Closes the preview. "settle" puts the card back into the row's place (dismissed, or an action
   * chosen); "fade" lets it go as the item opens.
   */
  const close = useCallback(
    (then?: () => void, mode: 'settle' | 'fade' = 'settle') => {
      if (closing.current) return;
      closing.current = true;
      const card = cardRef.current;
      const dy = rect.top - (placement?.top ?? rect.top);
      const settle = springEasing(springs.snappy);
      const animations = [
        backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 200,
          easing: 'ease-out',
          fill: 'forwards',
        }),
        menuRef.current?.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.85)' }], {
          duration: 150,
          easing: 'ease-out',
          fill: 'forwards',
        }),
        mode === 'settle' && !prefersReducedMotion()
          ? card?.animate(
              [
                { transform: 'translate3d(0,0,0)', boxShadow: 'var(--shadow-menu)' },
                { transform: `translate3d(0,${dy}px,0)`, boxShadow: '0 0 0 transparent' },
              ],
              { duration: settle.duration, easing: settle.easing, fill: 'forwards' },
            )
          : card?.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 180,
              easing: 'ease-out',
              fill: 'forwards',
            }),
      ];
      // Opening the item starts right away, under the fading preview; actions wait for it to
      // settle, so a sheet or a fold-away never fights the preview for the screen.
      if (mode === 'fade') then?.();
      void Promise.all(animations.map((a) => a?.finished)).finally(() => {
        onClose();
        if (mode === 'settle') then?.();
      });
    },
    [onClose, placement, rect],
  );

  // Slide-to-choose while the finger that opened the preview is still down. Runs once per
  // preview: re-running after the finger lifted would wait for a touch that already ended.
  const pick = useCallback(
    (a: RowAction) =>
      // A destructive action lets the preview go where it is while the row folds away.
      close(() => onAction(a), a.destructive ? 'fade' : 'settle'),
    [close, onAction],
  );
  const choose = useEffectEvent((i: number) => {
    const a = actions[i];
    if (a) pick(a);
  });
  useEffect(() => {
    let down = true;
    // Nothing underneath scrolls while the finger moves to an action.
    const release = freeze();
    const itemAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[role="menuitem"]');
      return el && menuRef.current?.contains(el) ? Number(el.dataset.index) : null;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const i = itemAt(t.clientX, t.clientY);
      setActive((prev) => {
        if (prev !== i && i !== null) navigator.vibrate?.(4);
        return i;
      });
    };
    // The lift-off ends with a click on whatever is under the finger (the preview, usually);
    // it belongs to the long press, not to the menu.
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('click', swallow, true);
    };
    const finish = () => {
      if (!down) return;
      down = false;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      release();
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length) return;
      finish();
      window.addEventListener('click', swallow, true);
      setTimeout(() => window.removeEventListener('click', swallow, true), 350);
      const t = e.changedTouches[0];
      const i = e.type === 'touchend' && t ? itemAt(t.clientX, t.clientY) : null;
      setActive(null);
      if (i !== null) choose(i);
    };
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      finish();
      window.removeEventListener('click', swallow, true);
    };
  }, [freeze]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [
          ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
        ];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
        next?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={`Actions for ${label}`}
      className="fixed inset-0 z-[var(--z-popover)] select-none"
    >
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-overlay backdrop-blur-[14px] backdrop-saturate-150"
        onClick={() => close()}
      />
      <div
        ref={cardRef}
        className="absolute overflow-hidden rounded-card bg-card shadow-menu [--surface:var(--card)]"
        style={{
          top: placement?.top ?? rect.top,
          left: rect.left,
          width: rect.width,
          visibility: placement ? 'visible' : 'hidden',
        }}
        onClick={() => (onOpenItem ? close(onOpenItem, 'fade') : close())}
      >
        {preview}
      </div>
      <div
        ref={menuRef}
        role="menu"
        className="surface-elevated material-thick absolute w-[250px] origin-top-left overflow-hidden rounded-menu shadow-menu"
        style={{
          top: placement?.menuTop ?? rect.bottom,
          left: Math.min(rect.left, window.innerWidth - 262),
          visibility: placement ? 'visible' : 'hidden',
        }}
      >
        {actions.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            data-index={i}
            data-active={active === i || undefined}
            onClick={() => pick(a)}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 px-4 text-left text-body outline-none select-none focus-visible:bg-fill active:bg-fill-strong data-[active]:bg-fill-strong',
              i > 0 && 'shadow-[inset_0_0.5px_0_var(--separator)]',
              a.destructive && 'text-destructive-text',
            )}
          >
            <span className="flex-1">{a.label}</span>
            <a.icon aria-hidden className="size-5" />
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ── Swipeable row ───────────────────────────────────────────────────────────────────────

/**
 * A list row with every secondary action (brief §9): swipe left for the trailing actions (a full
 * swipe deletes), swipe right for the leading one, long-press for a preview with the menu,
 * right-click on desktop, and a "…" button for keyboards and screen readers.
 */
export function ActionRow({
  actions,
  label,
  preview,
  onOpen,
  children,
  className,
}: {
  actions: RowAction[];
  /** The item's name, for "Actions for …". */
  label: string;
  /** What the long-press shows lifted out of the page. */
  preview: React.ReactNode;
  /** Opens the item (tapping the preview). */
  onOpen?: () => void;
  /** The row's content (a ListRowContent link). */
  children: React.ReactNode;
  className?: string;
}) {
  const fine = useMediaQuery('(pointer: fine)');
  const rowRef = useRef<HTMLLIElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const driver = useRef<ProgressDriver | null>(null);
  const offset = useRef(0);
  const [lifted, setLifted] = useState<{
    rect: DOMRect;
    fromScale: number;
    freeze: () => () => void;
  } | null>(null);
  const pressAnimation = useRef<Animation | null>(null);
  const [full, setFull] = useState(false);
  // Swipe buttons exist only once a swipe starts: most rows are never swiped, and every hidden
  // button would cost style and layout on each screen push.
  const [armed, setArmed] = useState(false);
  const suppressClick = useRef(false);
  const folding = useRef(false);
  const [owner] = useState(() => ({}));

  const leading = actions.filter((a) => a.swipe === 'leading');
  const trailing = actions.filter((a) => a.swipe === 'trailing');
  const leadingWidth = leading.length * ACTION_WIDTH;
  const trailingWidth = trailing.length * ACTION_WIDTH;
  const fullAction = trailing.find((a) => a.destructive) ?? trailing[trailing.length - 1];

  const getDriver = () => {
    if (!driver.current && contentRef.current) {
      driver.current = new ProgressDriver(
        [{ el: contentRef.current, style: (x) => ({ transform: `translate3d(${x}px,0,0)` }) }],
        0,
      );
    }
    return driver.current;
  };

  const setOffset = (x: number) => {
    offset.current = x;
    getDriver()?.set(x);
  };

  const snapTo = useCallback((x: number, velocity = 0) => {
    const d = getDriver();
    if (!d) return Promise.resolve(true);
    offset.current = x;
    return d.animateTo(x, { velocity, config: springs.standard });
  }, []);

  const close = useCallback(() => {
    if (openRow?.owner === owner) openRow = null;
    setFull(false);
    void snapTo(0);
  }, [snapTo, owner]);

  useEffect(
    () => () => {
      if (openRow?.owner === owner) openRow = null;
    },
    [owner],
  );

  /** Folds the row up, then acts: the list re-renders without it and nothing jumps. */
  const foldAway = (then: () => void) => {
    const row = rowRef.current;
    if (!row || prefersReducedMotion()) return then();
    folding.current = true;
    const fold = row.animate(
      [
        { height: `${row.offsetHeight}px`, opacity: 1 },
        { height: '0px', opacity: 0 },
      ],
      { duration: 240, easing: 'cubic-bezier(0.3, 0, 0.1, 1)', fill: 'forwards' },
    );
    const done = () => {
      then();
      // The list normally drops the row at once; if it is still here, the action didn't take.
      setTimeout(() => {
        if (!row.isConnected) return;
        fold.cancel();
        folding.current = false;
        row.style.opacity = '';
        setFull(false);
        void snapTo(0);
      }, 1000);
    };
    fold.finished.then(done, done);
  };

  /** Runs an action from any menu: destructive ones fold the row away first. */
  const perform = (action: RowAction) => {
    if (action.destructive) foldAway(action.onSelect);
    else action.onSelect();
  };

  /** Runs a swipe button's action (or the full swipe's). */
  const runAction = (action: RowAction) => {
    if (action.destructive && action === fullAction) {
      // The content slides the rest of the way out, then the row folds up.
      const width = rowRef.current?.offsetWidth ?? 400;
      setFull(true);
      void snapTo(-width).then(() => foldAway(action.onSelect));
    } else {
      close();
      action.onSelect();
    }
  };

  /** Lets a sinking row come back up (the press ended, or turned into a scroll or swipe). */
  const releasePress = () => {
    const row = rowRef.current;
    const animation = pressAnimation.current;
    pressAnimation.current = null;
    if (!row || !animation) return;
    const from = getComputedStyle(row).transform;
    animation.cancel();
    row.animate([{ transform: from }, { transform: 'none' }], {
      duration: 240,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    });
  };

  const onPointerDown = (event: React.PointerEvent) => {
    // A swipe ends without a click, so whatever the last gesture left behind starts over here.
    suppressClick.current = false;
    if (event.pointerType === 'mouse' || !event.isPrimary || folding.current) return;
    if (openRow && openRow.owner !== owner) openRow.close();
    // On a revealed button a drag still moves the row, but holding it is just a tap.
    const onButton = (event.target as Element).closest('[data-swipe-actions]') !== null;
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = offset.current;
    const width = rowRef.current?.offsetWidth ?? 400;
    const tracker = new VelocityTracker();
    tracker.add(startX);
    let swiping = false;
    let cleanup = () => {};
    // A held row starts to sink after a beat, hinting that something is about to happen.
    let sinkTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      sinkTimer = undefined;
      if (swiping || onButton || startOffset !== 0 || prefersReducedMotion() || !rowRef.current)
        return;
      pressAnimation.current = rowRef.current.animate(
        [{ transform: 'none' }, { transform: `scale(${PRESS_SCALE})` }],
        { duration: 330, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' },
      );
    }, 150);
    let pressTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      pressTimer = undefined;
      const row = rowRef.current;
      if (swiping || onButton || !row) return;
      // Long press: lift a preview with the menu.
      navigator.vibrate?.(8);
      suppressClick.current = true;
      const r = row.getBoundingClientRect();
      const w = row.offsetWidth;
      const h = row.offsetHeight;
      const fromScale = w ? r.width / w : 1;
      pressAnimation.current?.cancel();
      pressAnimation.current = null;
      // The row's place stays empty while its preview is lifted out of the page.
      row.style.opacity = '0';
      setLifted({
        rect: new DOMRect(r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h),
        fromScale,
        freeze: () => holdStill(row.closest<HTMLElement>('.screen')),
      });
      cleanup();
    }, 480);

    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      tracker.add(e.clientX);
      if (!swiping) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          clearTimeout(pressTimer);
          clearTimeout(sinkTimer);
          releasePress();
        }
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return cleanup();
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        // Nothing to reveal in that direction (and the row is closed): let it be.
        if (
          (dx > 0 && !leading.length && startOffset >= 0) ||
          (dx < 0 && !trailing.length && startOffset <= 0)
        )
          return cleanup();
        swiping = true;
        suppressClick.current = true;
        setArmed(true);
        getDriver()?.halt();
        rowRef.current?.setAttribute('data-swiping', '');
      }
      let x = startOffset + dx;
      const maxRight = leadingWidth;
      if (x > maxRight) x = maxRight + rubberband(x - maxRight, width, 0.35);
      if (!leading.length && x > 0) x = rubberband(x, width, 0.2);
      if (!trailing.length && x < 0) x = rubberband(x, width, 0.2);
      setOffset(x);
      const isFull = trailing.length > 0 && -x > Math.max(width * 0.6, trailingWidth + 40);
      setFull((prev) => (prev === isFull ? prev : isFull));
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      cleanup();
      if (!swiping) return;
      rowRef.current?.removeAttribute('data-swiping');
      const v = tracker.velocity();
      const x = offset.current;
      if (trailing.length && -x > Math.max(width * 0.6, trailingWidth + 40) && fullAction) {
        runAction(fullAction);
        return;
      }
      setFull(false);
      const projected = x + v * 0.15;
      let target = 0;
      if (projected < -trailingWidth / 2 && trailing.length) target = -trailingWidth;
      else if (projected > leadingWidth / 2 && leading.length) target = leadingWidth;
      if (target !== 0) openRow = { owner, close };
      void snapTo(target, v);
    };

    cleanup = () => {
      clearTimeout(pressTimer);
      clearTimeout(sinkTimer);
      if (pressTimer !== undefined) releasePress();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    const onButton = (e.target as Element).closest('[data-swipe-actions]') !== null;
    // A tap on a revealed button is that button's.
    if (onButton && !suppressClick.current) return;
    // A swipe or long-press ends with a click; an open row closes on tap instead of opening.
    if (suppressClick.current || offset.current !== 0) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
      if (offset.current !== 0) close();
    }
  };

  const row = (
    <li
      ref={rowRef}
      className={cn('list-row has-more group/item relative overflow-hidden', className)}
    >
      <div
        ref={contentRef}
        className="relative flex items-center bg-card touch-pan-y"
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        onContextMenu={(e) => {
          // Touch long-press is ours; keep the browser's menu away.
          if (!fine) e.preventDefault();
        }}
      >
        {/* The swipe buttons ride on the content's edges (outside the row, so the row clips
            them), which keeps a full swipe's label beside the content as it slides away. */}
        {armed && leading.length > 0 && (
          <div
            data-swipe-actions
            aria-hidden
            className="absolute inset-y-0 right-full flex w-full justify-end"
          >
            {leading.map((a) => (
              <SwipeButton key={a.id} action={a} onClick={() => runAction(a)} />
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1">{children}</div>
        <div className="absolute top-1/2 right-1 -translate-y-1/2">
          <MoreButton actions={actions} label={label} onAction={perform} />
        </div>
        {armed && trailing.length > 0 && (
          <div
            data-swipe-actions
            aria-hidden
            className={cn(
              'absolute inset-y-0 left-full flex w-full',
              full && TONES[fullAction?.tone ?? 'red'],
            )}
          >
            {trailing.map((a) => (
              <SwipeButton
                key={a.id}
                action={a}
                collapsed={full && a !== fullAction}
                fill={full && a === fullAction}
                onClick={() => runAction(a)}
              />
            ))}
          </div>
        )}
      </div>
      {lifted && (
        <PreviewMenu
          rect={lifted.rect}
          fromScale={lifted.fromScale}
          freeze={lifted.freeze}
          preview={preview}
          actions={actions}
          onAction={perform}
          label={label}
          onOpenItem={onOpen}
          onClose={() => {
            // A row folding away stays hidden until the list drops it.
            if (rowRef.current && !folding.current) rowRef.current.style.opacity = '';
            setLifted(null);
          }}
        />
      )}
    </li>
  );

  if (!fine) return row;
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>{row}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content collisionPadding={12} className={menuContent}>
          <MenuItems
            actions={actions}
            onAction={perform}
            Item={ContextMenu.Item}
            Separator={ContextMenu.Separator}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SwipeButton({
  action,
  onClick,
  collapsed,
  fill,
}: {
  action: RowAction;
  onClick: () => void;
  /** Squeezed out while another button takes a full swipe. */
  collapsed?: boolean;
  /** Takes the whole swipe (a full swipe), its label staying beside the content. */
  fill?: boolean;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        'flex h-full shrink-0 overflow-hidden text-white',
        'transition-[width,opacity] duration-[var(--duration-snappy)] ease-snappy',
        TONES[action.tone ?? (action.destructive ? 'red' : 'gray')],
      )}
      style={{
        width: collapsed ? 0 : fill ? '100%' : ACTION_WIDTH,
        // Squeezed buttons fade too, so the full swipe's colour sweeps over them cleanly.
        opacity: collapsed ? 0 : 1,
      }}
    >
      <span
        className="flex h-full shrink-0 flex-col items-center justify-center gap-1"
        style={{ width: ACTION_WIDTH }}
      >
        <Icon aria-hidden className="size-5" strokeWidth={2} />
        <span className="text-[13px] leading-4 font-semibold">{action.label}</span>
      </span>
    </button>
  );
}
