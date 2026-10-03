import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from './schema';

/**
 * The typed client for sotto-api, generated from its `openapi.json` (pnpm api:sync). Same origin
 * (`/api/*`), cookies included, so there is no CORS and no token in JavaScript except the CSRF
 * token that every write carries.
 */

export type Schemas = components['schemas'];
export type Me = Schemas['Me'];
export type Role = Schemas['Role'];

/** An error the API answered with: a message written for people, a code, the request id. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never reached the API (no network, or the API is down). */
export class OfflineError extends Error {
  constructor() {
    super('You’re offline');
    this.name = 'OfflineError';
  }
}

let csrfToken: string | null = null;

/** Set from GET /me; every write sends it as X-CSRF-Token. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

let fetching: Promise<string | null> | null = null;

/**
 * The CSRF token for a write. Usually already set by GET /me; when it isn't (a page that never
 * loaded /me, like an invite link, or a write right after a full page load) it is fetched
 * first, once, however many writes are waiting.
 */
export async function csrfTokenForWrite(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  fetching ??= fetch('/api/v1/me', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
    .then((response) => (response.ok ? (response.json() as Promise<Partial<Me>>) : null))
    .then((me) => {
      if (me?.csrfToken) csrfToken = me.csrfToken;
      return csrfToken;
    })
    .catch(() => null)
    .finally(() => {
      fetching = null;
    });
  return fetching;
}

const security: Middleware = {
  async onRequest({ request }) {
    request.headers.set('accept', 'application/json');
    if (!SAFE.has(request.method)) {
      const token = await csrfTokenForWrite();
      if (token) request.headers.set('x-csrf-token', token);
    }
    return request;
  },
};

export const api = createClient<paths>({
  baseUrl: typeof window === 'undefined' ? process.env.API_URL : '',
  credentials: 'same-origin',
});
api.use(security);

type Result<T> = { data?: T; error?: unknown; response: Response };

function errorFrom(error: unknown, response: Response): ApiError {
  const body = (error ?? {}) as { error?: { code?: string; message?: string; requestId?: string } };
  return new ApiError(
    body.error?.message ?? 'Something went wrong. Try again.',
    response.status,
    body.error?.code ?? (response.status >= 500 ? 'INTERNAL' : 'ERROR'),
    body.error?.requestId ?? response.headers.get('x-request-id') ?? undefined,
  );
}

/**
 * Awaits an openapi-fetch call and returns its data, or throws ApiError / OfflineError. Network
 * failures become OfflineError so widgets show their offline state instead of a crash.
 */
export async function call<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await request;
  } catch (error) {
    if (error instanceof TypeError || (error as Error)?.name === 'TypeError')
      throw new OfflineError();
    throw error;
  }
  const { data, error, response } = result;
  if (!response.ok) {
    // The gateway answers 502/503/504 while the API restarts: treat like being offline.
    if ([502, 503, 504].includes(response.status) && !error) throw new OfflineError();
    throw errorFrom(error, response);
  }
  return data as T;
}

/** True when the API says the session is gone (signed out elsewhere, or expired). */
export function isSignedOut(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** True when the person has no active workspace (new, or removed from their last one). */
export function needsWorkspace(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NO_WORKSPACE';
}
