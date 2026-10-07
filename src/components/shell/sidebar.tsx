'use client';

import { memo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Search, Settings } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { CreateWorkspaceSheet, useSwitchWorkspace } from '@/components/account/workspace-actions';
import { WorkspaceTile } from '@/components/account/workspace-tile';
import { Kbd, ModKey } from '@/components/ui/kbd';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ProgressRing } from '@/components/uploads/transfers';
import { useActiveWorkspace, useWorkspaces } from '@/lib/api/hooks';
import type { Tab } from '@/lib/nav/routes';
import { navigate } from '@/lib/nav/store';
import { ROLE_LABEL } from '@/lib/roles';
import { useCanAdd } from '@/lib/uploads/permissions';
import { overallProgress, useUploads } from '@/lib/uploads/store';
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
        selected && 'bg-fill font-semibold text-primary-text-strong hover:bg-fill',
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
 * The workspace you're in, and a menu to switch to another, make a new one, or open its
 * settings. The list loads when the menu first opens.
 */
function WorkspaceSwitcher() {
  const workspace = useActiveWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const workspaces = useWorkspaces(menuOpen || Boolean(workspace));
  const { switchTo, pendingId } = useSwitchWorkspace();
  const people = workspaces.data?.find((w) => w.active)?.members;

  return (
    <>
      <DropdownMenu.Root modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger
          className="flex min-h-11 items-center gap-2.5 rounded-button px-2 text-left outline-offset-2 select-none hover:bg-fill-subtle focus-visible:outline-2 focus-visible:outline-ring active:bg-fill data-[state=open]:bg-fill can-hover:min-h-10"
          aria-label={workspace ? `Workspace: ${workspace.name}` : 'Workspace'}
        >
          {workspace ? (
            <WorkspaceTile name={workspace.name} />
          ) : (
            <Skeleton className="size-7 rounded-sm" />
          )}
          <span className="min-w-0 flex-1">
            {workspace ? (
              <>
                <span className="block truncate text-[15px] leading-5 font-semibold">
                  {workspace.name}
                </span>
                <span className="block truncate text-caption text-muted-foreground">
                  {ROLE_LABEL[workspace.role]}
                  {people !== undefined && `, ${people} ${people === 1 ? 'person' : 'people'}`}
                </span>
              </>
            ) : (
              <>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1 h-3 w-16" />
              </>
            )}
          </span>
          <ChevronsUpDown aria-hidden className="size-4 text-muted-foreground" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            collisionPadding={12}
            className={cn(menuContent, 'w-[248px]')}
          >
            <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-footnote text-muted-foreground">
              Workspaces
            </DropdownMenu.Label>
            {workspaces.data ? (
              workspaces.data.map((w) => (
                <DropdownMenu.Item
                  key={w.id}
                  className={menuItem}
                  disabled={Boolean(pendingId)}
                  onSelect={() => {
                    if (!w.active) switchTo(w.id);
                  }}
                >
                  <WorkspaceTile name={w.name} />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  {pendingId === w.id ? (
                    <Spinner size={16} className="text-muted-foreground" />
                  ) : (
                    w.active && (
                      <Check
                        aria-label="Active"
                        className="size-5 text-primary-text"
                        strokeWidth={2.25}
                      />
                    )
                  )}
                </DropdownMenu.Item>
              ))
            ) : (
              <div className="flex min-h-11 items-center px-3" aria-busy>
                <Spinner size={16} className="text-muted-foreground" />
              </div>
            )}
            <DropdownMenu.Separator className="mx-1 my-1 h-px bg-separator" />
            <DropdownMenu.Item className={menuItem} onSelect={() => setCreating(true)}>
              <span className="flex-1">New workspace</span>
              <Plus aria-hidden className="size-5 text-muted-foreground" />
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => navigate('/profile/workspace')}>
              <span className="flex-1">Workspace settings</span>
              <Settings aria-hidden className="size-5 text-muted-foreground" />
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <CreateWorkspaceSheet open={creating} onOpenChange={setCreating} />
    </>
  );
}

/**
 * Tablet and desktop navigation (brief §9): workspace switcher, search (⌘K), the sections, and
 * the new-item button. Translucent like the tab bar.
 */
export const Sidebar = memo(function Sidebar({ active }: { active: Tab }) {
  const canAdd = useCanAdd();
  const progress = overallProgress(useUploads());
  return (
    <aside className="sidebar material-bar" aria-label="Sidebar">
      <div className="flex flex-col gap-1 px-3 pt-3">
        <WorkspaceSwitcher />
        <button
          type="button"
          onClick={() => emitShellEvent('open-palette')}
          aria-keyshortcuts="Meta+K Control+K /"
          className="mt-2 flex min-h-10 items-center gap-2 rounded-input bg-fill px-3 text-left text-[16px] text-foreground/65 select-none hover:bg-fill-strong"
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
        {canAdd && (
          <button
            type="button"
            onClick={() => emitShellEvent('open-add')}
            aria-keyshortcuts="N"
            aria-label={progress === null ? 'New' : `New, uploading ${Math.round(progress * 100)}%`}
            className="flex min-h-11 items-center gap-3 rounded-button px-3 text-[16px] leading-6 font-semibold text-primary-text select-none hover:bg-primary-tint active:bg-primary-tint-strong can-hover:min-h-9"
          >
            <span className="grid size-6 place-items-center">
              <Plus aria-hidden className="col-start-1 row-start-1 size-5.5" strokeWidth={2} />
              <ProgressRing
                progress={progress}
                size={28}
                stroke={2}
                className="col-start-1 row-start-1"
              />
            </span>
            New
          </button>
        )}
        <SidebarItem {...TAB_ITEMS.find((t) => t.tab === 'profile')!} active={active} />
      </div>
    </aside>
  );
});
