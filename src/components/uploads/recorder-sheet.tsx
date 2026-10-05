'use client';

import { Mic, Pause, Play, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UPLOAD_TOAST } from '@/components/shell/add-sheet';
import { onShellEvent } from '@/components/shell/shell-events';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { timestamp } from '@/lib/format';
import { addUploads } from '@/lib/uploads/store';
import { currentCollectionId } from '@/lib/uploads/target';
import { cn } from '@/lib/utils';

type Step = 'consent' | 'recording' | 'review' | 'error';

/**
 * The container each browser records best: WebM/Opus in Chrome, Edge and Firefox; MP4/AAC in
 * Safari. The transcriber normalises both (ffmpeg).
 */
export function recordingFormat(): { mime: string; extension: string } {
  const candidates = [
    { mime: 'audio/webm;codecs=opus', extension: 'webm' },
    { mime: 'audio/mp4', extension: 'm4a' },
    { mime: 'audio/webm', extension: 'webm' },
  ];
  if (typeof MediaRecorder === 'undefined') return candidates[0]!;
  return (
    candidates.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? { mime: '', extension: 'webm' }
  );
}

function defaultTitle(at: Date): string {
  const day = at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `Recording, ${day} ${time}`;
}

/**
 * A live waveform of the microphone: bars scroll left as you speak, drawn on a canvas from an
 * AnalyserNode. It moves only because sound does; when paused it holds still.
 */
function Waveform({ analyser, live }: { analyser: AnalyserNode | null; live: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = new Uint8Array(analyser.fftSize);
    const color = getComputedStyle(canvas).color;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 50) return; // 20 bars a second is smooth and cheap
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      if (live) {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        history.current.push(Math.min(1, Math.sqrt(peak) * 1.2));
      }
      const bar = 3 * dpr;
      const gap = 3 * dpr;
      const count = Math.floor(canvas.width / (bar + gap));
      const values = history.current.slice(-count);
      history.current = values;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      values.forEach((v, i) => {
        const h = Math.max(bar, v * canvas.height);
        const x = canvas.width - (values.length - i) * (bar + gap);
        ctx.beginPath();
        ctx.roundRect(x, (canvas.height - h) / 2, bar, h, bar / 2);
        ctx.fill();
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, live]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('h-24 w-full text-destructive-text', !live && 'text-faint-foreground')}
    />
  );
}

/**
 * Record a meeting (brief §4): a consent reminder first, then a live waveform with pause and
 * resume, then a name, and the recording uploads like any file (it resumes if the connection
 * drops). Nothing leaves the device until Save.
 */
