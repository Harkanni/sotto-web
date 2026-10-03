'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { setCsrfToken } from '@/lib/api/client';
import { useHydrationSafe } from '@/lib/api/hydration';
import { authClient } from './client';
import { loadPage } from './navigate';

/**
 * Your account's sign-in ceremonies that live with Better Auth rather than the REST API:
 * passkeys (add, rename, remove) and signing out.
 */

export type Passkey = {
  id: string;
  name: string | null;
  createdAt: string | Date;
  deviceType: string;
  backedUp: boolean;
};

type AuthResult<T> = {
  data: T | null;
  error: { message?: string; status?: number; code?: string } | null;
};

/** An error from Better Auth in Sotto's words, with its code kept for callers. */
export class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

function unwrap<T>({ data, error }: AuthResult<T>, fallback: string): T {
  if (error) {
    const message = !error.status
      ? 'Sotto can’t be reached. Check your connection and try again.'
      : error.status === 429
        ? 'Too many attempts. Wait a minute and try again.'
        : fallback;
    throw new AuthRequestError(message, error.code, error.status);
  }
  return data as T;
}

const passkeysKey = ['api', 'passkeys'] as const;

export function usePasskeys() {
  return useHydrationSafe(
    useQuery({
      queryKey: passkeysKey,
      queryFn: async () =>
        unwrap(
          (await authClient.passkey.listUserPasskeys()) as AuthResult<Passkey[]>,
          'Your passkeys couldn’t be loaded.',
        ),
      retry: (count, error) => !(error instanceof AuthRequestError && error.status) && count < 1,
    }),
  );
}

/** A name for a new passkey from the device it was made on ("iPhone", "Mac"…), editable later. */
export function deviceName(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/CrOS/.test(userAgent)) return 'Chromebook';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'Passkey';
}

/** True when the browser's sheet was closed: not an error worth a message. */
export function cancelledCeremony(error: unknown): boolean {
  const code = error instanceof AuthRequestError ? error.code : undefined;
  return code === 'AUTH_CANCELLED' || code === 'ERROR_CEREMONY_ABORTED';
}

export function useAddPasskey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = (await authClient.passkey.addPasskey({
        name: deviceName(navigator.userAgent),
      })) as AuthResult<unknown> | undefined;
      if (result?.error) {
        throw new AuthRequestError(
          'The passkey wasn’t added. Try again.',
          result.error.code,
          result.error.status,
        );
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: passkeysKey }),
  });
}

export function useRenamePasskey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      unwrap(
        (await authClient.passkey.updatePasskey({ id, name })) as AuthResult<unknown>,
        'The passkey wasn’t renamed. Try again.',
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: passkeysKey }),
  });
}

export function useDeletePasskey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        (await authClient.passkey.deletePasskey({ id })) as AuthResult<unknown>,
        'The passkey wasn’t removed. Try again.',
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: passkeysKey }),
  });
}

/** Asks the service worker to forget every saved page, so nothing of this account stays. */
async function forgetSavedPages(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  registration?.active?.postMessage({ type: 'CLEAR_PAGES' });
}

/**
 * Signs out on this device: ends the session, forgets saved pages and cached data, and loads
 * the sign-in page fresh. Signing out offline still clears this device; the session then
 * expires on its own.
 */
export async function signOut(client: QueryClient): Promise<void> {
  try {
    await authClient.signOut();
  } catch {
    // Offline: the cookie stays until it expires, but nothing of the account stays visible.
  }
  await forgetSavedPages();
  setCsrfToken(null);
  client.clear();
  loadPage('/sign-in', { replace: true });
}
