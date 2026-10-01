import { describe, expect, it } from 'vitest';
import { checkLabel, fetchApiStatus, formatUptime } from '@/lib/status';

const json = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const body = {
  service: 'sotto-api',
  version: 'sha-abc1234',
  commit: 'abc1234def',
  environment: 'production',
  uptimeSeconds: 125,
  ready: true,
  checks: { database: true, redis: true, queue: true },
};

describe('fetchApiStatus', () => {
  it('reports ok when the API is ready', async () => {
    const status = await fetchApiStatus('http://api', json(body));
    expect(status).toMatchObject({ state: 'ok', version: 'sha-abc1234' });
  });

  it('reports degraded when a dependency is down', async () => {
    const status = await fetchApiStatus(
      'http://api',
      json({ ...body, ready: false, checks: { database: false } }),
    );
    expect(status.state).toBe('degraded');
  });

  it('never throws when the API is unreachable', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await fetchApiStatus('http://api', failing)).toEqual({
      state: 'unreachable',
      reason: 'network',
    });
  });

  it('rejects a response that is not the API', async () => {
    expect(await fetchApiStatus('http://api', json({ hello: 'world' }))).toEqual({
      state: 'unreachable',
      reason: 'bad_response',
    });
  });
});

describe('formatting', () => {
  it('labels known checks in plain words', () => {
    expect(checkLabel('queue')).toBe('Job queue');
    expect(checkLabel('storage')).toBe('Storage');
  });

  it('formats uptime compactly', () => {
    expect(formatUptime(42)).toBe('42s');
    expect(formatUptime(125)).toBe('2m');
    expect(formatUptime(3 * 3600 + 120)).toBe('3h 2m');
    expect(formatUptime(5 * 86400)).toBe('5d');
  });
});