export function RecorderSheet() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('consent');
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const clock = useRef({ startedAt: 0, banked: 0 });
  const lock = useRef<WakeLockSentinel | null>(null);
  const format = useRef(recordingFormat());

  const teardown = useCallback(() => {
    recorder.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close().catch(() => undefined);
    audio.current = null;
    setAnalyser(null);
    void lock.current?.release().catch(() => undefined);
    lock.current = null;
  }, []);

  const reset = useCallback(() => {
    teardown();
    chunks.current = [];
    clock.current = { startedAt: 0, banked: 0 };
    setStep('consent');
    setPaused(false);
    setElapsed(0);
    setError('');
  }, [teardown]);

  useEffect(
    () =>
      onShellEvent('open-recorder', () => {
        reset();
        setOpen(true);
      }),
    [reset],
  );
  useEffect(() => teardown, [teardown]);

  // The clock: elapsed recording time, excluding pauses.
  useEffect(() => {
    if (step !== 'recording' || paused) return;
    const tick = () =>
      setElapsed(clock.current.banked + (performance.now() - clock.current.startedAt));
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [step, paused]);

  async function start() {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(
        'This browser can’t record audio. Record on your phone or computer and import the file.',
      );
      setStep('error');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = media;
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      ctx.createMediaStreamSource(media).connect(node);
      audio.current = ctx;
      setAnalyser(node);

      const rec = new MediaRecorder(
        media,
        format.current.mime ? { mimeType: format.current.mime } : {},
      );
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.start(1_000); // a chunk a second, so a crash loses at most a second
      recorder.current = rec;
      clock.current = { startedAt: performance.now(), banked: 0 };
      // Keeps the phone awake: a locked screen would stop the microphone on some devices.
      lock.current = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null;
      setStep('recording');
    } catch (e) {
      const denied =
        e instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(e.name);
      setError(
        denied
          ? 'Sotto can’t use the microphone. Allow it for this site in your browser’s settings, then try again.'
          : 'No microphone was found. Connect one and try again.',
      );
      setStep('error');
    }
  }

  function togglePause() {
    const rec = recorder.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      clock.current.banked += performance.now() - clock.current.startedAt;
      setPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      clock.current.startedAt = performance.now();
      setPaused(false);
    }
  }

  function stop() {
    const rec = recorder.current;
    if (!rec) return;
    if (!paused) clock.current.banked += performance.now() - clock.current.startedAt;
    setElapsed(clock.current.banked);
    rec.onstop = () => teardown();
    rec.stop();
    setTitle(defaultTitle(new Date()));
    setStep('review');
  }

  function save() {
    const blob = new Blob(chunks.current, {
      type: format.current.mime.split(';')[0] || 'audio/webm',
    });
    const name = `${title.trim() || defaultTitle(new Date())}.${format.current.extension}`;
    addUploads([{ blob, name }], {
      source: 'recording',
      title: title.trim() || undefined,
      collectionId: currentCollectionId(),
    });
    toast(`Saving “${title.trim()}”`, {
      id: UPLOAD_TOAST,
      description: 'It uploads in the background; the transcript follows.',
    });
    chunks.current = [];
    setOpen(false);
  }

  function discard() {
    reset();
    setOpen(false);
  }

  const recording = step === 'recording';

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // A recording can't be swiped away by accident: Stop first, then save or discard.
        if (!next && recording) {
          toast('Stop the recording first', { description: 'Then save it or discard it.' });
          return;
        }
        if (!next) reset();
        setOpen(next);
      }}
      title="Record a meeting"
      detents={['large']}
      footer={
        <div className="flex flex-col gap-2 px-[var(--gutter)] pt-2 pb-[max(var(--safe-bottom),16px)]">
          {step === 'consent' && (
            <Button onClick={() => void start()} icon={<Mic aria-hidden />}>
              Start recording
            </Button>
          )}
          {step === 'review' && (
            <>
              <Button onClick={save}>Save recording</Button>
              <Button variant="ghost" onClick={discard}>
                Discard
              </Button>
            </>
          )}
          {step === 'error' && (
            <Button variant="secondary" onClick={() => setStep('consent')}>
              Try again
            </Button>
          )}
        </div>
      }
    >
      <div className="flex min-h-[320px] flex-col px-[var(--gutter)]">
        {step === 'consent' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-[#ff3b30]/12 text-destructive-text dark:bg-[#ff453a]/22">
              <Mic aria-hidden className="size-8" strokeWidth={2} />
            </span>
            <div className="max-w-[34ch]">
              <h3 className="text-title-3">Tell everyone you’re recording</h3>
              <p className="mt-2 text-callout text-muted-foreground">
                Some countries require everyone on a call to agree before it’s recorded. Nothing
                leaves this device until you save.
              </p>
            </div>
          </div>
        )}

        {recording && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
            <p
              className="flex items-center gap-2 text-subhead text-muted-foreground"
              aria-live="polite"
            >
              <span
                aria-hidden
                className={cn(
                  'size-2.5 rounded-full',
                  paused ? 'bg-faint-foreground' : 'bg-destructive',
                )}
              />
              {paused ? 'Paused' : 'Recording'}
            </p>
            <p className="text-[56px] leading-none font-light tracking-tight tabular" role="timer">
              {timestamp(elapsed / 1000)}
            </p>
            <Waveform analyser={analyser} live={!paused} />
            <div className="flex items-center gap-8">
              <button
                type="button"
                aria-label={paused ? 'Resume recording' : 'Pause recording'}
                onClick={togglePause}
                className="pressable grid size-14 place-items-center rounded-full bg-fill text-foreground active:bg-fill-strong"
              >
                {paused ? (
                  <Play aria-hidden className="ml-0.5 size-6 fill-current" />
                ) : (
                  <Pause aria-hidden className="size-6 fill-current" />
                )}
              </button>
              <button
                type="button"
                aria-label="Stop recording"
                onClick={stop}
                className="pressable grid size-[72px] place-items-center rounded-full border-4 border-fill-strong bg-card"
              >
                <Square
                  aria-hidden
                  className="size-7 rounded-[5px] fill-destructive text-destructive"
                />
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="flex flex-1 flex-col justify-center gap-4 py-6">
            <p className="text-center text-subhead text-muted-foreground tabular">
              {timestamp(elapsed / 1000)} recorded
            </p>
            <TextField
              label="Name"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              maxLength={120}
              autoFocus
            />
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <h3 className="text-title-3">Can’t record</h3>
            <p className="max-w-[34ch] text-callout text-muted-foreground">{error}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
