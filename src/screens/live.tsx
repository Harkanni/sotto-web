'use client';

import {
  ArrowDown,
  AudioLines,
  CircleAlert,
  CloudOff,
  MessageCircleQuestion,
  MonitorSpeaker,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Lock,
} from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LiveLevel, LiveStatus, useElapsed, type LevelSource } from '@/components/live/live-parts';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncWidget } from '@/components/widgets/async-widget';
import {
  LIVE_ERROR,
  NOTES_ERROR,
  endLiveSession,
  refreshLiveNotes,
  useLiveSession,
  useLiveStream,
  type LiveSegment,
  type LiveSession,
} from '@/lib/api/live';
import { timestamp, relativeTime } from '@/lib/format';
import {
  pauseListening,
  resumeListening,
  stopListening,
  useLiveCapture,
  type LiveCaptureState,
} from '@/lib/live/store';
import { pushPath } from '@/lib/nav/routes';
import { navigate, navigateUp } from '@/lib/nav/store';
import { cn } from '@/lib/utils';
import { askFailed, useStartChat } from './ask';
import { Composer } from './parts/composer';

type Section = 'transcript' | 'notes';

/** What this device is doing with the session on screen. */
export type LivePhaseHere = LiveCaptureState['phase'] | 'elsewhere';

function localPhase(capture: LiveCaptureState, id: string): LivePhaseHere {
  return capture.session?.id === id ? capture.phase : 'elsewhere';
}

/**
 * Listen mode's live screen: the transcript as it's heard, running notes, and the controls in
 * thumb reach (pause, stop, ask). Pushed on Meetings when listening starts; the capture itself
 * lives outside it, so leaving this screen doesn't stop anything (the strip above the tab bar
 * brings you back). Stopping turns the call into a meeting and opens it.
 */
