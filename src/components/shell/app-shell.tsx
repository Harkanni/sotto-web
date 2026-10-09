'use client';

import { Activity, memo, startTransition, useEffect, useState } from 'react';
import type { Tab } from '@/lib/nav/routes';
import { useNav } from '@/lib/nav/hooks';
import { DEFAULT_TITLE, TABS, parseStack, tabOf } from '@/lib/nav/routes';
import { startNavigation } from '@/lib/nav/store';
import { useTitle } from '@/lib/nav/titles';
import { Toaster } from '@/components/ui/toaster';
import { NoteSheet } from '@/components/ask/note-sheet';
import { RecorderSheet } from '@/components/uploads/recorder-sheet';
import { UploadSync } from '@/components/uploads/upload-sync';
import { renderScreen, renderPlaceholder } from '@/screens';
import { AddSheet } from './add-sheet';
import { CommandPalette } from './command-palette';
import { DropOverlay } from './drop-overlay';
import { Fab } from './fab';
import { LabelSheet, MoveSheet, RenameSheet, TagsSheet } from './item-sheets';
import { ScreenWarmup } from './screen-warmup';
import { ServiceWorker } from './service-worker';
import { OfflineBanner, ThemeColorSync, useVisualViewport } from './system';
import { ShortcutsSheet, useKeyboardShortcuts } from './shortcuts';
import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';
import { TabStack } from './tab-stack';

const PLACEHOLDERS = Object.fromEntries(TABS.map((tab) => [tab, renderPlaceholder(tab)])) as Record<
  (typeof TABS)[number],
  React.ReactNode
>;

function useDocumentTitle(pathname: string) {
  const stack = parseStack(pathname);
  const top = stack[stack.length - 1];
  const title = useTitle(top?.key, top ? DEFAULT_TITLE[top.kind] : 'Sotto');
  useEffect(() => {
    document.title = `${title} · Sotto`;
  }, [title]);
  return title;
}

/** Sheets, toasts and banners: rendered once, never re-rendered by navigation. */
const Overlays = memo(function Overlays() {
  return (
    <>
      <AddSheet />
      <RecorderSheet />
      <NoteSheet />
      <UploadSync />
      <MoveSheet />
      <RenameSheet />
      <LabelSheet />
      <TagsSheet />
      <CommandPalette />
      <ShortcutsSheet />
      <DropOverlay />
      <Toaster />
      <ThemeColorSync />
      <ServiceWorker />
    </>
  );
});

/**
 * The product shell (brief §9): five tabs, each a stack kept alive in an <Activity> so its
 * screens, scroll positions and state survive tab switches. Phones get the tab bar and the +
 * button; tablets a sidebar; wide windows a sidebar with list and detail panes.
 */
export function AppShell() {
  const nav = useNav();
  const active = tabOf(nav.pathname) ?? 'home';
  const title = useDocumentTitle(nav.pathname);

  // Tabs you haven't opened yet wait in a hidden <Activity> (pre-rendered at idle priority, no
  // effects). Once opened, a tab stays live and is merely not rendered while you're elsewhere
  // (content-visibility), so switching back is a style change, not a re-mount: instant, with
  // scroll positions intact.
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set(visited).add(active));

  // Once the first screen has settled, wake the other tabs one at a time while nothing else is
  // happening: their effects mount and their data loads in the background, so even the first
  // visit to a tab is the cheap switch (a style change) rather than a reveal.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    let remaining = TABS.length - 1;
    const wakeNext = () => {
      const run = () => {
        if (cancelled) return;
        startTransition(() =>
          setVisited((prev) => {
            const tab = TABS.find((t) => !prev.has(t));
            return tab ? new Set(prev).add(tab) : prev;
          }),
        );
        // A gap between tabs keeps each wake-up small.
        if (--remaining > 0) timer = setTimeout(wakeNext, 300);
      };
      if (typeof window.requestIdleCallback === 'function')
        idle = window.requestIdleCallback(run, { timeout: 4000 });
      else timer = setTimeout(run, 200);
    };
    timer = setTimeout(wakeNext, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, []);

  useEffect(() => startNavigation(), []);
  useVisualViewport();
  useKeyboardShortcuts(active);

  // The shell owns scrolling (the boot script sets this too, before first paint).
  useEffect(() => {
    document.documentElement.dataset.app = '';
    return () => {
      delete document.documentElement.dataset.app;
    };
  }, []);

  // iOS Safari only applies :active styles on touch when a touchstart listener exists.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener('touchstart', noop, { passive: true });
    return () => document.removeEventListener('touchstart', noop);
  }, []);

  return (
    <div data-app-shell>
      <div className="shell-surface" data-shell-surface>
        <Sidebar active={active} />
        <main className="shell-main" aria-label={title}>
          {TABS.map((tab) => (
            <Activity key={tab} mode={visited.has(tab) ? 'visible' : 'hidden'} name={tab}>
              <div
                className="tab-root"
                data-tab={tab}
                data-active={tab === active ? '' : undefined}
              >
                <TabStack
                  tab={tab}
                  href={nav.tabs[tab]}
                  active={tab === active}
                  // Only the active tab animates; constant props keep the others from rendering.
                  intent={tab === active ? nav.intent : 'none'}
                  uaTransition={tab === active && nav.uaTransition}
                  renderScreen={renderScreen}
                  placeholder={PLACEHOLDERS[tab]}
                />
              </div>
            </Activity>
          ))}
        </main>
        <OfflineBanner />
        <TabBar active={active} />
        <Fab hidden={active === 'ask'} />
      </div>
      <Overlays />
      <ScreenWarmup renderScreen={renderScreen} />
      {/* Screen readers hear where they landed after every navigation. */}
      <div aria-live="polite" aria-atomic className="sr-only">
        {title}
      </div>
    </div>
  );
}
