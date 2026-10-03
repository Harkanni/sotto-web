'use client';

import { Check, ChevronsUpDown, UserPlus } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ListRow, RowIcon } from '@/components/ui/list';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { AsyncWidget } from '@/components/widgets/async-widget';
import type { Schemas } from '@/lib/api/client';
import { useMembers, usePermissions, useSetPermissions, type Collection } from '@/lib/api/hooks';
import { ACCESS_LABEL, ROLE_LABEL, atLeast, type Access, type Role } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { RESTRICTED_HINT } from './collection-sheets';
import { RowsSkeleton } from '@/screens/parts/rows';

type Permissions = Schemas['CollectionPermissions'];
type Choice = Access | 'none';

/** What the sheet edits. Mirrors the API's rules (sotto-api `collectionAccess`). */
export type AccessDraft = {
  restricted: boolean;
  /** Grants to everyone with a role. */
  member: Access | null;
  viewer: Access | null;
  /** Grants to one person. */
  people: { userId: string; access: Access; name: string; email: string }[];
  /** Role grants this sheet doesn't show (admins and owners always manage), sent back as-is. */
  kept: { role: Role; access: Access }[];
};

const RANK: Record<Access, number> = { view: 0, edit: 1, manage: 2 };

function higher(a: Access | null, b: Access | null): Access | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

export function draftOf(p: Permissions): AccessDraft {
  const draft: AccessDraft = {
    restricted: p.restricted,
    member: null,
    viewer: null,
    people: [],
    kept: [],
  };
  for (const g of p.grants) {
    if (g.userId) {
      draft.people.push({
        userId: g.userId,
        access: g.access,
        name: g.user?.name ?? '',
        email: g.user?.email ?? '',
      });
    } else if (g.role === 'member' || g.role === 'viewer') draft[g.role] = g.access;
    else if (g.role) draft.kept.push({ role: g.role, access: g.access });
  }
  return draft;
}

export function bodyOf(d: AccessDraft): Schemas['PutPermissions'] {
  return {
    restricted: d.restricted,
    grants: [
      ...(d.member ? [{ role: 'member' as const, access: d.member }] : []),
      ...(d.viewer ? [{ role: 'viewer' as const, access: d.viewer }] : []),
      ...d.kept,
      ...d.people.map((p) => ({ userId: p.userId, access: p.access })),
    ],
  };
}

/**
 * What everyone with a role gets: restricted, only their grant; open, members edit and viewers
 * view, raised by a grant. Viewers never get more than View.
 */
export function effectiveFor(role: 'member' | 'viewer', d: AccessDraft): Access | null {
  const base: Access | null = d.restricted ? null : role === 'viewer' ? 'view' : 'edit';
  const access = higher(base, d[role]);
  return role === 'viewer' && access ? 'view' : access;
}

/** The choices that mean something for a role in this mode. */
export function roleChoices(role: 'member' | 'viewer', restricted: boolean): Choice[] {
  if (role === 'viewer') return restricted ? ['none', 'view'] : ['view'];
  return restricted ? ['none', 'view', 'edit', 'manage'] : ['edit', 'manage'];
}

/** The grant that gives a role the chosen access (none when the base already does). */
export function grantFor(role: 'member' | 'viewer', restricted: boolean, choice: Choice) {
  if (choice === 'none') return null;
  if (!restricted && (role === 'viewer' || choice === 'edit' || choice === 'view')) return null;
  return choice;
}

const CHOICE_LABEL: Record<Choice, string> = { none: 'No access', ...ACCESS_LABEL };