export function LiveScreen() {
  const { entry } = useLayer();
  const id = entry.id!;
  const query = useLiveSession(id);
  const capture = useLiveCapture();
  const session = query.data ?? null;
  const { segments, connected } = useLiveStream(
    id,
    Boolean(session) && session?.status !== 'ended',
  );
  const [section, setSection] = useState<Section>('transcript');
  const [asking, setAsking] = useState(false);
  const phase = localPhase(capture, id);
  const stopping = phase === 'stopping';

  // Ended somewhere else (another screen of yours, or ten quiet minutes): open the meeting.
  const endedFile = session?.status === 'ended' && !stopping ? session.file.id : null;
  useEffect(() => {
    if (endedFile) navigate(pushPath('/meetings', 'meeting', endedFile), { replace: true });
  }, [endedFile]);

  async function stop() {
    const title = session?.file.title ?? 'the call';
    try {
      const fileId =
        phase === 'elsewhere'
          ? (await endLiveSession(id)).discarded
            ? null
            : (session?.file.id ?? null)
          : await stopListening();
      if (fileId) {
        toast(`Saving “${title}”`, {
          description: 'The full transcript and notes follow in a few minutes.',
        });
        navigate(pushPath('/meetings', 'meeting', fileId), { replace: true, intent: 'none' });
      } else {
        toast('Nothing was heard, so nothing was saved');
        navigateUp('/meetings');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The call couldn’t be saved. Try again.');
    }
  }

  return (
    <Screen
      title={session?.file.title ?? 'Listening'}
      largeTitle={false}
      heading={session ? <LiveHeading session={session} phase={phase} /> : undefined}
      footer={
        session &&
        session.status !== 'ended' && (
          <LiveControls
            phase={phase}
            canControl={session.canControl}
            onStop={() => void stop()}
            onAsk={() => setAsking(true)}
          />
        )
      }
    >
      <AsyncWidget
        query={query}
        label="Live meeting"
        errorTitle="Couldn’t open this call"
        isEmpty={(s) => !s}
        empty={{
          illustration: 'recordings',
          title: 'This call isn’t live',
          description: 'It ended, or it was started by someone else and isn’t saved yet.',
          action: (
            <Button variant="secondary" onClick={() => navigateUp('/meetings')}>
              Go to Meetings
            </Button>
          ),
        }}
        skeleton={<LiveSkeleton />}
      >
        {(s) =>
          s && (
            <div className="flex flex-col gap-5 pb-6">
              <Notices session={s} capture={capture} phase={phase} connected={connected} />
              <div className="px-[var(--gutter)] lg:max-w-[560px]">
                <SegmentedControl
                  aria-label="Section"
                  value={section}
                  onValueChange={setSection}
                  segments={[
                    { value: 'transcript', label: 'Transcript' },
                    { value: 'notes', label: 'Notes' },
                  ]}
                />
              </div>
              <div key={section} className="animate-[fade-in_200ms_var(--ease-out)]">
                {section === 'transcript' ? (
                  <LiveTranscript segments={segments} session={s} />
                ) : (
                  <LiveNotesView session={s} />
                )}
              </div>
            </div>
          )
        }
      </AsyncWidget>
      <AskAboutCall open={asking} onOpenChange={setAsking} sessionId={id} base={entry.key} />
    </Screen>
  );
}

// ── Heading ────────────────────────────────────────────────────────────────────────────────

export function LiveHeading({
  session,
  phase,
  elapsedMs,
  levels,
}: {
  session: LiveSession;
  phase: LivePhaseHere;
  /** Listening time in place of the capture's clock (stories). */
  elapsedMs?: number;
  /** Levels in place of the capture's (stories). */
  levels?: LevelSource;
}) {
  const ticking = useElapsed();
  const elapsed = elapsedMs ?? ticking;
  return (
    <header className="flex flex-col gap-3 px-[var(--gutter)] pt-1 pb-5">
      {/* Screen's own h1 (read and focused after a push) carries this title. */}
      <p aria-hidden className="text-title-2 text-balance">
        {session.file.title}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-subhead text-muted-foreground">
        <LiveStatus
          phase={phase}
          elapsedMs={phase === 'elsewhere' ? session.durationMs : elapsed}
          className="text-foreground"
        />
        <span aria-hidden>·</span>
        <span className="flex items-center gap-1.5">
          {session.inputs.includes('tab') ? (
            <>
              <MonitorSpeaker aria-hidden className="size-4" /> Call audio and microphone
            </>
          ) : (
            <>
              <AudioLines aria-hidden className="size-4" /> Microphone
            </>
          )}
        </span>
      </div>
      {phase !== 'elsewhere' && (
        <LiveLevel
          live={phase === 'listening'}
          source={levels}
          className="rounded-card bg-card px-3"
        />
      )}
    </header>
  );
}

// ── Notices ────────────────────────────────────────────────────────────────────────────────

function Notice({
  icon: Icon,
  tone = 'muted',
  children,
}: {
  icon: typeof CircleAlert;
  tone?: 'muted' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={cn(
        'mx-[var(--gutter)] flex items-start gap-2.5 rounded-card bg-card-nested px-4 py-3 text-subhead',
        tone === 'warning' ? 'text-warning-text' : 'text-muted-foreground',
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Problems worth knowing about while listening: each says what happened and what carries on. */
export function Notices({
  session,
  capture,
  phase,
  connected,
}: {
  session: LiveSession;
  capture: LiveCaptureState;
  phase: LivePhaseHere;
  connected: boolean;
}) {
  const mine = phase !== 'elsewhere';
  const upload = mine ? capture.upload : null;
  const notices: React.ReactNode[] = [];
  if (phase === 'elsewhere') {
    notices.push(
      <Notice key="elsewhere" icon={AudioLines}>
        This call is being listened to on another screen, or listening stopped when this page
        reloaded. Stop here to save what was heard.
      </Notice>,
    );
  }
  if (mine && capture.error) {
    notices.push(
      <Notice key="error" icon={CircleAlert} tone="warning">
        {capture.error}
      </Notice>,
    );
  }
  if (upload?.retrying && upload.queuedMs > 0) {
    notices.push(
      <Notice key="queue" icon={CloudOff}>
        Waiting for a connection. {timestamp(upload.queuedMs / 1000)} of audio is kept on this
        device and sends when you’re back online.
      </Notice>,
    );
  }
  if (upload && upload.dropped > 0) {
    notices.push(
      <Notice key="dropped" icon={CircleAlert} tone="warning">
        You were offline for a long time, so some of the oldest audio waiting to send was let go.
      </Notice>,
    );
  }
  if (mine && capture.tabEnded) {
    notices.push(
      <Notice key="tab" icon={MonitorSpeaker}>
        The call’s tab stopped sharing. Sotto is still listening through your microphone.
      </Notice>,
    );
  }
  if (session.error && LIVE_ERROR[session.error]) {
    notices.push(
      <Notice key="server" icon={CircleAlert} tone="warning">
        {LIVE_ERROR[session.error]}
      </Notice>,
    );
  }
  if (!connected && session.status !== 'ended' && phase !== 'starting') {
    notices.push(
      <Notice key="stream" icon={RefreshCw}>
        Reconnecting to the live transcript…
      </Notice>,
    );
  }
  return notices.length ? <div className="flex flex-col gap-2">{notices}</div> : null;
}

// ── Transcript ─────────────────────────────────────────────────────────────────────────────

const Line = memo(function Line({ line }: { line: LiveSegment }) {
  return (
    <li className="flex animate-[fade-in_300ms_var(--ease-out)] gap-3 py-1.5">
      <span className="w-12 shrink-0 pt-px text-right text-footnote text-muted-foreground tabular">
        {timestamp(line.startMs / 1000)}
      </span>
      <p className="min-w-0 flex-1 text-body">
        {line.speaker && <span className="font-semibold">{line.speaker}: </span>}
        {line.text}
      </p>
    </li>
  );
});

/**
 * The transcript as it's heard. It follows the newest line while you're at the bottom; scroll up
 * to read and it stays put, with a Latest button to jump back.
 */
export function LiveTranscript({
  segments,
  session,
}: {
  segments: LiveSegment[];
  session: LiveSession;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = segments.length;
  const countRef = useRef(count);
  const [following, setFollowing] = useState(true);
  // How many lines there were when the bottom was last in view: more than that while scrolled
  // up means there's something new below.
  const [seen, setSeen] = useState(0);
  const unseen = !following && count > seen;

  useEffect(() => {
    const end = endRef.current;
    if (!end) return;
    const observer = new IntersectionObserver(([e]) => {
      setFollowing(Boolean(e?.isIntersecting));
      setSeen(countRef.current);
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    countRef.current = count;
    if (count && following) endRef.current?.scrollIntoView({ block: 'end' });
    // Only new lines move the view; toggling `following` itself doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <section aria-label="Live transcript" className="px-[var(--gutter)]">
      <div className="flex items-center gap-2 px-1 pb-2 text-footnote text-muted-foreground">
        <span>Live transcript</span>
        {/* The page's own background: the Badge keeps AA there; a fill pill doesn't. */}
        {session.transcriber?.isMock && <Badge>Mock</Badge>}
      </div>
      {count ? (
        <ol aria-live="polite" aria-relevant="additions" className="rounded-card bg-card px-3 py-2">
          {segments.map((line) => (
            <Line key={line.id} line={line} />
          ))}
        </ol>
      ) : (
        <p className="rounded-card bg-card px-4 py-6 text-center text-callout text-muted-foreground">
          {session.status === 'connecting'
            ? 'Listening… the first words appear a few seconds after someone speaks.'
            : 'Nothing heard yet.'}
        </p>
      )}
      <div ref={endRef} aria-hidden className="h-px" />
      {unseen && (
        <button
          type="button"
          onClick={() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })}
          className="material-thick pressable sticky bottom-3 mx-auto mt-2 flex h-11 w-fit items-center gap-1.5 rounded-full px-4 text-callout font-semibold text-primary-text shadow-menu"
        >
          <ArrowDown aria-hidden className="size-4" /> Latest
        </button>
      )}
    </section>
  );
}

// ── Notes ──────────────────────────────────────────────────────────────────────────────────

export function LiveNotesView({ session }: { session: LiveSession }) {
  const [updating, setUpdating] = useState(false);
  const notes = session.notes;
  const problem = session.notesError ? NOTES_ERROR[session.notesError] : null;

  async function update() {
    setUpdating(true);
    try {
      await refreshLiveNotes(session.id);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Notes couldn’t be updated. Try again.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section aria-label="Notes so far" className="flex flex-col gap-3 px-[var(--gutter)]">
      {notes ? (
        <div className="flex flex-col gap-4 rounded-card bg-card p-4">
          <div className="flex min-h-6 items-center gap-1.5 text-footnote text-muted-foreground">
            <Sparkles aria-hidden className="size-4 shrink-0 text-primary-text" />
            <span className="truncate">{notes.routeLabel}</span>
            {notes.isMock && (
              <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 text-caption">Mock</span>
            )}
            {notes.private && (
              <Lock aria-label="Stayed in your cluster" className="size-3.5 shrink-0" />
            )}
            {session.notesAt && (
              <span className="ml-auto shrink-0">
                Updated{' '}
                {relativeTime(Date.parse(session.notesAt)).replace(/^Just now$/, 'just now')}
              </span>
            )}
          </div>
          <p className="prose-reading text-body">{notes.summary}</p>
          {notes.points.length > 0 && (
            <div>
              <h3 className="pb-1.5 text-footnote text-muted-foreground">So far</h3>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body marker:text-faint-foreground">
                {notes.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {notes.actions.length > 0 && (
            <div>
              <h3 className="pb-1.5 text-footnote text-muted-foreground">Action items</h3>
              <ul className="flex flex-col gap-2">
                {notes.actions.map((a) => (
                  <li key={a.text} className="flex gap-2.5 text-body">
                    <span
                      aria-hidden
                      className="mt-1.5 size-3.5 shrink-0 rounded-full border-2 border-faint-foreground"
                    />
                    <span>
                      {a.text}
                      {a.owner && <span className="text-muted-foreground"> · {a.owner}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-card bg-card px-4 py-6 text-center text-callout text-muted-foreground">
          {problem ?? 'Notes start after the first minute, then refresh every couple of minutes.'}
        </p>
      )}
      {notes && problem && <p className="px-4 text-footnote text-warning-text">{problem}</p>}
      {session.canControl && (
        <Button
          variant="ghost"
          loading={updating}
          icon={<RefreshCw aria-hidden />}
          onClick={() => void update()}
          className="self-start"
        >
          Update notes now
        </Button>
      )}
    </section>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────────────────────

/** Pause, Stop and Ask, in thumb reach, like the recorder's controls. */
export function LiveControls({
  phase,
  canControl,
  onStop,
  onAsk,
}: {
  phase: LivePhaseHere;
  canControl: boolean;
  onStop: () => void;
  onAsk: () => void;
}) {
  if (phase === 'elsewhere') {
    return (
      <div className="flex gap-2 px-[var(--gutter)] pt-2 pb-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onAsk}
          icon={<MessageCircleQuestion aria-hidden />}
        >
          Ask
        </Button>
        {canControl && (
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onStop}
            icon={<Square aria-hidden />}
          >
            Stop and save
          </Button>
        )}
      </div>
    );
  }
  const paused = phase === 'paused';
  const busy = phase === 'stopping' || phase === 'starting';
  const round =
    'pressable grid size-14 place-items-center rounded-full bg-fill text-foreground active:bg-fill-strong disabled:opacity-40';
  return (
    <div className="flex items-start justify-center gap-8 px-[var(--gutter)] pt-3 pb-3">
      <div className="flex w-16 flex-col items-center gap-1.5">
        <div className="grid h-[72px] place-items-center">
          <button
            type="button"
            disabled={busy}
            aria-label={paused ? 'Resume listening' : 'Pause listening'}
            onClick={paused ? resumeListening : pauseListening}
            className={round}
          >
            {paused ? (
              <Play aria-hidden className="ml-0.5 size-6 fill-current" />
            ) : (
              <Pause aria-hidden className="size-6 fill-current" />
            )}
          </button>
        </div>
        <span aria-hidden className="text-caption text-muted-foreground">
          {paused ? 'Resume' : 'Pause'}
        </span>
      </div>
      <div className="flex w-20 flex-col items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          aria-label="Stop and save"
          onClick={onStop}
          className="pressable grid size-[72px] place-items-center rounded-full border-4 border-fill-strong bg-card disabled:opacity-40"
        >
          {phase === 'stopping' ? (
            <span
              aria-hidden
              className="size-6 animate-[spin_0.9s_linear_infinite] rounded-full border-2 border-faint-foreground border-t-destructive"
            />
          ) : (
            <Square
              aria-hidden
              className="size-7 rounded-[5px] fill-destructive text-destructive"
            />
          )}
        </button>
        <span aria-hidden className="text-caption text-muted-foreground">
          {phase === 'stopping' ? 'Saving' : 'Stop'}
        </span>
      </div>
      <div className="flex w-16 flex-col items-center gap-1.5">
        <div className="grid h-[72px] place-items-center">
          <button type="button" aria-label="Ask about this call" onClick={onAsk} className={round}>
            <MessageCircleQuestion aria-hidden className="size-6 text-primary-text" />
          </button>
        </div>
        <span aria-hidden className="text-caption text-muted-foreground">
          Ask
        </span>
      </div>
    </div>
  );
}

// ── Ask during the call ────────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'What did I miss in the last five minutes?',
  'What’s been decided so far?',
  'Who said they’d do what?',
];

/**
 * Ask during the call: a chat scoped to the transcript so far plus the library. The answer
 * opens as a chat over this screen; listening carries on underneath.
 */
export function AskAboutCall({
  open,
  onOpenChange,
  sessionId,
  base,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  base: string;
}) {
  const startChat = useStartChat(base);

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    onOpenChange(false);
    try {
      await startChat(text, { liveSessionId: sessionId });
    } catch (error) {
      askFailed(error);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ask about this call"
      detents={['large']}
      footer={
        open && (
          // The composer brings its own gutter; the sheet's footer has one already.
          <Composer
            onSend={(text) => void ask(text)}
            placeholder="Ask about this call"
            autoFocus
            className="-mx-[var(--gutter)] py-0"
          />
        )
      }
    >
      <div className="flex flex-col gap-4 px-[var(--gutter)] pb-4">
        <p className="text-callout text-muted-foreground">
          Answers use what’s been said so far and your library, and cite the moment in the call.
        </p>
        <div className="flex flex-col items-start gap-2">
          {SUGGESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void ask(q)}
              className="pressable surface-elevated min-h-11 max-w-full rounded-[18px] bg-card-nested px-4 py-2.5 text-left text-callout text-primary-text hovered:bg-primary-tint"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function LiveSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 px-[var(--gutter)] pt-2">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-14 w-full rounded-card" />
      <Skeleton className="h-9 w-full rounded-input" />
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}
