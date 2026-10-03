'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  ChevronDown,
  Download,
  FolderClosed,
  Mail,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Screen } from '@/components/shell/screen';
import { Button } from '@/components/ui/button';
import { List, ListRow, RowIcon } from '@/components/ui/list';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import {
  downloadAuditCsv,
  useActiveWorkspace,
  useAuditLog,
  useMembers,
  type AuditEntry,
  type AuditFilters,
} from '@/lib/api/hooks';
import { dateAndTime, dayHeading, timeOfDay } from '@/lib/format';
import { atLeast } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { ChipGroup } from './parts/chips';
import { RowsSkeleton } from './parts/rows';

type Kind = 'all' | 'member' | 'invite' | 'collection' | 'workspace';
type Period = '7d' | '30d' | 'all';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'member', label: 'People' },
  { value: 'invite', label: 'Invites' },
  { value: 'collection', label: 'Collections' },
  { value: 'workspace', label: 'Workspace' },
];

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

const GROUP_ICON: Record<
  string,
  { icon: LucideIcon; tint: Parameters<typeof RowIcon>[0]['tint'] }
> = {
  member: { icon: Users, tint: 'blue' },
  invite: { icon: Mail, tint: 'teal' },
  collection: { icon: FolderClosed, tint: 'orange' },
  workspace: { icon: Building2, tint: 'indigo' },
  audit: { icon: Download, tint: 'gray' },
  onboarding: { icon: Sparkles, tint: 'purple' },
};

const TARGET_LABEL: Record<string, string> = {
  member: 'Person',
  invite: 'Invite',
  collection: 'Collection',
  workspace: 'Workspace',
  audit: 'Audit log',
};

function iconFor(entry: AuditEntry) {
  return GROUP_ICON[entry.action.split('.')[0]!] ?? GROUP_ICON.workspace!;
}

function startOf(period: Period, now = Date.now()): string | undefined {
  if (period === 'all') return undefined;
  const days = period === '7d' ? 7 : 30;
  const d = new Date(now - days * 24 * 3600_000);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** One entry: what happened (wrapping, never cut off), who did it and when. */
function AuditRow({ entry, onOpen }: { entry: AuditEntry; onOpen: () => void }) {
  const { icon, tint } = iconFor(entry);
  return (
    <li className="list-row relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group/row flex w-full items-stretch pl-4 text-left select-none outline-offset-[-2px]',
          'transition-[background-color] duration-300 ease-out active:bg-row-pressed active:delay-[40ms] active:duration-0',
          'can-hover:hover:bg-fill-subtle',
        )}
      >
        <span className="flex shrink-0 items-start py-[11px] pr-3">
          <RowIcon icon={icon} tint={tint} />
        </span>
        <span className="row-main flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 py-[11px] pr-4">
          <span className="text-body text-pretty">{entry.summary}</span>
          <span className="truncate text-subhead text-muted-foreground">
            {entry.actor?.name || entry.actor?.email || 'Sotto'},{' '}
            {timeOfDay(new Date(entry.at).getTime())}
          </span>
        </span>
      </button>
    </li>
  );
}

function EntrySheet({
  entry,
  open,
  onOpenChange,
}: {
  entry: AuditEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Audit entry" description={entry?.summary}>
      {entry && (
        <ul className="mx-[var(--gutter)] mb-2 overflow-hidden rounded-card bg-card-nested [--surface:var(--card-nested)]">
          <ListRow title="When" detail={dateAndTime(new Date(entry.at).getTime())} />
          <ListRow
            title="Who"
            detail={entry.actor ? entry.actor.name || entry.actor.email : 'Sotto'}
          />
          {entry.actor?.name && <ListRow title="Email" detail={entry.actor.email} />}
          <ListRow title="Affected" detail={TARGET_LABEL[entry.target.type] ?? entry.target.type} />
          <ListRow title="IP address" detail={entry.ip ?? 'Not recorded'} />
          <ListRow
            title="Action"
            detail={<code className="font-mono text-[15px]">{entry.action}</code>}
          />
        </ul>
      )}
    </Sheet>
  );
}

