'use client';

import { memo } from 'react';
import { ChevronsUpDown, Plus, Search } from 'lucide-react';
import { Kbd, ModKey } from '@/components/ui/kbd';
import type { Tab } from '@/lib/nav/routes';
import { cn } from '@/lib/utils';
import { emitShellEvent } from './shell-events';
import { selectTab } from './tab-bar';
import { TAB_ITEMS } from './tabs';

function SidebarItem({
  tab,
  label,
  icon: Icon,
  active,
}: (typeof TAB_ITEMS)[number] & { active: Tab }) {
  const selected = tab === active;
  return (
    <a
      href={`/${tab}`}
      aria-current={selected ? 'page' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        selectTab(tab, active);
      }}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-button px-3 text-[16px] leading-6 select-none can-hover:min-h-9',
        'transition-colors duration-150 hover:bg-fill-subtle active:bg-fill',
        selected && 'bg-fill font-semibold text-primary-text hover:bg-fill',
      )}
    >
      <Icon
        aria-hidden
        className={cn('size-5.5', selected && 'fill-current/15')}
        strokeWidth={selected ? 2 : 1.75}
      />
      {label}
    </a>
  );
}

/**
 * Tablet and desktop navigation (brief §9): workspace switcher, search (⌘K), the sections, and
 * the new-item button. Translucent like the tab bar.
 */
export const Sidebar = memo(function Sidebar({ active }: { active: Tab }) {
  return (
    <aside className="sidebar material-bar" aria-label="Sidebar">
      <div className="flex flex-col gap-1 px-3 pt-3">
        <button
          type="button"
          className="flex min-h-11 items-center gap-2.5 rounded-button px-2 text-left select-none hover:bg-fill-subtle active:bg-fill can-hover:min-h-10"
          aria-label="Workspace: Kestrel Labs (sample)"
        >
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-sm bg-primary text-[14px] font-bold text-primary-foreground"
          >
            K
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] leading-5 font-semibold">Kestrel Labs</span>
            <span className="block text-caption text-muted-foreground">Sample workspace</span>
          </span>
          <ChevronsUpDown aria-hidden className="size-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => emitShellEvent('open-palette')}
          aria-keyshortcuts="Meta+K Control+K /"
          className="mt-2 flex min-h-10 items-center gap-2 rounded-input bg-fill px-3 text-left text-[16px] text-muted-foreground select-none hover:bg-fill-strong"
        >
          <Search aria-hidden className="size-4.5" />
          <span className="flex-1">Search</span>
          <span aria-hidden className="flex gap-1">
            <Kbd className="bg-fill-strong">
              <ModKey />
            </Kbd>
            <Kbd className="bg-fill-strong">K</Kbd>
          </span>
        </button>
      </div>

      <nav aria-label="Sections" className="mt-4 flex flex-col gap-0.5 px-3">
        {TAB_ITEMS.filter((t) => t.tab !== 'profile').map((item) => (
          <SidebarItem key={item.tab} {...item} active={active} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 px-3 pb-3">
        <button
          type="button"
          onClick={() => emitShellEvent('open-add')}
          aria-keyshortcuts="N"
          className="flex min-h-11 items-center gap-3 rounded-button px-3 text-[16px] leading-6 font-semibold text-primary-text select-none hover:bg-primary-tint active:bg-primary-tint-strong can-hover:min-h-9"
        >
          <Plus aria-hidden className="size-5.5" strokeWidth={2} />
          New
        </button>
        <SidebarItem {...TAB_ITEMS.find((t) => t.tab === 'profile')!} active={active} />
      </div>
    </aside>
  );
});
