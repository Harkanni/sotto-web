import { describe, expect, it } from 'vitest';
import { PCM_WORKLET_SOURCE } from '@/lib/live/pcm-worklet';
import { ChunkUploader, MAX_QUEUED_BYTES, type SendOutcome } from '@/lib/live/uploader';
import { startsOrEndsArriving } from '@/lib/api/events';
import type { LiveSession } from '@/lib/api/live';
import { liveNowItems } from '@/lib/live/now';
import type { LivePhase } from '@/lib/live/store';
import { elsewhereLabel } from '@/screens/parts/live-now';

// ── The worklet, run as written against a fake audio-thread scope ──────────────────────────

type Posted = { type: 'chunk'; pcm: ArrayBuffer } | { type: 'level'; level: number };

interface FakeProcessor {
  port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: Posted) => void };
  process(inputs: Float32Array[][]): boolean;
}

function loadWorklet(rate: number, chunkMs = 100) {
  const posted: Posted[] = [];
  let Processor: (new (options: unknown) => FakeProcessor) | null = null;
  class AudioWorkletProcessor {
    port = {
      onmessage: null as ((e: { data: unknown }) => void) | null,
      postMessage: (m: Posted) => posted.push(m),
    };
  }
  const registerProcessor = (_name: string, ctor: new (o: unknown) => FakeProcessor) => {
    Processor = ctor;
  };
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', PCM_WORKLET_SOURCE)(
    AudioWorkletProcessor,
    registerProcessor,
    rate,
  );
  const node = new Processor!({ processorOptions: { chunkMs } });
  return {
    node,
    posted,
    chunks: () =>
      posted
        .filter((p) => p.type === 'chunk')
        .map((p) => new Int16Array((p as { pcm: ArrayBuffer }).pcm)),
    send: (message: string) => node.port.onmessage?.({ data: message }),
    /** Feeds `seconds` of a constant value in 128-frame quanta, on `channels` channels. */
    feed(seconds: number, value: number | ((i: number) => number), channels = 1) {
      const frames = Math.round(seconds * rate);
      for (let start = 0; start < frames; start += 128) {
        const n = Math.min(128, frames - start);
        const channel = Float32Array.from({ length: n }, (_, i) =>
          typeof value === 'number' ? value : value(start + i),
        );
        node.process([Array.from({ length: channels }, () => channel)]);
      }
    },
  };
}

describe('the PCM worklet', () => {
  it('downsamples 48 kHz to 16 kHz in chunks of the requested length', () => {
    const w = loadWorklet(48_000, 100);
    w.feed(0.25, 0.5);
    const chunks = w.chunks();
    expect(chunks.map((c) => c.length)).toEqual([1_600, 1_600]);
    expect(chunks[0]![0]).toBe(Math.trunc(0.5 * 0x7fff)); // Int16Array truncates
    w.send('flush');
    expect(w.chunks().at(-1)!.length).toBe(800); // the rest of the quarter second
  });

  it('works from rates that don’t divide evenly (44.1 kHz)', () => {
    const w = loadWorklet(44_100, 1_000);
    w.feed(2, 0.1);
    w.send('flush');
    const total = w.chunks().reduce((sum, c) => sum + c.length, 0);
    expect(Math.abs(total - 32_000)).toBeLessThanOrEqual(1);
  });

  it('mixes channels to mono and clamps', () => {
    const w = loadWorklet(16_000, 10);
    const node = w.node;
    node.process([[new Float32Array(160).fill(1), new Float32Array(160).fill(-0.5)]]);
    expect(w.chunks()[0]![0]).toBe(Math.trunc(0.25 * 0x7fff));
    node.process([[new Float32Array(160).fill(3)]]);
    expect(w.chunks()[1]![0]).toBe(0x7fff);
    node.process([[new Float32Array(160).fill(-3)]]);
    expect(w.chunks()[2]![0]).toBe(-0x8000);
  });

  it('sends nothing while paused, but keeps reporting the level as zero', () => {
    const w = loadWorklet(16_000, 100);
    w.send('pause');
    w.feed(1, 0.4);
    expect(w.chunks()).toEqual([]);
    const levels = w.posted.filter((p) => p.type === 'level');
    expect(levels.length).toBeGreaterThanOrEqual(19);
    expect(levels.every((l) => (l as { level: number }).level === 0)).toBe(true);
    w.send('resume');
    w.feed(0.1, 0.4);
    expect(w.chunks().length).toBe(1);
    expect((w.posted.at(-1) as { level?: number }).level ?? 0.4).toBeGreaterThan(0);
  });
});

