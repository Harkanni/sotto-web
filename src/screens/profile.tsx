'use client';

import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  Building2,
  Check,
  ChevronRight,
  CreditCard,
  Hand,
  Info,
  LayoutGrid,
  LogOut,
  Moon,
  ScrollText,
  Shapes,
  Users,
  Wrench,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useSyncExternalStore } from 'react';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { Avatar } from '@/components/ui/avatar';
import { SensitivityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { List, ListRow, RowIcon } from '@/components/ui/list';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import { MODE_COPY, useAiModels } from '@/lib/api/ai';
import { useActiveWorkspace, useMe, useWorkspaces } from '@/lib/api/hooks';
import { signOut } from '@/lib/auth/account';
import { useChildKey } from '@/lib/nav/hooks';
import { NavLink } from '@/lib/nav/link';
import { navigateUp } from '@/lib/nav/store';
import { HAND_STORAGE_KEY } from '@/lib/prefs/boot-script';
import { setThemeSmoothly } from '@/lib/prefs/theme';
import { useIsClient, useStored, writeStored } from '@/lib/prefs/stored';
import {
  SAMPLE_SETTINGS_KEY,
  parseSampleSettings,
  type SampleLatency,
  type SampleSettings,
  type SampleState,
} from '@/lib/sample/api';
import { resetSampleQueries } from '@/lib/sample/queries';
import { ROLE_LABEL, atLeast } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { useAppInfo } from '@/components/shell/app-info';
import { RowsSkeleton } from './parts/rows';

function useReducedMotionSetting(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/** The account card at the top of Profile: who you are, opening your account settings. */
function AccountCard({ href, selected }: { href: string; selected: boolean }) {
  const me = useMe();
  const user = me.data?.user;
  return (
    <NavLink
      href={href}
      aria-current={selected ? 'page' : undefined}
      aria-label={user ? `Account: ${user.name || user.email}` : 'Account'}
      className={cn(
        'pressable mx-[var(--gutter)] flex items-center gap-4 rounded-card bg-card p-4 select-none',
        'active:bg-row-pressed can-hover:hover:bg-fill-subtle',
        'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
        selected && 'bg-fill',
      )}
    >
      {user ? (
        <Avatar name={user.name || user.email} src={user.image ?? undefined} size={64} />
      ) : (
        <Skeleton className="size-16 rounded-full" />
      )}
      <span className="min-w-0 flex-1">
        {user ? (
          <>
            <span className="block truncate text-title-3">{user.name || 'Add your name'}</span>
            <span className="block truncate text-callout text-muted-foreground">{user.email}</span>
          </>
        ) : (
          <>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-52" />
          </>
        )}
      </span>
      <ChevronRight
        aria-hidden
        className="-mr-1 size-5 shrink-0 text-faint-foreground"
        strokeWidth={2.25}
      />
    </NavLink>
  );
}

export function ProfileScreen() {
  const { entry, tab } = useLayer();
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  const workspaces = useWorkspaces();
  const selected = useChildKey(tab, entry.key);
  const { theme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const admin = atLeast(workspace?.role, 'admin');
  const people = workspaces.data?.find((w) => w.active)?.members;
  const ai = useAiModels();
  const defaultModel = ai.data?.models.find((m) => m.ref === ai.data?.defaultRef);
  const aiDetail = ai.data
    ? defaultModel
      ? MODE_COPY[defaultModel.mode].title
      : 'Passages only'
    : undefined;
  const row = (path: string) => ({
    href: `${entry.key}/${path}`,
    selected: selected === `${entry.key}/${path}`,
  });

  return (
    <Screen title="Profile">
      <div className="flex flex-col gap-7 pt-1">
        <AccountCard {...row('account')} />

        <List header="Workspace">
          <ListRow
            leading={<RowIcon icon={Building2} tint="indigo" />}
            title={workspace?.name ?? 'Workspace'}
            detail={workspace ? ROLE_LABEL[workspace.role] : undefined}
            {...row('workspace')}
          />
          {admin && (
            <ListRow
              leading={<RowIcon icon={Users} tint="blue" />}
              title="Members"
              detail={people}
              {...row('members')}
            />
          )}
        </List>

        <List header="AI and data">
          <ListRow
            leading={<RowIcon icon={Bot} tint="purple" />}
            title="AI settings"
            detail={aiDetail}
            {...row('ai')}
          />
          <ListRow
            leading={<RowIcon icon={CreditCard} tint="green" />}
            title="Usage and billing"
            {...row('usage')}
          />
          {admin && (
            <ListRow
              leading={<RowIcon icon={ScrollText} tint="gray" />}
              title="Audit log"
              {...row('audit')}
            />
          )}
        </List>

        <List header="App">
          <ListRow
            leading={<RowIcon icon={Moon} tint="indigo" />}
            title="Appearance"
            detail={theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'}
            {...row('appearance')}
          />
          <ListRow
            leading={<RowIcon icon={Wrench} tint="orange" />}
            title="Developer"
            {...row('developer')}
          />
          <ListRow
            leading={<RowIcon icon={Info} tint="teal" />}
            title="About Sotto"
            {...row('about')}
          />
        </List>

        <List>
          <ListRow
            leading={<RowIcon icon={LogOut} tint="red" />}
            title="Sign out"
            destructive
            trailing={
              signingOut ? <Spinner size={18} className="text-muted-foreground" /> : undefined
            }
            rowProps={{ 'aria-busy': signingOut || undefined }}
            onClick={() => {
              if (signingOut) return;
              setSigningOut(true);
              void signOut(client);
            }}
          />
        </List>
      </div>
    </Screen>
  );
}

// ── Appearance ──────────────────────────────────────────────────────────────────────────

function useHand(): ['right' | 'left', (hand: 'right' | 'left') => void] {
  const hand = useStored(HAND_STORAGE_KEY) === 'left' ? 'left' : 'right';
  return [
    hand,
    (next) => {
      if (next === 'left') document.documentElement.dataset.hand = 'left';
      else delete document.documentElement.dataset.hand;
      writeStored(HAND_STORAGE_KEY, next);
    },
  ];
}

export function AppearanceScreen() {
  const { theme, setTheme } = useTheme();
  const [hand, setHand] = useHand();
  const reduced = useReducedMotionSetting();
  const mounted = useIsClient();

  return (
    <Screen title="Appearance" largeTitle={false}>
      <div className="flex flex-col gap-7 pt-4">
        <section aria-label="Theme" className="flex flex-col gap-1.5 px-[var(--gutter)]">
          <h2 className="px-4 text-footnote text-muted-foreground">Theme</h2>
          <div className="rounded-card bg-card p-3">
            <SegmentedControl
              aria-label="Theme"
              value={mounted ? (theme ?? 'system') : 'system'}
              onValueChange={(t) => setThemeSmoothly(t, setTheme)}
              segments={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
          <p className="px-4 text-footnote text-muted-foreground">
            System follows your device’s light and dark setting.
          </p>
        </section>

        <section aria-label="Handedness" className="flex flex-col gap-1.5 px-[var(--gutter)]">
          <h2 className="px-4 text-footnote text-muted-foreground">Handedness</h2>
          <div className="rounded-card bg-card p-3">
            <SegmentedControl
              aria-label="Handedness"
              value={hand}
              onValueChange={setHand}
              segments={[
                { value: 'left', label: 'Left hand' },
                { value: 'right', label: 'Right hand' },
              ]}
            />
          </div>
          <p className="px-4 text-footnote text-muted-foreground">
            The + button moves to your thumb’s side of the screen.
          </p>
        </section>

        <List
          header="Motion"
          footer="Sotto crossfades instead of sliding when your device asks for reduced motion."
        >
          <ListRow
            leading={<RowIcon icon={Activity} tint="green" />}
            title="Reduce motion"
            detail={reduced ? 'On (device)' : 'Off (device)'}
          />
        </List>
      </div>
    </Screen>
  );
}

// ── Developer (Phase 2 review tools) ─────────────────────────────────────────────────────

function useSampleSettings(): [SampleSettings, (s: SampleSettings) => void] {
  const client = useQueryClient();
  const settings = parseSampleSettings(useStored(SAMPLE_SETTINGS_KEY));
  return [
    settings,
    (next) => {
      writeStored(SAMPLE_SETTINGS_KEY, JSON.stringify(next));
      void resetSampleQueries(client);
    },
  ];
}

function useSwipeSetting(): ['auto' | 'on' | 'off', (v: 'auto' | 'on' | 'off') => void] {
  const raw = useStored('sotto.swipe');
  const value = raw === 'on' || raw === 'off' ? raw : 'auto';
  return [value, (v) => writeStored('sotto.swipe', v === 'auto' ? null : v)];
}

const STATES: { value: SampleState; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: 'Sample content as loaded' },
  { value: 'empty', label: 'Empty', hint: 'Every list comes back empty' },
  { value: 'error', label: 'Failing', hint: 'Every request fails, with a request ID' },
  { value: 'offline', label: 'Offline', hint: 'Every request fails as if offline' },
];

export function DeveloperScreen() {
  const { entry } = useLayer();
  const [settings, setSettings] = useSampleSettings();
  const [swipe, setSwipe] = useSwipeSetting();

  return (
    <Screen title="Developer" largeTitle={false}>
      <div className="flex flex-col gap-7 pt-4">
        <p className="px-[calc(var(--gutter)+16px)] text-callout text-muted-foreground">
          Tools for reviewing Phase 2. They change only this browser.
        </p>

        <section aria-label="Sample API speed" className="flex flex-col gap-1.5 px-[var(--gutter)]">
          <h2 className="px-4 text-footnote text-muted-foreground">Sample API speed</h2>
          <div className="rounded-card bg-card p-3">
            <SegmentedControl<SampleLatency>
              aria-label="Sample API speed"
              value={settings.latency}
              onValueChange={(latency) => setSettings({ ...settings, latency })}
              segments={[
                { value: 'instant', label: 'Instant' },
                { value: 'realistic', label: 'Realistic' },
                { value: 'slow', label: 'Slow' },
              ]}
            />
          </div>
          <p className="px-4 text-footnote text-muted-foreground">
            Slow takes about 2.5 seconds, to see skeletons.
          </p>
        </section>

        <List header="Sample API responses">
          {STATES.map((s) => (
            <ListRow
              key={s.value}
              title={s.label}
              subtitle={s.hint}
              onClick={() => setSettings({ ...settings, state: s.value })}
              trailing={
                settings.state === s.value ? (
                  <Check
                    aria-label="Selected"
                    className="size-5 text-primary-text"
                    strokeWidth={2.5}
                  />
                ) : undefined
              }
              rowProps={{ 'aria-pressed': settings.state === s.value }}
            />
          ))}
        </List>

        <section aria-label="Swipe back" className="flex flex-col gap-1.5 px-[var(--gutter)]">
          <h2 className="px-4 text-footnote text-muted-foreground">
            Swipe from the left edge to go back
          </h2>
          <div className="rounded-card bg-card p-3">
            <SegmentedControl
              aria-label="Swipe back"
              value={swipe}
              onValueChange={setSwipe}
              segments={[
                { value: 'auto', label: 'Auto' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </div>
          <p className="px-4 text-footnote text-muted-foreground">
            Auto: on when installed on iPhone or iPad, where the browser has no gesture of its own.
          </p>
        </section>

        <List header="Previews">
          <ListRow
            leading={<RowIcon icon={LayoutGrid} tint="blue" />}
            title="Widget states"
            href={`${entry.key}/widget-states`}
          />
          <ListRow
            leading={<RowIcon icon={Shapes} tint="pink" />}
            title="Components"
            href={`${entry.key}/components`}
          />
        </List>
      </div>
    </Screen>
  );
}

// ── Widget states ─────────────────────────────────────────────────────────────────────

type Fake = 'loading' | 'empty' | 'error' | 'offline' | 'content';

function fakeQuery(state: Fake, onRetry: () => void): UseQueryResult<string[]> {
  const base = { refetch: async () => (onRetry(), {}) } as unknown as UseQueryResult<string[]>;
  switch (state) {
    case 'loading':
      return {
        ...base,
        data: undefined,
        isPending: true,
        isFetching: true,
        isError: false,
        fetchStatus: 'fetching',
        status: 'pending',
      } as UseQueryResult<string[]>;
    case 'empty':
      return {
        ...base,
        data: [],
        isPending: false,
        isFetching: false,
        isError: false,
        fetchStatus: 'idle',
        status: 'success',
      } as UseQueryResult<string[]>;
    case 'error':
      return {
        ...base,
        data: undefined,
        isPending: false,
        isFetching: false,
        isError: true,
        error: Object.assign(new Error('Sample failure'), { requestId: 'req_3f9a1c27be04' }),
        fetchStatus: 'idle',
        status: 'error',
      } as UseQueryResult<string[]>;
    case 'offline':
      return {
        ...base,
        data: undefined,
        isPending: true,
        isFetching: false,
        isError: false,
        fetchStatus: 'paused',
        status: 'pending',
      } as UseQueryResult<string[]>;
    default:
      return {
        ...base,
        data: ['Q4 roadmap memo', 'Lagos launch plan', 'Pricing review notes'],
        isPending: false,
        isFetching: false,
        isError: false,
        fetchStatus: 'idle',
        status: 'success',
      } as UseQueryResult<string[]>;
  }
}

function StateDemo({ state, title }: { state: Fake; title: string }) {
  const [current, setCurrent] = useState<Fake>(state);
  const retry = () => {
    setCurrent('loading');
    setTimeout(() => setCurrent(state), 1600);
  };
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 px-[var(--gutter)]">
      <h2 className="px-4 text-footnote text-muted-foreground">{title}</h2>
      <AsyncWidget
        query={fakeQuery(current, retry)}
        label={title}
        errorTitle="Couldn’t load recent files"
        empty={{
          illustration: 'docs',
          title: 'No files yet',
          description: 'Upload a memo or a PDF and ask about it straight away.',
          action: <Button variant="secondary">Add a file</Button>,
        }}
        skeleton={<RowsSkeleton rows={3} />}
        className="overflow-hidden rounded-card bg-card"
      >
        {(items) => (
          <ul>
            {items.map((item) => (
              <ListRow key={item} title={item} />
            ))}
          </ul>
        )}
      </AsyncWidget>
    </section>
  );
}

export function WidgetStatesScreen() {
  return (
    <Screen title="Widget states" largeTitle={false}>
      <div className="flex flex-col gap-7 pt-4">
        <p className="px-[calc(var(--gutter)+16px)] text-callout text-muted-foreground">
          Every data widget shares these states. Retry reloads only its own widget.
        </p>
        <StateDemo state="loading" title="Loading (after 150 ms, at least 300 ms)" />
        <StateDemo state="empty" title="Empty" />
        <StateDemo state="error" title="Error, with a request ID" />
        <StateDemo state="offline" title="Offline" />
        <StateDemo state="content" title="Content" />
        <section aria-label="Time-filtered" className="flex flex-col gap-1.5 px-[var(--gutter)]">
          <h2 className="px-4 text-footnote text-muted-foreground">Time-filtered, empty</h2>
          <div className="rounded-card bg-card">
            <EmptyState
              illustration="period"
              title="No data for this period"
              description="Try a longer range."
              action={<Button variant="secondary">Show this month</Button>}
            />
          </div>
        </section>
      </div>
    </Screen>
  );
}

// ── Components (an in-app gallery; Storybook has every state) ─────────────────────────

export function ComponentsScreen() {
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState('week');
  const [q, setQ] = useState('');
  return (
    <Screen title="Components" largeTitle={false}>
      <div className="flex flex-col gap-7 pt-4">
        {(['primary', 'secondary', 'ghost', 'destructive'] as const).map((variant) => (
          <section
            key={variant}
            aria-label={variant}
            className="flex flex-col gap-2 px-[var(--gutter)]"
          >
            <h2 className="px-1 text-footnote text-muted-foreground capitalize">{variant}</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant={variant}>Default</Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
              <Button variant={variant} loading icon={<Check aria-hidden />}>
                Loading
              </Button>
              <Button
                variant={variant}
                size="icon"
                aria-label="Icon button"
                icon={<Hand aria-hidden />}
              />
            </div>
          </section>
        ))}
        <List header="Controls">
          <ListRow
            title="Switch"
            trailing={<Switch checked={on} onCheckedChange={setOn} aria-label="Example switch" />}
          />
          <ListRow
            title="Badges"
            trailing={
              <span className="flex gap-1.5">
                <SensitivityBadge level="public" />
                <SensitivityBadge level="restricted" />
              </span>
            }
          />
          <ListRow title="Avatar" trailing={<Avatar name="Amaka Obi" />} />
        </List>
        <div className="flex flex-col gap-3 px-[var(--gutter)]">
          <SegmentedControl
            aria-label="Example"
            value={seg}
            onValueChange={setSeg}
            segments={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
            ]}
          />
          <SearchField value={q} onValueChange={setQ} />
        </div>
      </div>
    </Screen>
  );
}

// ── Not built yet (labelled) ─────────────────────────────────────────────────────────

const LATER: Record<string, { title: string; phase: number; what: string }> = {
  ai: {
    title: 'AI settings',
    phase: 6,
    what: 'Choose Private, your own key, or managed AI, and see where each answer’s data goes.',
  },
  usage: {
    title: 'Usage and billing',
    phase: 6,
    what: 'Usage this month, your plan, and invoices (paid with Paystack).',
  },
};

export function LaterScreen() {
  const { entry } = useLayer();
  const info = LATER[entry.kind] ?? { title: 'Coming soon', phase: 4, what: '' };
  return (
    <Screen title={info.title} largeTitle={false}>
      <div className="mx-[var(--gutter)] mt-4 rounded-card bg-card">
        <EmptyState
          illustration="processing"
          title={`Arrives in Phase ${info.phase}`}
          description={info.what}
        />
      </div>
    </Screen>
  );
}

export function AboutScreen() {
  const { version } = useAppInfo();
  return (
    <Screen title="About Sotto" largeTitle={false}>
      <div className="flex flex-col gap-7 pt-4">
        <List>
          <ListRow title="Version" detail={version} />
          <ListRow title="System status" href="/status" chevron />
        </List>
        <List
          header="Acknowledgements"
          footer="Apple devices show the system font; everything else uses Inter."
        >
          <ListRow title="Inter typeface" subtitle="SIL Open Font License 1.1" />
          <ListRow title="Lucide icons" subtitle="ISC License" />
        </List>
      </div>
    </Screen>
  );
}

export function NotFoundScreen() {
  const { parent } = useLayer();
  return (
    <Screen title="Not found" largeTitle={false}>
      <div className="mx-[var(--gutter)] mt-4 rounded-card bg-card">
        <EmptyState
          illustration="search"
          title="This page doesn’t exist"
          description="The link may be old, or the item was deleted."
          action={
            parent && (
              <Button variant="secondary" onClick={() => navigateUp(parent.key)}>
                Go back
              </Button>
            )
          }
        />
      </div>
    </Screen>
  );
}
