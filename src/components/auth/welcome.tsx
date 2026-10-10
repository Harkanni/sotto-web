'use client';

import { Check, ChevronRight, Cloud, KeyRound, Lock, Sparkles, SquareDashed } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SottoMark } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { TextField } from '@/components/ui/text-field';
import { Illustration } from '@/components/widgets/illustrations';
import { type AiMode, useAiSettings, useUpdateAiPolicy } from '@/lib/api/ai';
import { api, call, isSignedOut, type Role } from '@/lib/api/client';
import {
  useActivateWorkspace,
  useCreateWorkspace,
  useLoadSampleContent,
  useMe,
  useUpdateMe,
  useWorkspaces,
} from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { AuthNote, AuthNotice, AuthScreen, AuthTitle } from './auth-screen';
import { loadPage } from '@/lib/auth/navigate';

type Step = 'name' | 'workspace' | 'invite' | 'ai' | 'start';

const STEPS: Step[] = ['name', 'workspace', 'invite', 'ai', 'start'];

/** Page dots: where you are in onboarding. */
function Progress({ step }: { step: Step }) {
  const index = STEPS.indexOf(step);
  return (
    <p className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <span
          key={s}
          aria-hidden
          className={cn(
            'h-1.5 rounded-full transition-[width,background-color] duration-[var(--duration-standard)] ease-standard',
            i === index ? 'w-5 bg-primary' : 'w-1.5 bg-fill-strong',
          )}
        />
      ))}
    </p>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

/**
 * Onboarding (brief §4): your name → your workspace → invite the team → where questions are
 * answered (AI mode, in plain language) → sample content or an empty start. People arriving
 * through an invite only give their name and go on to accept it.
 */
export function Welcome() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const me = useMe();
  const [step, setStep] = useState<Step | null>(null);
  const invited = Boolean(next?.startsWith('/invite/'));
  const named = Boolean(me.data?.user.name);

  // Signed out → sign in first. Arrived through an invite and already named → go accept it.
  useEffect(() => {
    if (isSignedOut(me.error)) loadPage('/sign-in?next=/welcome', { replace: true });
    else if (invited && named && step === null) loadPage(next!, { replace: true });
  }, [me.error, invited, named, step, next]);

  if (isSignedOut(me.error)) return null;
  if (!me.data) {
    return (
      <AuthScreen stage="loading" hero={<Skeleton className="h-[160px] w-[260px] rounded-card" />}>
        {me.isError ? (
          <AuthNotice>
            Sotto can’t be reached right now.{' '}
            <button type="button" className="font-semibold underline" onClick={() => me.refetch()}>
              Try again
            </button>
          </AuthNotice>
        ) : (
          <Skeleton className="h-[50px] w-full rounded-input" />
        )}
      </AuthScreen>
    );
  }

  const current: Step = step ?? (me.data.user.name ? 'workspace' : 'name');
  const go = (to: Step) => setStep(to);

  if (current === 'name') {
    return (
      <NameStep
        initial={me.data.user.name}
        onDone={() => (invited ? loadPage(next!) : go('workspace'))}
      />
    );
  }
  if (current === 'workspace') {
    if (invited) return null;
    return (
      <WorkspaceStep onCreated={() => go('invite')} onChosen={() => loadPage(next ?? '/home')} />
    );
  }
  if (current === 'invite') return <InviteStep onDone={() => go('ai')} />;
  if (current === 'ai') return <AiStep onDone={() => go('start')} />;
  return <StartStep onDone={() => loadPage(next ?? '/home')} />;
}

function NameStep({ initial, onDone }: { initial: string; onDone: () => void }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateMe();
  return (
    <AuthScreen
      stage="name"
      hero={
        <>
          <SottoMark size={56} className="mb-3 rounded-[16px] shadow-fab" />
          <Progress step="name" />
          <AuthTitle title="Welcome to Sotto">What should your team call you?</AuthTitle>
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return setError('Enter your name.');
          update.mutate(
            { name: name.trim() },
            { onSuccess: onDone, onError: (e) => setError(messageOf(e)) },
          );
        }}
      >
        <TextField
          label="Your name"
          surface="page"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="First and last name"
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit" className="w-full" loading={update.isPending}>
          Continue
        </Button>
      </form>
    </AuthScreen>
  );
}