// ── The uploader ───────────────────────────────────────────────────────────────────────────

/** A fake api: answers each send from `script` (default ok), and remembers what it got. */
function fakeApi() {
  const got: number[] = [];
  const script: (SendOutcome | 'throw')[] = [];
  let expected = 0;
  let online = true;
  const wakeups: (() => void)[] = [];
  const slept: number[] = [];
  return {
    got,
    script,
    slept,
    setExpected: (n: number) => (expected = n),
    goOffline: () => (online = false),
    goOnline: () => {
      online = true;
      for (const wake of wakeups.splice(0)) wake();
    },
    deps: {
      send: async (seq: number) => {
        const next = script.shift();
        if (next && next !== 'throw') {
          if (next.ok) got.push(seq);
          return next;
        }
        if (seq !== expected) return { ok: false, kind: 'gap' } as const;
        got.push(seq);
        expected = seq + 1;
        return { ok: true, nextSeq: expected } as const;
      },
      nextSeq: async () => expected,
      isOnline: () => online,
      untilOnline: () => new Promise<void>((resolve) => wakeups.push(resolve)),
      sleep: async (ms: number) => {
        slept.push(ms);
      },
    },
  };
}

const audio = (ms = 4_000) => new ArrayBuffer(ms * 32);

describe('ChunkUploader', () => {
  it('numbers chunks and sends them in order, one at a time', async () => {
    const api = fakeApi();
    const up = new ChunkUploader(api.deps);
    up.push(audio());
    up.push(audio());
    up.push(audio());
    await up.drained();
    expect(api.got).toEqual([0, 1, 2]);
    expect(up.state).toMatchObject({ queued: 0, retrying: false, ended: false });
  });

  it('retries the same chunk with backoff after a failure', async () => {
    const api = fakeApi();
    api.script.push({ ok: false, kind: 'retry' }, { ok: false, kind: 'retry' });
    const up = new ChunkUploader(api.deps);
    up.push(audio());
    await up.drained();
    expect(api.got).toEqual([0]);
    expect(api.slept.length).toBe(2);
    expect(api.slept[1]!).toBeGreaterThan(api.slept[0]!);
  });

  it('waits while offline, holding the audio, then sends it all', async () => {
    const api = fakeApi();
    api.goOffline();
    const up = new ChunkUploader(api.deps);
    up.push(audio());
    up.push(audio(2_000));
    await Promise.resolve();
    expect(up.state).toMatchObject({ queued: 2, queuedMs: 6_000, retrying: true });
    api.goOnline();
    await up.drained();
    expect(api.got).toEqual([0, 1]);
  });

  it('re-syncs from the number the api expects after a gap', async () => {
    const api = fakeApi();
    api.setExpected(2); // the api already has 0 and 1 (sent before a reload)
    const up = new ChunkUploader(api.deps);
    for (let i = 0; i < 4; i++) up.push(audio());
    await up.drained();
    expect(api.got).toEqual([2, 3]);
  });

  it('renumbers when the api expects an earlier number than it holds', async () => {
    const api = fakeApi();
    const up = new ChunkUploader(api.deps, 5); // resumed after a reload lost 0–4
    up.push(audio());
    up.push(audio());
    await up.drained();
    expect(api.got).toEqual([0, 1]);
    up.push(audio());
    await up.drained();
    expect(api.got).toEqual([0, 1, 2]);
  });

  it('stops when the capture has ended, or for good on a refusal', async () => {
    const ended = fakeApi();
    ended.script.push({ ok: false, kind: 'ended' });
    const up = new ChunkUploader(ended.deps);
    up.push(audio());
    up.push(audio());
    await up.drained();
    expect(up.state).toMatchObject({ ended: true, queued: 0 });
    up.push(audio());
    expect(up.state.queued).toBe(0);

    const refused = fakeApi();
    refused.script.push({ ok: false, kind: 'fatal', message: 'No access' });
    const other = new ChunkUploader(refused.deps);
    other.push(audio());
    await other.drained();
    expect(other.state.failed).toBe('No access');
  });

  it('drops the oldest waiting audio (never the one in flight) when the queue is full', async () => {
    const api = fakeApi();
    api.goOffline();
    const up = new ChunkUploader(api.deps);
    const chunk = 4 * 1024 * 1024;
    const count = MAX_QUEUED_BYTES / chunk + 3;
    for (let i = 0; i < count; i++) up.push(new ArrayBuffer(chunk));
    expect(up.state.dropped).toBe(3);
    expect(up.state.queued).toBe(count - 3);
    api.goOnline();
    await up.drained();
    // Chunk 0 kept its place; 1–3 went; the rest follow (renumbered to stay contiguous).
    expect(api.got[0]).toBe(0);
    expect(api.got.length).toBe(count - 3);
    expect(api.got).toEqual(Array.from({ length: count - 3 }, (_, i) => i));
  });
});

