import { describe, expect, it } from 'vitest';
import {
  AbortedError,
  PartFailedError,
  runUpload,
  type StartedUpload,
  type Transport,
} from '@/lib/uploads/engine';
import { overallProgress, type UploadItem } from '@/lib/uploads/store';

const noWait = () => Promise.resolve();

/** A fake api + storage that records what happened and can fail on cue. */
function fake(options: {
  size: number;
  partSize: number;
  firstUrls?: number;
  uploaded?: number[];
  failPut?: (partNumber: number, attempt: number) => boolean;
}) {
  const partCount = Math.ceil(options.size / options.partSize);
  const puts: { part: number; bytes: number }[] = [];
  const attempts = new Map<number, number>();
  const requested: number[][] = [];
  let completed: { partNumber: number; etag: string }[] | null = null;
  const url = (n: number) => ({ partNumber: n, url: `https://s3.test/part/${n}` });
  const started = (): StartedUpload => ({
    fileId: 'f1',
    partSize: options.partSize,
    partCount,
    parts: Array.from({ length: Math.min(options.firstUrls ?? partCount, partCount) }, (_, i) =>
      url(i + 1),
    ).filter((p) => !(options.uploaded ?? []).includes(p.partNumber)),
    uploadedParts: (options.uploaded ?? []).map((n) => ({ partNumber: n, etag: `"e${n}"` })),
  });
  const transport: Transport = {
    start: async () => started(),
    resume: async () => started(),
    urls: async (_id, numbers) => {
      requested.push(numbers);
      return numbers.map(url);
    },
    put: async (u, body, onProgress) => {
      const part = Number(u.split('/').at(-1));
      const attempt = (attempts.get(part) ?? 0) + 1;
      attempts.set(part, attempt);
      if (options.failPut?.(part, attempt)) throw new Error('connection reset');
      onProgress(body.size / 2);
      onProgress(body.size);
      puts.push({ part, bytes: body.size });
      return `"e${part}"`;
    },
    complete: async (_id, parts) => {
      completed = parts;
    },
  };
  return { transport, puts, requested, attempts, completed: () => completed, partCount };
}

describe('upload engine', () => {
  it('sends every part with the right bytes, then completes', async () => {
    const f = fake({ size: 25, partSize: 10 });
    const progress: number[] = [];
    const id = await runUpload({
      file: new Blob(['x'.repeat(25)]),
      transport: f.transport,
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p.sent),
    });
    expect(id).toBe('f1');
    expect(f.puts.sort((a, b) => a.part - b.part)).toEqual([
      { part: 1, bytes: 10 },
      { part: 2, bytes: 10 },
      { part: 3, bytes: 5 },
    ]);
    expect(
      f
        .completed()!
        .map((p) => p.partNumber)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(progress.at(-1)).toBe(25);
    expect(Math.max(...progress)).toBe(25);
  });

  it('resumes: skips what storage has and counts it as sent', async () => {
    const f = fake({ size: 30, partSize: 10, uploaded: [1, 3] });
    const progress: number[] = [];
    await runUpload({
      file: new Blob(['x'.repeat(30)]),
      transport: f.transport,
      fileId: 'f1',
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p.sent),
    });
    expect(f.puts.map((p) => p.part)).toEqual([2]);
    expect(progress[0]).toBe(20);
    expect(f.completed()).toHaveLength(3);
  });

  it('asks for more part URLs in batches as it goes', async () => {
    const f = fake({ size: 100, partSize: 10, firstUrls: 2 });
    await runUpload({
      file: new Blob(['x'.repeat(100)]),
      transport: f.transport,
      signal: new AbortController().signal,
      concurrency: 1,
    });
    expect(f.requested[0]![0]).toBe(3);
    expect(f.requested.flat().sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(f.puts).toHaveLength(10);
  });

  it('retries a failed part with a fresh URL, then carries on', async () => {
    const f = fake({
      size: 20,
      partSize: 10,
      failPut: (part, attempt) => part === 2 && attempt < 3,
    });
    await runUpload({
      file: new Blob(['x'.repeat(20)]),
      transport: f.transport,
      signal: new AbortController().signal,
      wait: noWait,
    });
    expect(f.attempts.get(2)).toBe(3);
    expect(f.requested.flat()).toEqual([2, 2]); // the URL is refetched after each failure
    expect(f.completed()).toHaveLength(2);
  });

  it('gives up on a part after its attempts, without completing', async () => {
    const f = fake({ size: 30, partSize: 10, failPut: (part) => part === 2 });
    await expect(
      runUpload({
        file: new Blob(['x'.repeat(30)]),
        transport: f.transport,
        signal: new AbortController().signal,
        wait: noWait,
        attempts: 2,
      }),
    ).rejects.toEqual(new PartFailedError(2));
    expect(f.completed()).toBeNull();
  });

  it('stops when paused', async () => {
    const f = fake({ size: 30, partSize: 10 });
    const controller = new AbortController();
    controller.abort();
    await expect(
      runUpload({
        file: new Blob(['x'.repeat(30)]),
        transport: f.transport,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AbortedError);
    expect(f.puts).toHaveLength(0);
  });
});

describe('overall progress', () => {
  const item = (state: UploadItem['state'], sent: number, size: number): UploadItem => ({
    id: state + sent,
    fileId: null,
    name: 'a',
    title: 'a',
    size,
    sent,
    kind: 'document',
    state,
    offline: false,
    error: null,
    final: false,
  });

  it('weighs files by size and ignores finished ones', () => {
    expect(overallProgress([])).toBeNull();
    expect(overallProgress([item('done', 10, 10)])).toBeNull();
    expect(
      overallProgress([item('uploading', 50, 100), item('queued', 0, 300), item('failed', 1, 1)]),
    ).toBe(0.125);
  });
});

describe('file cache keys', () => {
  it('keeps a transcript and its search matches apart (different shapes)', async () => {
    const { fileKeys } = await import('@/lib/api/files');
    const transcript = JSON.stringify(fileKeys.transcript('w', 'f'));
    for (const q of ['', 'board']) {
      expect(JSON.stringify(fileKeys.matches('w', 'f', q))).not.toBe(transcript);
    }
  });
});
