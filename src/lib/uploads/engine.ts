/**
 * Uploads one file straight to storage in parts (BRIEF §4: presigned multipart, progress,
 * pause and resume, retry). The api hands out presigned part URLs; this sends the bytes with
 * plain PUTs, a few parts at a time, retrying a failed part with backoff, and resuming from
 * whatever storage already holds. No React here: the store (./store.ts) drives it, and tests
 * drive it with a fake transport.
 */

export interface PartUrl {
  partNumber: number;
  url: string;
}

export interface StartedUpload {
  fileId: string;
  partSize: number;
  partCount: number;
  parts: PartUrl[];
  uploadedParts: { partNumber: number; etag: string }[];
}

/** Everything the engine needs from the outside world. */
export interface Transport {
  /** POST /uploads, or GET /uploads/:id when resuming an upload that already started. */
  start(): Promise<StartedUpload>;
  resume(fileId: string): Promise<StartedUpload>;
  /** POST /uploads/:id/parts */
  urls(fileId: string, partNumbers: number[]): Promise<PartUrl[]>;
  /** PUT one part; reports bytes sent; resolves with the ETag storage returned. */
  put(
    url: string,
    body: Blob,
    onProgress: (sent: number) => void,
    signal: AbortSignal,
  ): Promise<string>;
  /** POST /uploads/:id/complete */
  complete(fileId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
}

export interface Progress {
  sent: number;
  total: number;
}

/** A part that keeps failing after its retries; the upload can be resumed later. */
export class PartFailedError extends Error {
  constructor(readonly partNumber: number) {
    super(`Part ${partNumber} failed`);
    this.name = 'PartFailedError';
  }
}

export class AbortedError extends Error {
  constructor() {
    super('Upload paused');
    this.name = 'AbortedError';
  }
}

export interface RunOptions {
  file: Blob;
  transport: Transport;
  /** Set once the api has created the file; pass it back to resume. */
  fileId?: string;
  signal: AbortSignal;
  onStarted?: (fileId: string) => void;
  onProgress?: (progress: Progress) => void;
  /** Parts in flight at once. Four keeps a phone's connection busy without starving it. */
  concurrency?: number;
  /** Attempts per part before giving up (the whole upload can still be resumed). */
  attempts?: number;
  /** Waits between attempts; injectable so tests don't sleep. */
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const URL_BATCH = 50;

function defaultWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AbortedError());
      },
      { once: true },
    );
  });
}

/** Uploads the file; resolves with its id once storage has every part and the api agrees. */
export async function runUpload(options: RunOptions): Promise<string> {
  const { file, transport } = options;
  // One part giving up stops the others too; the caller's pause stops everything.
  const local = new AbortController();
  const signal = local.signal;
  options.signal.addEventListener('abort', () => local.abort(), { once: true });
  if (options.signal.aborted) local.abort();
  const wait = options.wait ?? defaultWait;
  const attempts = options.attempts ?? 4;
  if (signal.aborted) throw new AbortedError();

  const started = options.fileId ? await transport.resume(options.fileId) : await transport.start();
  options.onStarted?.(started.fileId);

  const { fileId, partSize, partCount } = started;
  const done = new Map(started.uploadedParts.map((p) => [p.partNumber, p.etag]));
  const urls = new Map(started.parts.map((p) => [p.partNumber, p.url]));
  const sizeOf = (n: number) => Math.min(partSize, file.size - (n - 1) * partSize);
  const inFlight = new Map<number, number>();
  let finished = [...done.keys()].reduce((sum, n) => sum + sizeOf(n), 0);

  const report = () => {
    let sent = finished;
    for (const bytes of inFlight.values()) sent += bytes;
    options.onProgress?.({ sent: Math.min(sent, file.size), total: file.size });
  };
  report();

  const queue = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !done.has(n));

  const urlFor = async (n: number): Promise<string> => {
    const known = urls.get(n);
    if (known) return known;
    // Fetch URLs for this part and the next few still waiting, in one request.
    const batch = [n, ...queue.filter((m) => !urls.has(m) && m !== n)].slice(0, URL_BATCH);
    for (const part of await transport.urls(fileId, batch)) urls.set(part.partNumber, part.url);
    return urls.get(n)!;
  };

  const sendPart = async (n: number) => {
    const body = file.slice((n - 1) * partSize, (n - 1) * partSize + sizeOf(n));
    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) throw new AbortedError();
      try {
        const etag = await transport.put(
          await urlFor(n),
          body,
          (sent) => {
            inFlight.set(n, sent);
            report();
          },
          signal,
        );
        inFlight.delete(n);
        done.set(n, etag);
        finished += body.size;
        report();
        return;
      } catch (error) {
        inFlight.delete(n);
        report();
        if (signal.aborted || error instanceof AbortedError) throw new AbortedError();
        // A 403 usually means the presigned URL expired (a long pause): get a fresh one.
        urls.delete(n);
        if (attempt >= attempts) throw new PartFailedError(n);
        await wait(Math.min(15_000, 1_000 * 2 ** (attempt - 1)), signal);
      }
    }
  };

  // A small pool: each worker takes the next part until none are left.
  let failure: unknown = null;
  const workers = Array.from(
    { length: Math.min(options.concurrency ?? 4, queue.length) },
    async () => {
      try {
        for (let n = queue.shift(); n !== undefined; n = queue.shift()) await sendPart(n);
      } catch (error) {
        if (!(error instanceof AbortedError)) failure ??= error;
        local.abort();
      }
    },
  );
  await Promise.all(workers);
  if (failure) throw failure;
  if (signal.aborted) throw new AbortedError();

  await transport.complete(
    fileId,
    [...done].map(([partNumber, etag]) => ({ partNumber, etag })),
  );
  return fileId;
}