function WorkspaceStep({ onCreated, onChosen }: { onCreated: () => void; onChosen: () => void }) {
  const workspaces = useWorkspaces();
  const create = useCreateWorkspace();
  const activate = useActivateWorkspace();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const existing = workspaces.data ?? [];

  return (
    <AuthScreen
      stage="workspace"
      hero={
        <>
          <Illustration name="team" className="mb-2 text-primary-text" />
          <Progress step="workspace" />
          <AuthTitle title={existing.length ? 'Choose a workspace' : 'Create your workspace'}>
            {existing.length
              ? 'Pick up where your team is, or start a new workspace.'
              : 'A workspace holds your team’s memos, meetings and who can see them.'}
          </AuthTitle>
        </>
      }
    >
      {existing.length > 0 && (
        <ul className="overflow-hidden rounded-card bg-card">
          {existing.map((w) => (
            <li key={w.id} className="list-row relative">
              <button
                type="button"
                disabled={activate.isPending}
                onClick={() =>
                  activate.mutate(w.id, {
                    onSuccess: onChosen,
                    onError: (e) => setError(messageOf(e)),
                  })
                }
                className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-row-pressed disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary text-[15px] font-bold text-primary-foreground"
                >
                  {w.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{w.name}</span>
                  <span className="block text-subhead text-muted-foreground">
                    {ROLE_LABEL[w.role]}, {w.members} {w.members === 1 ? 'person' : 'people'}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-5 text-faint-foreground"
                  strokeWidth={2.25}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return setError('Name the workspace.');
          create.mutate(name.trim(), {
            onSuccess: onCreated,
            onError: (e) => setError(messageOf(e)),
          });
        }}
      >
        <TextField
          label={existing.length ? 'Or create a new one' : 'Workspace name'}
          surface="page"
          autoComplete="organization"
          autoCapitalize="words"
          enterKeyHint="done"
          placeholder="Your team or company"
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit" className="w-full" loading={create.isPending}>
          Create workspace
        </Button>
      </form>
    </AuthScreen>
  );
}

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const ROLE_CHOICES: { value: Role; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Admin' },
];

const ROLE_HINT: Partial<Record<Role, string>> = {
  member: 'Members add and edit documents and meetings.',
  viewer: 'Viewers read and ask, and can’t change anything.',
  admin: 'Admins also manage people, access and the audit log.',
};

function InviteStep({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ email: string; role: Role }[]>([]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError('Enter an email address.');
    setSending(true);
    try {
      await call(api.POST('/api/v1/invites', { body: { email: address, role } }));
      setSent((list) => [{ email: address, role }, ...list]);
      setEmail('');
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthScreen
      stage="invite"
      hero={
        <>
          <Illustration name="mail" className="mb-2 text-primary-text" />
          <Progress step="invite" />
          <AuthTitle title="Invite your team">
            They get an email with a link to join. You can invite more people later in Profile.
          </AuthTitle>
        </>
      }
    >
      {sent.length > 0 && (
        <ul aria-label="Invites sent" className="overflow-hidden rounded-card bg-card">
          {sent.map((invite) => (
            <li
              key={invite.email}
              className="list-row relative flex min-h-11 items-center gap-3 px-4 py-2.5"
            >
              <Check aria-hidden className="size-5 shrink-0 text-success-text" strokeWidth={2.5} />
              <span className="min-w-0 flex-1 truncate text-body">{invite.email}</span>
              <span className="text-subhead text-muted-foreground">{ROLE_LABEL[invite.role]}</span>
            </li>
          ))}
        </ul>
      )}
      <form noValidate className="flex flex-col gap-3" onSubmit={send}>
        <TextField
          label="Email"
          surface="page"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="colleague@company.com"
          value={email}
          error={error}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
        <div className="flex flex-col gap-1.5">
          <SegmentedControl<Role>
            aria-label="Role"
            value={role}
            onValueChange={setRole}
            segments={ROLE_CHOICES}
          />
          <p className="px-4 text-footnote text-muted-foreground">{ROLE_HINT[role]}</p>
        </div>
        <Button type="submit" variant="secondary" className="w-full" loading={sending}>
          Send invite
        </Button>
      </form>
      <Button className="w-full" onClick={onDone}>
        {sent.length ? 'Continue' : 'Skip for now'}
      </Button>
    </AuthScreen>
  );
}

/**
 * Where questions are answered (BRIEF §4 onboarding: choose an AI mode, with a plain-language
 * privacy explanation). Private is the default and needs nothing; a key is added later in AI
 * settings; Managed comes with a paid plan. Everything here can be changed in Profile.
 */
function AiStep({ onDone }: { onDone: () => void }) {
  const settings = useAiSettings();
  const update = useUpdateAiPolicy();
  const [choice, setChoice] = useState<AiMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modes = settings.data?.modes ?? [];
  const available = (mode: AiMode) =>
    modes.find((m) => m.mode === mode)?.availability.available ?? false;

  function choose(mode: AiMode) {
    setChoice(mode);
    if (mode === 'PRIVATE') return onDone();
    update.mutate(
      { allowedModes: ['PRIVATE', mode] },
      {
        onSuccess: onDone,
        onError: (e) => {
          setChoice(null);
          setError(messageOf(e));
        },
      },
    );
  }

  const card =
    'pressable flex w-full items-start gap-3 rounded-card bg-card p-4 text-left select-none active:bg-row-pressed disabled:opacity-60';
  const OPTIONS: { mode: AiMode; icon: typeof Lock; tint: string; title: string; line: string }[] =
    [
      {
        mode: 'PRIVATE',
        icon: Lock,
        tint: 'bg-[#34c759]',
        title: 'Private (recommended)',
        line: 'Questions are answered by models running inside Sotto. Nothing goes to an outside AI company.',
      },
      {
        mode: 'BYOK',
        icon: KeyRound,
        tint: 'bg-[#ff9500]',
        title: 'Also use your own AI key',
        line: 'Add an Anthropic, OpenAI or Google key later in AI settings. Only the passages a question needs go to them; Restricted files never do.',
      },
    ];
  if (available('MANAGED')) {
    OPTIONS.push({
      mode: 'MANAGED',
      icon: Cloud,
      tint: 'bg-[#007aff]',
      title: 'Also use Managed AI',
      line: 'Sotto’s own AI account, included in the Pro plan. Choose it later in Usage and billing.',
    });
  }

  return (
    <AuthScreen
      stage="ai"
      hero={
        <>
          <Illustration name="chats" className="mb-2 text-primary-text" />
          <Progress step="ai" />
          <AuthTitle title="Where should questions be answered?">
            Every answer says where it was made. You can change this any time in Profile.
          </AuthTitle>
        </>
      }
    >
      {error && <AuthNotice>{error}</AuthNotice>}
      {OPTIONS.map((o) => {
        const disabled =
          choice !== null ||
          (o.mode === 'BYOK' && settings.data !== undefined && !available('BYOK'));
        return (
          <button
            key={o.mode}
            type="button"
            className={card}
            disabled={disabled}
            onClick={() => (o.mode === 'MANAGED' ? onDone() : choose(o.mode))}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-[29px] shrink-0 place-items-center rounded-[7px] text-white',
                o.tint,
              )}
            >
              <o.icon className="size-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-headline">{o.title}</span>
              <span className="mt-0.5 block text-subhead text-muted-foreground">{o.line}</span>
            </span>
            {choice === o.mode && o.mode !== 'PRIVATE' ? (
              <Spinner size={18} className="mt-1 text-muted-foreground" />
            ) : (
              <ChevronRight
                aria-hidden
                className="mt-1 size-5 shrink-0 text-faint-foreground"
                strokeWidth={2.25}
              />
            )}
          </button>
        );
      })}
    </AuthScreen>
  );
}

function StartStep({ onDone }: { onDone: () => void }) {
  const sample = useLoadSampleContent();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'sample' | 'empty' | null>(null);

  function start(withSample: boolean) {
    setChoice(withSample ? 'sample' : 'empty');
    if (!withSample) return onDone();
    sample.mutate(undefined, {
      onSuccess: onDone,
      onError: (e) => {
        setChoice(null);
        setError(messageOf(e));
      },
    });
  }

  const card =
    'pressable flex w-full items-start gap-3 rounded-card bg-card p-4 text-left select-none active:bg-row-pressed disabled:opacity-60';
  return (
    <AuthScreen
      stage="start"
      hero={
        <>
          <Illustration name="docs" className="mb-2 text-primary-text" />
          <Progress step="start" />
          <AuthTitle title="How would you like to start?">
            Explore with sample memos and meetings, or begin with an empty workspace.
          </AuthTitle>
        </>
      }
    >
      {error && <AuthNotice>{error}</AuthNotice>}
      <button type="button" className={card} disabled={choice !== null} onClick={() => start(true)}>
        <span
          aria-hidden
          className="grid size-[29px] shrink-0 place-items-center rounded-[7px] bg-primary text-white"
        >
          <Sparkles className="size-[18px]" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-headline">Explore with sample content</span>
          <span className="mt-0.5 block text-subhead text-muted-foreground">
            A made-up company’s memos, meetings and chats, in collections with real access rules.
          </span>
        </span>
        {choice === 'sample' ? (
          <Spinner size={18} className="mt-1 text-muted-foreground" />
        ) : (
          <ChevronRight
            aria-hidden
            className="mt-1 size-5 shrink-0 text-faint-foreground"
            strokeWidth={2.25}
          />
        )}
      </button>
      <button
        type="button"
        className={card}
        disabled={choice !== null}
        onClick={() => start(false)}
      >
        <span
          aria-hidden
          className="grid size-[29px] shrink-0 place-items-center rounded-[7px] bg-[#8e8e93] text-white"
        >
          <SquareDashed className="size-[18px]" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-headline">Start empty</span>
          <span className="mt-0.5 block text-subhead text-muted-foreground">
            Upload your own files and recordings with the + button.
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="mt-1 size-5 shrink-0 text-faint-foreground"
          strokeWidth={2.25}
        />
      </button>
      <AuthNote>
        Sample content is fictional and labelled as such. Delete its collections any time.
      </AuthNote>
    </AuthScreen>
  );
}
