'use client';

import { ChevronLeft } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { DEFAULT_TITLE } from '@/lib/nav/routes';
import { navigateUp } from '@/lib/nav/store';
import { setTitle, useTitle } from '@/lib/nav/titles';
import { cn } from '@/lib/utils';
import { useOptionalLayer } from './stack-context';

export type ScreenProps = {
  /** The screen's name: the large title, the inline title and the back label on the next screen. */
  title: string;
  /** A 34 px title that collapses into the bar as you scroll. Defaults to on for tab roots. */
  largeTitle?: boolean;
  /** Scrolls with the large title: a search field, filter chips. */
  header?: React.ReactNode;
  /** Buttons at the trailing end of the nav bar. */
  actions?: React.ReactNode;
  /** Replaces the back button. */
  leading?: React.ReactNode;
  /** Pinned to the bottom, above the tab bar and the keyboard (Ask's composer). */
  footer?: React.ReactNode;
  /** `grouped` (default) for lists and settings; `plain` for reading. */
  surface?: 'grouped' | 'plain';
  className?: string;
  children?: React.ReactNode;
};

/** iOS shortens the back label to "Back" when the previous title won't fit. */
function backLabel(title: string): string {
  return title.length > 14 ? 'Back' : title;
}

function BackButton({ parentKey, parentTitle }: { parentKey: string; parentTitle: string }) {
  const label = backLabel(parentTitle);
  return (
    <a
      href={parentKey}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigateUp(parentKey);
      }}
      aria-label={label === 'Back' ? `Back to ${parentTitle}` : `Back to ${label}`}
      data-back
      className="group -ml-1 flex h-11 min-w-11 items-center gap-0.5 rounded-button pr-2 text-[17px] leading-[22px] tracking-[var(--tracking-body)] text-primary-text select-none active:opacity-40"
    >
      <ChevronLeft className="size-7 shrink-0" strokeWidth={2.25} aria-hidden />
      <span className="truncate">{label}</span>
    </a>
  );
}

/**
 * A screen in a tab's stack: its own scroller with a sticky nav bar and an optional large title.
 *
 * The bar starts transparent; once content scrolls under it, it turns to translucent material,
 * and (with a large title) the title moves into the bar. An IntersectionObserver flips one
 * attribute, so scrolling never re-renders React.
 */
export function Screen({
  title,
  largeTitle,
  header,
  actions,
  leading,
  footer,
  surface = 'grouped',
  className,
  children,
}: ScreenProps) {
  const layer = useOptionalLayer();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const navbarRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const isLarge = largeTitle ?? (layer ? layer.depth === 0 : true);

  const parent = layer?.parent ?? null;
  const parentTitle = useTitle(parent?.key, parent ? DEFAULT_TITLE[parent.kind] : '');
  const showBack = parent !== null;

  // Publish the title for the back button on the screen above.
  const key = layer?.entry.key;
  useLayoutEffect(() => {
    if (key) setTitle(key, title);
  }, [key, title]);

  // Keep the scroll position across tab switches (hidden tabs drop it) and register for
  // "scroll to top" when the active tab is tapped again.
  const registerScroller = layer?.registerScroller;
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (savedScroll.current) el.scrollTop = savedScroll.current;
    const onScroll = () => {
      savedScroll.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    if (key) registerScroller?.(key, el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (key) registerScroller?.(key, null);
    };
  }, [key, registerScroller]);

  // Collapse: the large title (or the very top of the content) passing under the bar.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const sentinel = sentinelRef.current;
    const navbar = navbarRef.current;
    if (!scroller || !sentinel || !navbar) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        scroller.toggleAttribute('data-collapsed', !entry.isIntersecting);
      },
      { root: scroller, rootMargin: `-${navbar.offsetHeight}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isLarge]);

  return (
    <div
      ref={scrollerRef}
      className={cn('screen', className)}
      data-surface={surface}
      data-large-title={isLarge ? '' : undefined}
      data-has-footer={footer ? '' : undefined}
    >
      <header ref={navbarRef} className="navbar">
        <div className="navbar-bg material-bar" aria-hidden />
        <div className="navbar-row">
          <div className="navbar-leading">
            {leading ??
              (showBack && parent && (
                <BackButton parentKey={parent.key} parentTitle={parentTitle} />
              ))}
          </div>
          <div className="navbar-title" aria-hidden={isLarge || undefined}>
            {title}
          </div>
          <div className="navbar-trailing">{actions}</div>
        </div>
      </header>

      {isLarge ? (
        <div className="large-title">
          <h1 tabIndex={-1} data-screen-title className="text-large-title">
            {title}
          </h1>
          <div ref={sentinelRef} aria-hidden className="h-px" />
        </div>
      ) : (
        <>
          <h1 tabIndex={-1} data-screen-title className="sr-only">
            {title}
          </h1>
          <div ref={sentinelRef} aria-hidden className="h-px" />
        </>
      )}

      {header}
      <div className="screen-content">{children}</div>
      {footer && <div className="screen-footer">{footer}</div>}
    </div>
  );
}
