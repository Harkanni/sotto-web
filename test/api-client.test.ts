import { afterEach, describe, expect, it, vi } from 'vitest';
import { csrfTokenForWrite, setCsrfToken } from '@/lib/api/client';

afterEach(() => {
  setCsrfToken(null);
  vi.unstubAllGlobals();
});

describe('csrfTokenForWrite', () => {
  it('uses the token /me already gave', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    setCsrfToken('known');
    expect(await csrfTokenForWrite()).toBe('known');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches /me once when no token is set, however many writes wait', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ csrfToken: 'fresh' })));
    vi.stubGlobal('fetch', fetch);
    const tokens = await Promise.all([csrfTokenForWrite(), csrfTokenForWrite()]);
    expect(tokens).toEqual(['fresh', 'fresh']);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/v1/me', expect.anything());
    // Remembered for the next write.
    expect(await csrfTokenForWrite()).toBe('fresh');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends the write without a token when /me can’t be reached (the API then refuses it)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    expect(await csrfTokenForWrite()).toBeNull();
  });
});