/** An iOS-style menu picker: the value in grey with ⇅, opening a menu of choices. */
function AccessPicker({
  label,
  value,
  choices,
  onChange,
  onRemove,
}: {
  label: string;
  value: Choice;
  choices: Choice[];
  onChange: (choice: Choice) => void;
  onRemove?: () => void;
}) {
  if (choices.length <= 1 && !onRemove) {
    return <span className="shrink-0 text-body text-muted-foreground">{CHOICE_LABEL[value]}</span>;
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`${label}: ${CHOICE_LABEL[value]}`}
        className={cn(
          '-my-1 -mr-2 flex h-11 shrink-0 items-center gap-1 rounded-button px-2 text-body text-muted-foreground select-none',
          'outline-offset-[-2px] hover:bg-fill-subtle focus-visible:outline-2 focus-visible:outline-ring active:bg-fill data-[state=open]:bg-fill',
        )}
      >
        {CHOICE_LABEL[value]}
        <ChevronsUpDown aria-hidden className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className={menuContent}
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={(v) => onChange(v as Choice)}>
            {choices.map((choice) => (
              <DropdownMenu.RadioItem key={choice} value={choice} className={menuItem}>
                <span className="flex-1">{CHOICE_LABEL[choice]}</span>
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden className="size-5 text-primary-text" strokeWidth={2.25} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {onRemove && (
            <>
              <DropdownMenu.Separator className="mx-1 my-1 h-px bg-separator" />
              <DropdownMenu.Item
                className={cn(menuItem, 'text-destructive-text')}
                onSelect={onRemove}
              >
                Remove
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// #2C2C2E in dark mode, like menus: indigo text needs the elevated shade to hold 4.5:1.
const nested =
  'surface-elevated overflow-hidden rounded-card bg-card-nested [--surface:var(--card-nested)]';

function AccessForm({
  collection,
  initial,
  onDone,
}: {
  collection: Collection;
  initial: Permissions;
  onDone: () => void;
}) {
  const members = useMembers();
  const save = useSetPermissions();
  const [draft, setDraft] = useState(() => draftOf(initial));
  const changed = JSON.stringify(bodyOf(draft)) !== JSON.stringify(bodyOf(draftOf(initial)));
  const roleOf = new Map((members.data?.members ?? []).map((m) => [m.userId, m.role]));
  const listed = new Set(draft.people.map((p) => p.userId));
  const candidates = (members.data?.members ?? []).filter(
    (m) => !listed.has(m.userId) && !atLeast(m.role, 'admin'),
  );

  const setRole = (role: 'member' | 'viewer', choice: Choice) =>
    setDraft((d) => ({ ...d, [role]: grantFor(role, d.restricted, choice) }));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-6 pt-1 pb-4">
        <section aria-label="Restricted" className="flex flex-col gap-1.5 px-[var(--gutter)]">
          <label className="flex min-h-11 items-center gap-3 rounded-card bg-card-nested py-1.5 pr-3 pl-4 text-body select-none">
            <span className="flex-1">Restricted</span>
            <Switch
              checked={draft.restricted}
              onCheckedChange={(restricted) => setDraft((d) => ({ ...d, restricted }))}
            />
          </label>
          <p className="px-4 text-footnote text-muted-foreground">
            {draft.restricted ? RESTRICTED_HINT.restricted : RESTRICTED_HINT.open}
          </p>
        </section>

        <section aria-label="Roles" className="px-[var(--gutter)]">
          <h3 className="px-4 pb-1.5 text-footnote text-muted-foreground">Roles</h3>
          <ul className={nested}>
            <ListRow title="Admins and owners" detail="Manage" />
            {(['member', 'viewer'] as const).map((role) => (
              <ListRow
                key={role}
                title={`${ROLE_LABEL[role]}s`}
                trailing={
                  <AccessPicker
                    label={`${ROLE_LABEL[role]}s`}
                    value={effectiveFor(role, draft) ?? 'none'}
                    choices={roleChoices(role, draft.restricted)}
                    onChange={(choice) => setRole(role, choice)}
                  />
                }
              />
            ))}
          </ul>
        </section>

        <section aria-label="People" className="px-[var(--gutter)]">
          <h3 className="px-4 pb-1.5 text-footnote text-muted-foreground">People</h3>
          <ul className={nested}>
            {draft.people.map((person) => {
              const role = roleOf.get(person.userId);
              const always = atLeast(role, 'admin');
              const viewer = role === 'viewer';
              return (
                <ListRow
                  key={person.userId}
                  leading={<Avatar name={person.name || person.email} />}
                  title={person.name || person.email}
                  subtitle={
                    always
                      ? `${ROLE_LABEL[role!]}, always manages`
                      : viewer
                        ? 'Viewer, can only view'
                        : person.email
                  }
                  trailing={
                    always ? (
                      <span className="shrink-0 text-body text-muted-foreground">Manage</span>
                    ) : (
                      <AccessPicker
                        label={person.name || person.email}
                        value={viewer ? 'view' : person.access}
                        choices={viewer ? ['view'] : ['view', 'edit', 'manage']}
                        onChange={(choice) =>
                          setDraft((d) => ({
                            ...d,
                            people: d.people.map((p) =>
                              p.userId === person.userId && choice !== 'none'
                                ? { ...p, access: choice }
                                : p,
                            ),
                          }))
                        }
                        onRemove={() =>
                          setDraft((d) => ({
                            ...d,
                            people: d.people.filter((p) => p.userId !== person.userId),
                          }))
                        }
                      />
                    )
                  }
                />
              );
            })}
            <li className="list-row relative">
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger
                  disabled={candidates.length === 0}
                  className={cn(
                    'flex w-full items-stretch pl-4 text-left text-body text-primary-text select-none',
                    'outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-ring',
                    'transition-[background-color] duration-300 ease-out active:bg-row-pressed can-hover:hover:bg-fill-subtle data-[state=open]:bg-fill',
                    'disabled:pointer-events-none disabled:text-muted-foreground',
                  )}
                >
                  <span className="flex shrink-0 items-center py-2 pr-3">
                    <RowIcon icon={UserPlus} tint="indigo" />
                  </span>
                  <span className="row-main flex min-h-11 flex-1 items-center py-[11px] pr-4">
                    {candidates.length || !members.data ? 'Add a person' : 'Everyone is listed'}
                  </span>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="start"
                    sideOffset={4}
                    collisionPadding={12}
                    className={cn(
                      menuContent,
                      'max-h-[min(360px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto',
                    )}
                  >
                    {candidates.map((m) => (
                      <DropdownMenu.Item
                        key={m.userId}
                        className={menuItem}
                        onSelect={() =>
                          setDraft((d) => ({
                            ...d,
                            people: [
                              ...d.people,
                              { userId: m.userId, access: 'view', name: m.name, email: m.email },
                            ],
                          }))
                        }
                      >
                        <Avatar name={m.name || m.email} size={24} />
                        <span className="min-w-0 flex-1 truncate">{m.name || m.email}</span>
                        <span className="text-subhead text-muted-foreground">
                          {ROLE_LABEL[m.role]}
                        </span>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </li>
          </ul>
          <p className="px-4 pt-1.5 text-footnote text-muted-foreground">
            A person’s access adds to their role’s. Viewers only ever view.
          </p>
        </section>
      </div>
      <div className="sticky bottom-0 bg-card px-[var(--gutter)] pt-2 pb-1">
        <Button
          className="w-full"
          disabled={!changed}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              { id: collection.id, body: bodyOf(draft) },
              {
                onSuccess: () => {
                  onDone();
                  toast('Access updated', { description: collection.name });
                },
                onError: (e) => toast(messageOf(e)),
              },
            )
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/** Who can open a collection (admins and owners): restricted or open, roles and people. */
export function AccessSheet({
  collection,
  open,
  onOpenChange,
}: {
  collection: Collection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const permissions = usePermissions(collection?.id ?? '', open && Boolean(collection));
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Who has access"
      description={collection?.name}
      detents={['large']}
    >
      {collection && (
        <AsyncWidget
          query={permissions}
          label="Access"
          errorTitle="Couldn’t load who has access"
          isEmpty={() => false}
          empty={{ illustration: 'team', title: 'No one has access' }}
          skeleton={
            <div className="px-[var(--gutter)] pt-1">
              <RowsSkeleton rows={4} round />
            </div>
          }
          className="h-full"
        >
          {(data) => (
            <AccessForm
              key={permissions.dataUpdatedAt}
              collection={collection}
              initial={data}
              onDone={() => onOpenChange(false)}
            />
          )}
        </AsyncWidget>
      )}
    </Sheet>
  );
}
