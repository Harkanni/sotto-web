'use client';

import { memo } from 'react';
import type { Tab } from '@/lib/nav/routes';
import { navigate, tabHref } from '@/lib/nav/store';
import { cn } from '@/lib/utils';
import { emitShellEvent } from './shell-events';
import { TAB_ITEMS } from './tabs';

/** Switch tabs, or (on the active tab) pop to its root and then scroll to the top. */
export function selectTab(tab: Tab, active: Tab) {
  if (tab === active) emitShellEvent('tab-reselect', tab);
  else navigate(tabHref(tab), { intent: 'none' });
}

/**
 * The phone tab bar (brief §9): translucent, five items with icon and label, the active one in
 * indigo. Each tab keeps its own stack, so switching returns to where you left it.
 */
export const TabBar = memo(function TabBar({ active }: { active: Tab }) {
  return (
    <nav aria-label="Tabs" className="tab-bar material-bar">
      {TAB_ITEMS.map(({ tab, label, icon: Icon }) => {
        const selected = tab === active;
        return (
          <a
            key={tab}
            // The root URL keeps server and client markup identical; the click goes to wherever
            // the tab was left.
            href={`/${tab}`}
            aria-current={selected ? 'page' : undefined}
            data-tab={tab}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              selectTab(tab, active);
            }}
            className={cn(
              'group flex min-w-0 flex-col items-center justify-start gap-0.5 pt-1.5 select-none',
              'text-muted-foreground transition-colors duration-150',
              selected && 'text-primary-text',
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'size-6.5 transition-transform duration-300 ease-snappy group-active:scale-[0.86] group-active:duration-75',
                selected && 'fill-current/15',
              )}
              strokeWidth={selected ? 2 : 1.75}
            />
            <span className="text-[12px] leading-4 font-medium tracking-[0.01em]">{label}</span>
          </a>
        );
      })}
    </nav>
  );
});
