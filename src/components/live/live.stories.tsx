import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { emitShellEvent } from '@/components/shell/shell-events';
import { List } from '@/components/ui/list';
import type { LiveCaptureState } from '@/lib/live/store';
import { LiveNotesView, Notices } from '@/screens/live';
import { LiveNowList } from '@/screens/parts/live-now';
import { Page } from '@/stories/frames';
import {
  STAND_IN_LIVE_NOTES,
  STAND_IN_LIVE_STARTED,
  standInLiveSession,
} from '@/stories/live-fixtures';
import { standInLevels } from '@/stories/live-levels';
import { ListenSheet } from './listen-sheet';
import { LiveLevel, LiveStatus } from './live-parts';

/**
 * Listen mode's pieces (Phase 7): the status line with its breathing red dot, the level bars,
 * the Listen sheet, the Live now rows on Home and Meetings, the running notes and the notices.
 * Stand-in data throughout (src/stories/live-fixtures.ts): the lines are made up and labelled.
 */
const meta = {
  title: 'Components/Live',
  decorators: [
    (Story) => (
      <Page width={393}>
        <Story />
      </Page>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every phase: the dot breathes only while live, holds still when paused or saving. */
export const Status: Story = {
  render: () => (
    <List header="Status">
      {(
        [
          ['listening', 754_000, undefined],
          ['paused', 754_000, undefined],
          ['starting', null, undefined],
          ['stopping', null, undefined],
          ['elsewhere', null, undefined],
          ['elsewhere', null, 'Live, started 09:30'],
        ] as const
      ).map(([phase, ms, label], i) => (
        <li key={i} className="list-row flex min-h-11 items-center px-4 text-subhead">
          <LiveStatus phase={phase} elapsedMs={ms} label={label} />
        </li>
      ))}
    </List>
  ),
};

/** Bars scroll left as people speak, in red while listening; paused, they hold still in grey. */
export const Level: Story = {
  render: () => (
    <div className="flex flex-col gap-3 px-[var(--gutter)]">
      <LiveLevel live source={standInLevels} className="rounded-card bg-card px-3" />
      <LiveLevel live={false} source={standInLevels} className="rounded-card bg-card px-3" />
    </div>
  ),
};

function OpenListen() {
  useEffect(() => {
    const t = setTimeout(() => emitShellEvent('open-listen'), 0);
    return () => clearTimeout(t);
  }, []);
  return <ListenSheet />;
}

/**
 * The consent reminder, then Start. Desktop Chrome and Edge also offer the call's tab audio
 * (this story's browser decides which hint shows); phones listen through the microphone.
 */
export const ListenSheetOpen: Story = {
  name: 'Listen sheet',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-[720px] w-full bg-background">
        <Story />
      </div>
    ),
  ],
  render: () => <OpenListen />,
};

/**
 * Live now on Home and Meetings: this device's call ticks its listening time (Listening,
 * Paused, Saving); a call captured elsewhere says when it started; a notetaker says it's in.
 */
export const LiveNow: Story = {
  render: () => (
    <div className="flex flex-col gap-1.5 px-[var(--gutter)]">
      <h2 className="px-4 text-footnote text-muted-foreground">Live now</h2>
      <LiveNowList
        hrefFor={(id) => `/meetings/live/${id}`}
        items={[
          {
            id: 'a',
            title: 'Call, 17 Oct 09:30',
            source: 'listen',
            phase: 'listening',
            startedAt: null,
          },
          {
            id: 'b',
            title: 'Weekly product sync',
            source: 'listen',
            phase: 'elsewhere',
            startedAt: STAND_IN_LIVE_STARTED,
          },
          {
            id: 'c',
            title: 'Partner check-in (Meet)',
            source: 'bot',
            phase: 'elsewhere',
            startedAt: STAND_IN_LIVE_STARTED,
          },
        ]}
      />
    </div>
  ),
};

/** Running notes: where they were written, when, the points so far and the action items. */
export const Notes: Story = {
  render: () => (
    <LiveNotesView
      session={standInLiveSession({
        notes: STAND_IN_LIVE_NOTES,
        notesAt: new Date(Date.now() - 60_000).toISOString(),
      })}
    />
  ),
};

/** Before the first minute: what to expect, and Update notes now. */
export const NotesNotYet: Story = {
  render: () => <LiveNotesView session={standInLiveSession()} />,
};

/** No model to write them: one sentence on why and who can fix it, never another model. */
export const NotesNoModel: Story = {
  render: () => <LiveNotesView session={standInLiveSession({ notesError: 'no_model' })} />,
};

const capture = (patch: Partial<LiveCaptureState>): LiveCaptureState => ({
  phase: 'listening',
  session: null,
  elapsedMs: 0,
  countingSince: null,
  level: 0,
  upload: null,
  tabEnded: false,
  error: null,
  ...patch,
});

/**
 * Every notice the live screen can raise, each saying what happened and what carries on:
 * offline audio waiting, audio let go, the tab stopped sharing, transcription paused, the
 * stream reconnecting.
 */
export const AllNotices: Story = {
  name: 'Notices',
  render: () => (
    <Notices
      session={standInLiveSession({ error: 'transcriber_unreachable' })}
      phase="listening"
      connected={false}
      capture={capture({
        tabEnded: true,
        error: 'The microphone stopped. What was heard so far is kept: stop to save it.',
        upload: {
          queued: 4,
          queuedMs: 16_000,
          retrying: true,
          dropped: 2,
          ended: false,
          failed: null,
        },
      })}
    />
  ),
};

/** Opened on a second screen, or after a reload: it says so, and how to save the call. */
export const OnAnotherScreen: Story = {
  render: () => (
    <Notices session={standInLiveSession()} phase="elsewhere" connected capture={capture({})} />
  ),
};