// ── Live now (Home and Meetings) ───────────────────────────────────────────────────────────

function liveSession(id: string, patch: Partial<LiveSession> = {}): LiveSession {
  return {
    id,
    source: 'listen',
    status: 'live',
    inputs: ['mic'],
    durationMs: 60_000,
    nextSeq: 15,
    startedAt: '2026-10-17T08:30:00.000Z',
    endedAt: null,
    startedBy: { id: 'u_1', name: 'Ada' },
    canControl: true,
    transcriber: { engine: 'mock', isMock: true },
    notes: null,
    notesAt: null,
    notesError: null,
    error: null,
    // Only the title is read from the meeting it becomes.
    file: { id: `f_${id}`, title: `Call ${id}` } as LiveSession['file'],
    ...patch,
  };
}

const idle = { phase: 'idle', session: null } as const;
const capturing = (id: string, phase: LivePhase = 'listening') => ({
  phase,
  session: { id, inputs: ['mic' as const], fileId: `f_${id}`, title: `Call ${id}` },
});

describe('liveNowItems', () => {
  it('lists the open calls the api knows, newest first, as captured elsewhere', () => {
    const items = liveNowItems(
      [liveSession('b'), liveSession('a', { status: 'connecting', source: 'bot' })],
      idle,
    );
    expect(items.map((i) => [i.id, i.phase, i.source])).toEqual([
      ['b', 'elsewhere', 'listen'],
      ['a', 'elsewhere', 'bot'],
    ]);
    expect(items[0]!.title).toBe('Call b');
  });

  it('never lists a call that ended or failed', () => {
    const items = liveNowItems(
      [liveSession('a', { status: 'ended' }), liveSession('b', { status: 'failed' })],
      idle,
    );
    expect(items).toEqual([]);
  });

  it('marks the call this device is capturing with what it is doing', () => {
    const items = liveNowItems([liveSession('a'), liveSession('b')], capturing('b', 'paused'));
    expect(items.map((i) => i.phase)).toEqual(['elsewhere', 'paused']);
  });

  it('shows this device’s call before the list has caught up with it', () => {
    const items = liveNowItems([liveSession('a')], capturing('new'));
    expect(items.map((i) => [i.id, i.phase, i.startedAt])).toEqual([
      ['new', 'listening', null],
      ['a', 'elsewhere', '2026-10-17T08:30:00.000Z'],
    ]);
    expect(liveNowItems(undefined, capturing('new')).map((i) => i.id)).toEqual(['new']);
  });

  it('ignores a capture that is only starting (no call exists yet)', () => {
    expect(liveNowItems(undefined, { phase: 'starting', session: null })).toEqual([]);
  });
});

describe('elsewhereLabel', () => {
  it('says when a call elsewhere started, or that the notetaker is in it', () => {
    expect(elsewhereLabel({ source: 'listen', startedAt: null })).toBe('Live');
    expect(elsewhereLabel({ source: 'listen', startedAt: '2026-10-17T08:30:00.000Z' })).toMatch(
      /^Live, started \d/,
    );
    expect(elsewhereLabel({ source: 'bot', startedAt: '2026-10-17T08:30:00.000Z' })).toBe(
      'Notetaker in the call',
    );
  });
});

describe('startsOrEndsArriving', () => {
  it('is true for the file events a live call starting or ending sends', () => {
    expect(startsOrEndsArriving('status', 'uploading')).toBe(true);
    expect(startsOrEndsArriving('status', 'uploaded')).toBe(true);
    expect(startsOrEndsArriving('status', 'failed')).toBe(true);
    expect(startsOrEndsArriving('removed', 'uploading')).toBe(true);
  });

  it('is false for a file moving through the pipeline', () => {
    expect(startsOrEndsArriving('status', 'transcribing')).toBe(false);
    expect(startsOrEndsArriving('status', 'indexing')).toBe(false);
    expect(startsOrEndsArriving('status', 'ready')).toBe(false);
    expect(startsOrEndsArriving('updated', 'ready')).toBe(false);
  });
});
