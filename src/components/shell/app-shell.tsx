'use client';

import { Activity, useEffect } from 'react';
import { useNav } from '@/lib/nav/hooks';
import { DEFAULT_TITLE, TABS, parseStack, tabOf } from '@/lib/nav/routes';
import { startNavigation } from '@/lib/nav/store';
import { useTitle } from '@/lib/nav/titles';
import { renderScreen, renderPlaceholder } from '@/screens';
import { Fab } from './fab';
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

/**
 * The product shell (brief §9): five tabs, each a stack kept alive in an <Activity> so its
 * screens, scroll positions and state survive tab switches. Phones get the tab bar and the +
 * button; tablets a sidebar; wide windows a sidebar with list and detail panes.
 */
export function AppShell() {
  const nav = useNav();
  const active = tabOf(nav.pathname) ?? 'home';
  const title = useDocumentTitle(nav.pathname);

  useEffect(() => startNavigation(), []);

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
            <Activity key={tab} mode={tab === active ? 'visible' : 'hidden'} name={tab}>
              <div className="tab-root" data-tab={tab}>
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
        <TabBar active={active} />
        <Fab hidden={active === 'ask'} />
      </div>
      {/* Screen readers hear where they landed after every navigation. */}
      <div aria-live="polite" aria-atomic className="sr-only">
        {title}
      </div>
    </div>
  );
}
