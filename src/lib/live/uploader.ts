/**
 * Sends a live capture's audio to sotto-api in order, whatever the network does.
 *
 * Each ~4 s chunk gets the next number and joins a queue; one request at a time sends the oldest.
 * A dropped connection is retried with backoff (and waits for the browser to come back online),
 * so a tunnel or a flaky Wi-Fi costs a delay, not audio. The api counts chunks itself: a resend
 * is harmless, and if it says a number is missing (409 CHUNK_GAP) the queue re-syncs from the
 * number it expects. While offline the queue holds up to about half an hour of audio; beyond
 * that the oldest is dropped and counted, so memory stays bounded.
 *
 * Framework-free and clock-injected, so it's unit-tested directly (test/live.test.ts).
 */

export type SendOutcome =
  | { ok: true; nextSeq: number }
  /** Network down, the api restarting, a 5xx: try the same chunk again later. */
  | { ok: false; kind: 'retry' }
  /** The api expects another number first. */
  | { ok: false; kind: 'gap' }
  /** The capture ended (or was removed): stop sending. */
  | { ok: false; kind: 'ended' }
  /** Refused for good (no access, bad audio): stop, with the api's message. */
  | { ok: false; kind: 'fatal'; message: string };

export interface UploaderDeps {
  send(seq: number, pcm: ArrayBuffer): Promise<SendOutcome>;
  /** The number the api expects next (GET /live-sessions/:id), or null when unreachable. */
  nextSeq(): Promise<number | null>;
  isOnline(): boolean;
  /** Resolves when the browser says it's back online. */
  untilOnline(): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface UploaderState {
  /** Chunks waiting to be sent (including the one in flight). */
  queued: number;
  /** Milliseconds of audio waiting, for "2 min of audio waiting to send". */
  queuedMs: number;
  /** Trying again after a failure, or waiting to be online. */
  retrying: boolean;
  /** Chunks dropped because the queue was full while offline. */
  dropped: number;
  ended: boolean;
  /** Why sending stopped for good. */
  failed: string | null;
}

/** About 32 minutes of 16 kHz PCM16 at most while offline. */
export const MAX_QUEUED_BYTES = 64 * 1024 * 1024;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const BYTES_PER_MS = 32;

export class ChunkUploader {
  private queue: { seq: number; pcm: ArrayBuffer }[] = [];
  private next: number;
  private running = false;
  private idle: (() => void)[] = [];
  private listeners = new Set<(state: UploaderState) => void>();
  private snapshot: UploaderState = {
    queued: 0,
    queuedMs: 0,
    retrying: false,
    dropped: 0,
    ended: false,
    failed: null,
  };

  constructor(
    private readonly deps: UploaderDeps,
    firstSeq = 0,
  ) {
    this.next = firstSeq;
  }

  get state(): UploaderState {
    return this.snapshot;
  }

  subscribe(listener: (state: UploaderState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(patch: Partial<UploaderState>): void {
    const bytes = this.queue.reduce((sum, c) => sum + c.pcm.byteLength, 0);
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      queued: this.queue.length,
      queuedMs: Math.round(bytes / BYTES_PER_MS),
    };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  /** Adds the next chunk of audio. Ignored once sending has stopped. */
  push(pcm: ArrayBuffer): void {
    if (this.snapshot.ended || this.snapshot.failed || !pcm.byteLength) return;
    this.queue.push({ seq: this.next++, pcm });
    let bytes = this.queue.reduce((sum, c) => sum + c.pcm.byteLength, 0);
    let dropped = this.snapshot.dropped;
    // Never drop the chunk being sent (index 0 while running): drop the next oldest.
    while (bytes > MAX_QUEUED_BYTES && this.queue.length > 2) {
      const [gone] = this.queue.splice(1, 1);
      bytes -= gone!.pcm.byteLength;
      dropped += 1;
    }
    this.update({ dropped });
    void this.run();
  }

  /** Resolves when everything queued has been sent, or sending stopped. */
  drained(): Promise<void> {
    if (!this.queue.length || this.snapshot.ended || this.snapshot.failed) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idle.push(resolve));
  }

  private settle(): void {
    for (const resolve of this.idle.splice(0)) resolve();
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let attempt = 0;
    try {
      while (this.queue.length && !this.snapshot.ended && !this.snapshot.failed) {
        if (!this.deps.isOnline()) {
          this.update({ retrying: true });
          await this.deps.untilOnline();
          continue;
        }
        const head = this.queue[0]!;
        const outcome = await this.deps.send(head.seq, head.pcm);
        if (outcome.ok) {
          this.queue.shift();
          attempt = 0;
          this.update({ retrying: false });
          continue;
        }
        if (outcome.kind === 'ended') {
          this.queue = [];
          this.update({ ended: true, retrying: false });
          break;
        }
        if (outcome.kind === 'fatal') {
          this.update({ failed: outcome.message, retrying: false });
          break;
        }
        if (outcome.kind === 'gap') {
          const expected = await this.deps.nextSeq();
          if (expected === null) {
            await this.backoff(attempt++);
            continue;
          }
          this.resync(expected);
          continue;
        }
        await this.backoff(attempt++);
      }
    } finally {
      this.running = false;
      if (!this.queue.length || this.snapshot.ended || this.snapshot.failed) this.settle();
    }
  }

  /**
   * Lines the queue up with what the api expects: chunks it already has are dropped; if it
   * expects an earlier number than we hold (audio lost, e.g. a reload), ours are renumbered
   * from there, so the call carries on with a short jump in time instead of stopping.
   */
  private resync(expected: number): void {
    this.queue = this.queue.filter((c) => c.seq >= expected);
    if (this.queue.length && this.queue[0]!.seq !== expected) {
      this.queue = this.queue.map((c, i) => ({ seq: expected + i, pcm: c.pcm }));
    }
    this.next = (this.queue.at(-1)?.seq ?? expected - 1) + 1;
    this.update({});
  }

  private async backoff(attempt: number): Promise<void> {
    this.update({ retrying: true });
    const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
    await this.deps.sleep(base * (0.8 + Math.random() * 0.4));
  }
}
