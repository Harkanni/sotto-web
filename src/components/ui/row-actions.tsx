'use client';

import { Ellipsis, type LucideIcon } from 'lucide-react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  Item,
  Separator,
}: {
  actions: RowAction[];
  Item: typeof DropdownMenu.Item | typeof ContextMenu.Item;
  Separator: typeof DropdownMenu.Separator | typeof ContextMenu.Separator;
}) {
  const regular = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);
  return (
    <>
      {regular.map((a) => (
        <Item key={a.id} className={menuItem} onSelect={a.onSelect}>
          <span className="flex-1">{a.label}</span>
          <a.icon aria-hidden className="size-5 text-muted-foreground" />
        </Item>
      ))}
      {destructive.length > 0 && regular.length > 0 && (
        <Separator className="mx-1 my-1 h-px bg-separator" />
      )}
      {destructive.map((a) => (
        <Item key={a.id} className={cn(menuItem, 'text-destructive-text')} onSelect={a.onSelect}>
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
export function MoreButton({ actions, label }: { actions: RowAction[]; label: string }) {
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
            Item={DropdownMenu.Item}
            Separator={DropdownMenu.Separator}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ── Long-press preview (touch) ──────────────────────────────────────────────────────────

/**
 * Long-press on touch: the row lifts out of a blurred page as a preview, with the actions
 * beneath it (brief §9). Tapping the preview opens the item; anywhere else closes.
 */
function PreviewMenu({
  rect,
  preview,
  actions,
  onOpenItem,
  onClose,
  label,
}: {
  rect: DOMRect;
  preview: React.ReactNode;
  actions: RowAction[];
  onOpenItem?: () => void;
  onClose: () => void;
  label: string;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top: number; menuTop: number } | null>(null);
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
    const lift = springEasing(springs.standard);
    cardRef.current?.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { transform: `translate3d(0,${dy}px,0) scale(1)` },
            { transform: 'translate3d(0,0,0) scale(1.02)' },
          ],
      { duration: lift.duration, easing: lift.easing, fill: 'forwards' },
    );
    menuRef.current?.animate(
      [
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 360, easing: 'cubic-bezier(0.2, 1.2, 0.3, 1)' },
    );
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, [placement, rect]);

  const close = useCallback(
    (then?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      const animations = [
        backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          fill: 'forwards',
        }),
        menuRef.current?.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.8)' }], {
          duration: 150,
          fill: 'forwards',
        }),
        cardRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          fill: 'forwards',
        }),
      ];
      void Promise.all(animations.map((a) => a?.finished)).finally(() => {
        onClose();
        then?.();
      });
    },
    [onClose],
  );

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
      className="fixed inset-0 z-[var(--z-popover)]"
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
        onClick={() => onOpenItem && close(onOpenItem)}
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
            onClick={() => close(a.onSelect)}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 px-4 text-left text-body outline-none select-none focus-visible:bg-fill active:bg-fill-strong',
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
  const leadingRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const driver = useRef<ProgressDriver | null>(null);
  const offset = useRef(0);
  const [previewRect, setPreviewRect] = useState<DOMRect | null>(null);
  const [full, setFull] = useState(false);
  // Swipe buttons exist only once a swipe starts: most rows are never swiped, and every hidden
  // button would cost style and layout on each screen push.
  const [armed, setArmed] = useState(false);
  const suppressClick = useRef(false);
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
    if (leadingRef.current) leadingRef.current.style.visibility = x > 0 ? 'visible' : 'hidden';
    if (trailingRef.current) trailingRef.current.style.visibility = x < 0 ? 'visible' : 'hidden';
  };

  const snapTo = useCallback((x: number, velocity = 0) => {
    const d = getDriver();
    if (!d) return Promise.resolve(true);
    if (x !== 0) {
      if (leadingRef.current) leadingRef.current.style.visibility = x > 0 ? 'visible' : 'hidden';
      if (trailingRef.current) trailingRef.current.style.visibility = x < 0 ? 'visible' : 'hidden';
    }
    offset.current = x;
    return d.animateTo(x, { velocity, config: springs.standard }).then((done) => {
      if (done && x === 0) {
        if (leadingRef.current) leadingRef.current.style.visibility = 'hidden';
        if (trailingRef.current) trailingRef.current.style.visibility = 'hidden';
      }
      return done;
    });
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

  const runAction = (action: RowAction) => {
    if (action.destructive && action === fullAction) {
      // Slide away, fold the row up, then act (the list re-renders without it).
      const row = rowRef.current;
      const width = row?.offsetWidth ?? 400;
      setFull(true);
      void snapTo(-width).then(() => {
        row
          ?.animate([{ height: `${row.offsetHeight}px` }, { height: '0px' }], {
            duration: 220,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            fill: 'forwards',
          })
          .finished.then(() => action.onSelect());
      });
    } else {
      close();
      action.onSelect();
    }
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    if (openRow && openRow.owner !== owner) openRow.close();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = offset.current;
    const width = rowRef.current?.offsetWidth ?? 400;
    const tracker = new VelocityTracker();
    tracker.add(startX);
    let swiping = false;
    let cleanup = () => {};
    let pressTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      pressTimer = undefined;
      if (swiping || !rowRef.current) return;
      // Long press: lift a preview with the menu.
      navigator.vibrate?.(8);
      suppressClick.current = true;
      setPreviewRect(rowRef.current.getBoundingClientRect());
      cleanup();
    }, 480);

    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      tracker.add(e.clientX);
      if (!swiping) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) clearTimeout(pressTimer);
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
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onClickCapture = (e: React.MouseEvent) => {
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
      {armed && leading.length > 0 && (
        <div
          ref={leadingRef}
          className="absolute inset-y-0 left-0 flex"
          style={{ visibility: 'hidden' }}
          aria-hidden
        >
          {leading.map((a) => (
            <SwipeButton key={a.id} action={a} onClick={() => runAction(a)} />
          ))}
        </div>
      )}
      {armed && trailing.length > 0 && (
        <div
          ref={trailingRef}
          className={cn(
            'absolute inset-y-0 right-0 left-0 flex justify-end',
            full && TONES[fullAction?.tone ?? 'red'],
          )}
          style={{ visibility: 'hidden' }}
          aria-hidden
        >
          {trailing.map((a) => (
            <SwipeButton
              key={a.id}
              action={a}
              collapsed={full && a !== fullAction}
              onClick={() => runAction(a)}
            />
          ))}
        </div>
      )}
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
        <div className="min-w-0 flex-1">{children}</div>
        <div className="absolute top-1/2 right-1 -translate-y-1/2">
          <MoreButton actions={actions} label={label} />
        </div>
      </div>
      {previewRect && (
        <PreviewMenu
          rect={previewRect}
          preview={preview}
          actions={actions}
          label={label}
          onOpenItem={onOpen}
          onClose={() => setPreviewRect(null)}
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
          <MenuItems actions={actions} Item={ContextMenu.Item} Separator={ContextMenu.Separator} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SwipeButton({
  action,
  onClick,
  collapsed,
}: {
  action: RowAction;
  onClick: () => void;
  collapsed?: boolean;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        'flex h-full shrink-0 flex-col items-center justify-center gap-1 text-white transition-[width,opacity] duration-200',
        TONES[action.tone ?? (action.destructive ? 'red' : 'gray')],
        collapsed && 'w-0 opacity-0',
      )}
      style={collapsed ? undefined : { width: ACTION_WIDTH }}
    >
      <Icon aria-hidden className="size-5" strokeWidth={2} />
      <span className="text-[13px] leading-4 font-semibold">{action.label}</span>
    </button>
  );
}
