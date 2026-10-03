'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isSignedOut, needsWorkspace } from '@/lib/api/client';
import { apiKeys, useMe } from '@/lib/api/hooks';
import { loadPage } from '@/lib/auth/navigate';

function leave(to: '/sign-in' | '/welcome') {
  const here = `${window.location.pathname}${window.location.search}`;
  loadPage(
    to === '/sign-in' && here !== '/home' ? `/sign-in?next=${encodeURIComponent(here)}` : to,
    {
      replace: true,
    },
  );
}

/**
 * Keeps the app honest about the session without holding up its first paint: the shell renders
 * at once (the proxy already saw a session cookie), and this sends people on when the API says
 * otherwise. Signed out (expired, or signed out on another device) → sign-in, back here after.
 * No workspace (new, or removed from their last one) → onboarding. Offline or the API down →
 * nothing: the app's own offline states take over.
 */
export function SessionGate() {
  const client = useQueryClient();
  const me = useMe();

  useEffect(() => {
    if (isSignedOut(me.error)) leave('/sign-in');
    else if (me.data && !me.data.workspace) leave('/welcome');
  }, [me.data, me.error]);

  useEffect(() => {
    const onError = (error: unknown) => {
      if (isSignedOut(error)) leave('/sign-in');
      // Removed from this workspace mid-session: let /me decide where to go.
      else if (needsWorkspace(error)) void client.invalidateQueries({ queryKey: apiKeys.me });
    };
    const queries = client.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const mutations = client.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      queries();
      mutations();
    };
  }, [client]);

  return null;
}