/** "Anyone" or one person, from the workspace's members. */
function PersonFilter({
  value,
  onValueChange,
}: {
  value: string | undefined;
  onValueChange: (id: string | undefined) => void;
}) {
  const members = useMembers();
  const people = members.data?.members ?? [];
  const chosen = people.find((m) => m.userId === value);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" className="-mr-2 max-w-[60%]" aria-label="Filter by person">
          <span className="truncate">{chosen ? chosen.name || chosen.email : 'Anyone'}</span>
          <ChevronDown aria-hidden className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className={cn(
            menuContent,
            'max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto',
          )}
        >
          <DropdownMenu.RadioGroup
            value={value ?? ''}
            onValueChange={(v) => onValueChange(v || undefined)}
          >
            {[
              { userId: '', label: 'Anyone' },
              ...people.map((m) => ({ userId: m.userId, label: m.name || m.email })),
            ].map((option) => (
              <DropdownMenu.RadioItem
                key={option.userId}
                value={option.userId}
                className={menuItem}
              >
                <span className="flex-1 truncate">{option.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden className="size-5 text-primary-text" strokeWidth={2.25} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Who changed what, filtered by kind, period and person, with a CSV download (admins). */
export function AuditScreen() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  const admin = atLeast(workspace?.role, 'admin');
  const [kind, setKind] = useState<Kind>('all');
  const [period, setPeriod] = useState<Period>('30d');
  const [actor, setActor] = useState<string | undefined>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [{ entry: shown, open }, setSheet] = useState<{ entry: AuditEntry | null; open: boolean }>({
    entry: null,
    open: false,
  });

  // The period's start is fixed when it's chosen, so the query key doesn't change every render.
  const filters = useMemo<AuditFilters>(
    () => ({
      action: kind === 'all' ? undefined : kind,
      from: startOf(period),
      actor,
    }),
    [kind, period, actor],
  );
  const log = useAuditLog(filters);
  const filtered = kind !== 'all' || period !== 'all' || Boolean(actor);

  if (workspace && !admin) {
    return (
      <Screen title="Audit log" largeTitle={false}>
        <div className="mx-[var(--gutter)] mt-4 rounded-card bg-card">
          <EmptyState
            illustration="tasks"
            title="Only admins see the audit log"
            description="It records who changed people, invites, collections and settings."
          />
        </div>
      </Screen>
    );
  }

  const download = async () => {
    setDownloading(true);
    try {
      await downloadAuditCsv(filters);
      toast('Audit log downloaded');
      void client.invalidateQueries({ queryKey: ['api', 'w', workspace?.id ?? '', 'audit'] });
    } catch (error) {
      toast(messageOf(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Screen
      title="Audit log"
      largeTitle={false}
      actions={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Download as CSV"
          icon={<Download aria-hidden />}
          loading={downloading}
          onClick={download}
        />
      }
      header={
        <div className="flex flex-col gap-3 pt-4 pb-3">
          <ChipGroup aria-label="Kind" value={kind} onValueChange={setKind} options={KINDS} />
          <div className="flex items-center gap-3 px-[var(--gutter)]">
            <SegmentedControl<Period>
              aria-label="Period"
              value={period}
              onValueChange={setPeriod}
              segments={PERIODS}
              className="flex-1"
            />
            <PersonFilter value={actor} onValueChange={setActor} />
          </div>
        </div>
      }
    >
      <AsyncWidget
        query={log}
        label="Audit entries"
        errorTitle="Couldn’t load the audit log"
        isEmpty={(data) => data.pages.every((p) => p.entries.length === 0)}
        empty={{
          illustration: 'period',
          title: filtered ? 'Nothing recorded for this filter' : 'Nothing recorded yet',
          description: 'Changes to people, invites, collections and settings appear here.',
          action: filtered ? (
            <Button
              variant="secondary"
              onClick={() => {
                setKind('all');
                setPeriod('all');
                setActor(undefined);
              }}
            >
              Show everything
            </Button>
          ) : undefined,
        }}
        skeleton={
          <div className="px-[var(--gutter)] pt-1">
            <RowsSkeleton rows={6} />
          </div>
        }
      >
        {(data) => {
          const days: { day: string; entries: AuditEntry[] }[] = [];
          for (const entry of data.pages.flatMap((p) => p.entries)) {
            const day = dayHeading(new Date(entry.at).getTime());
            const last = days[days.length - 1];
            if (last?.day === day) last.entries.push(entry);
            else days.push({ day, entries: [entry] });
          }
          return (
            <div
              className={cn(
                'flex flex-col gap-6 pt-1 transition-opacity duration-150',
                log.isPlaceholderData && 'opacity-70',
              )}
            >
              {days.map(({ day, entries }) => (
                <List key={day} header={day}>
                  {entries.map((entry) => (
                    <AuditRow
                      key={entry.id}
                      entry={entry}
                      onOpen={() => setSheet({ entry, open: true })}
                    />
                  ))}
                </List>
              ))}
              {log.hasNextPage && (
                <div className="px-[var(--gutter)]">
                  <Button
                    variant="secondary"
                    className="w-full"
                    loading={log.isFetchingNextPage}
                    onClick={() => void log.fetchNextPage()}
                  >
                    Show older entries
                  </Button>
                </div>
              )}
            </div>
          );
        }}
      </AsyncWidget>
      <EntrySheet
        entry={shown}
        open={open}
        onOpenChange={(next) => setSheet((s) => ({ ...s, open: next }))}
      />
    </Screen>
  );
}
