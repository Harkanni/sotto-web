import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import { Screen } from '@/components/shell/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { LiveSession } from '@/lib/api/live';
import type { LiveCaptureState } from '@/lib/live/store';
import { PhoneStage } from '@/stories/frames';
import { STAND_IN_LIVE_NOTES, standInLiveSession, standInSegments } from '@/stories/live-fixtures';
import { standInLevels } from '@/stories/live-levels';
import {
  AskAboutCall,
  LiveControls,
  LiveHeading,
  LiveNotesView,
  LiveTranscript,
  Notices,
  type LivePhaseHere,
} from './live';

/**
 * The live screen (Phase 7, Listen mode), put together from its own parts with stand-in data:
 * the stand-in has no microphone, api or event stream, so the clock, the level bars and the
 * transcript come from src/stories/live-*.ts. The lines are made up and labelled Mock.
 */
const meta = {
  title: 'Screens/Live',
  tags: ['phone'],
  globals: { viewport: { value: 'iphone15' } },
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const IDLE_CAPTURE: LiveCaptureState = {
  phase: 'listening',
  session: null,
  elapsedMs: 0,
  countingSince: null,
  level: 0,
  upload: null,
  tabEnded: false,
  error: null,
};

function LiveStandIn({
  phase = 'listening',
  lines = 7,
  section: initial = 'transcript',
  patch = {},
  asking = false,
}: {
  phase?: LivePhaseHere;
  lines?: number;
  section?: 'transcript' | 'notes';
  patch?: Partial<LiveSession>;
  asking?: boolean;
}) {
  const session = standInLiveSession({
    status: lines ? 'live' : 'connecting',
    durationMs: lines * 4_000,
    nextSeq: lines,
    ...patch,
  });
  const [section, setSection] = useState(initial);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsk(true), 0);
    return () => clearTimeout(t);
  }, [asking]);

  return (
    <PhoneStage>
      <Screen
        title={session.file.title}
        largeTitle={false}
        heading={
          <LiveHeading
            session={session}
            phase={phase}
            elapsedMs={lines * 4_000 + 2_000}
            levels={standInLevels}
          />
        }
        footer={
          <LiveControls
            phase={phase}
            canControl={session.canControl}
            onStop={() => undefined}
            onAsk={() => setAsk(true)}
          />
        }
      >
        <div className="flex flex-col gap-5 pb-6">
          <Notices session={session} capture={IDLE_CAPTURE} phase={phase} connected />
          <div className="px-[var(--gutter)]">
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
          {section === 'transcript' ? (
            <LiveTranscript segments={standInSegments(lines)} session={session} />
          ) : (
            <LiveNotesView session={session} />
          )}
        </div>
      </Screen>
      <AskAboutCall open={ask} onOpenChange={setAsk} sessionId={session.id} base="/meetings" />
    </PhoneStage>
  );
}

/** Listening: the clock, the level moving with the voices, the transcript a line at a time. */
export const Listening: Story = { render: () => <LiveStandIn /> };

/** The first seconds: nothing said yet, and when the first words will appear. */
export const FirstSeconds: Story = { render: () => <LiveStandIn lines={0} /> };

/** Paused: the dot and the bars hold still; Resume takes Pause's place. */
export const Paused: Story = { render: () => <LiveStandIn phase="paused" /> };

/** Notes after the first minute: where they were written (Private, Mock), the gist, the to-dos. */
export const Notes: Story = {
  render: () => (
    <LiveStandIn
      section="notes"
      patch={{ notes: STAND_IN_LIVE_NOTES, notesAt: new Date(Date.now() - 60_000).toISOString() }}
    />
  ),
};

/** Opened on another screen: what's going on, Ask, and Stop and save in reach. */
export const OnAnotherScreen: Story = { render: () => <LiveStandIn phase="elsewhere" /> };

/** Ask mid-call: suggestions about the call so far, and a composer. */
export const AskDuringTheCall: Story = { render: () => <LiveStandIn asking /> };
