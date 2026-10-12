'use client';

import { AudioLines, MonitorSpeaker } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { onShellEvent } from '@/components/shell/shell-events';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api/client';
import { captureSupport } from '@/lib/live/capture';
import { getLiveCapture, startListening } from '@/lib/live/store';
import { pushPath } from '@/lib/nav/routes';
import { navigate } from '@/lib/nav/store';
import { currentCollectionId } from '@/lib/uploads/target';

/** "Call, 12 Oct 09:30": the person's own date and time. They can rename it later. */
export function liveTitle(at: Date): string {
  const day = at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `Call, ${day} ${time}`;
}

/** Where the live screen lives: pushed on Meetings, whichever tab Listen was started from. */
export function liveHref(sessionId: string): string {
  return pushPath('/meetings', 'live', sessionId);
}

/**
 * Listen to a call (PLAN → Live notetaker): the consent reminder, what to capture, Start. The
 * microphone always; on desktop Chrome or Edge, the call's tab too, so both sides are heard
 * without a speakerphone. Once listening, Sotto opens the live screen; the capture keeps going
 * wherever you go in the app.
 */
export function ListenSheet() {
  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState({ mic: true, tab: false });
  const [tab, setTab] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(
    () =>
      onShellEvent('open-listen', () => {
        const current = getLiveCapture();
        if (current.session) {
          navigate(liveHref(current.session.id));
          return;
        }
        setSupport(captureSupport());
        setError('');
        setStarting(false);
        setOpen(true);
      }),
    [],
  );

  async function start() {
    setStarting(true);
    setError('');
    try {
      const id = await startListening({
        tab: support.tab && tab,
        title: liveTitle(new Date()),
        collectionId: currentCollectionId() ?? undefined,
      });
      setOpen(false);
      navigate(liveHref(id));
    } catch (e) {
      setStarting(false);
      if (e instanceof ApiError && e.status === 402) {
        toast(e.message, {
          action: { label: 'See usage', onClick: () => navigate('/profile/usage') },
        });
        setOpen(false);
        return;
      }
      setError(e instanceof Error ? e.message : 'Listening couldn’t start. Try again.');
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !starting && setOpen(next)}
      title="Listen to a call"
      footer={
        <Button
          className="w-full"
          onClick={() => void start()}
          loading={starting}
          icon={<AudioLines aria-hidden />}
          disabled={!support.mic}
        >
          Start listening
        </Button>
      }
    >
      <div className="flex flex-col px-[var(--gutter)] pb-2">
        <div className="flex flex-col items-center gap-4 py-5 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-[#34c759]/14 text-success-text dark:bg-[#30d158]/20">
            <AudioLines aria-hidden className="size-8" strokeWidth={2} />
          </span>
          <div className="max-w-[36ch]">
            <h3 className="text-title-3">Tell everyone Sotto is listening</h3>
            <p className="mt-2 text-callout text-muted-foreground">
              Some countries require everyone on a call to agree before it’s recorded. You’ll see
              the transcript as people speak, and the call is saved as a meeting when you stop.
            </p>
          </div>
        </div>

        {support.tab && (
          <div className="surface-elevated rounded-card bg-card-nested">
            <label className="flex min-h-11 items-center gap-3 py-2 pr-3 pl-4">
              <MonitorSpeaker aria-hidden className="size-5 shrink-0 text-primary-text" />
              <span className="min-w-0 flex-1 text-body">Include the call’s audio</span>
              <Switch checked={tab} onCheckedChange={setTab} aria-describedby="listen-tab-hint" />
            </label>
          </div>
        )}
        <p id="listen-tab-hint" className="min-h-9 px-4 pt-1.5 text-footnote text-muted-foreground">
          {!support.mic
            ? 'This browser can’t listen live. Use a recent Chrome, Edge, Safari or Firefox.'
            : support.tab
              ? tab
                ? 'Next, pick the tab with your Meet, Teams or Zoom call and turn on “Also share tab audio”.'
                : 'Only your microphone: put the call on speaker so Sotto hears everyone.'
              : 'Sotto listens through the microphone: put the call on speaker so it hears everyone.'}
        </p>

        {error && (
          <p role="alert" className="px-4 pt-1 text-footnote text-destructive-text">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
