'use client';

import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';
import { magicLinkClient } from 'better-auth/client/plugins';

/**
 * The sign-in ceremonies (Better Auth, served by sotto-api at /api/auth on this origin): email
 * links, passkeys, Google and Microsoft, sign-out. Everything else (who you are, your workspace,
 * members…) goes through the typed API client in src/lib/api.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [magicLinkClient(), passkeyClient()],
});

/** Where each sign-in lands: new people go to onboarding, everyone else back where they were. */
export function landing(next: string | null | undefined) {
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
  return {
    callbackURL: safe,
    newUserCallbackURL: `/welcome${safe === '/home' ? '' : `?next=${encodeURIComponent(safe)}`}`,
    errorCallbackURL: `/sign-in?error=link${safe === '/home' ? '' : `&next=${encodeURIComponent(safe)}`}`,
  };
}

/** Browsers that can offer saved passkeys in the email field's autofill. */
export async function canAutofillPasskeys(): Promise<boolean> {
  const pkc = typeof window !== 'undefined' ? window.PublicKeyCredential : undefined;
  if (!pkc || typeof pkc.isConditionalMediationAvailable !== 'function') return false;
  try {
    return await pkc.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

/** Browsers that can sign in with a passkey at all. */
export function supportsPasskeys(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}
