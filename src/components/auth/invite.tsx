'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Illustration } from '@/components/widgets/illustrations';
import { ApiError, type Role } from '@/lib/api/client';
import { fetchMe, useAcceptInvite, useInvitePreview } from '@/lib/api/hooks';
import { authClient } from '@/lib/auth/client';
import { AuthNote, AuthNotice, AuthScreen, AuthTitle } from './auth-screen';
import { loadPage } from '@/lib/auth/navigate';

const ROLE_PHRASE: Record<Role, string> = {
  owner: 'an owner',
  admin: 'an admin',
  member: 'a member',
  viewer: 'a viewer',
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * An invite link (/invite/:id). Anyone holding the link sees which workspace it's for and who
 * sent it; the person it was sent to signs in with that address and joins. Expired, withdrawn
 * and used links say so and what to do next.
 */
export function Invite({ id }: { id: string }) {
  const preview = useInvitePreview(id);
  const accept = useAcceptInvite();
  const [signedInAs, setSignedInAs] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authClient.getSession().then(({ data }) => {
      if (!cancelled) setSignedInAs(data?.user.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (preview.isPending || signedInAs === undefined) {
    return (
      <AuthScreen stage="loading" hero={<Skeleton className="h-[160px] w-[260px] rounded-card" />}>
        <Skeleton className="h-11 w-full rounded-button" />
      </AuthScreen>
    );
  }

  if (preview.isError) {
    const missing = preview.error instanceof ApiError && preview.error.status === 404;
    return (
      <AuthScreen
        stage="error"
        hero={
          <>
            <Illustration name={missing ? 'search' : 'error'} className="mb-2 text-primary-text" />
            <AuthTitle
              title={missing ? 'This invite link isn’t valid' : 'Couldn’t open this invite'}
            >
              {missing
                ? 'Check that the whole link was copied, or ask for a new invite.'
                : 'Sotto can’t be reached right now. Try again in a moment.'}
            </AuthTitle>
          </>
        }
      >
        {!missing && (
          <Button className="w-full" onClick={() => preview.refetch()}>
            Try again
          </Button>
        )}
        <Button variant="ghost" className="w-full" onClick={() => loadPage('/home')}>
          Go to Sotto
        </Button>
      </AuthScreen>
    );
  }

  const invite = preview.data;
  const from = invite.invitedBy?.name || invite.invitedBy?.email || 'Someone';

  if (invite.state !== 'pending') {
    const copy = {
      accepted: {
        title: `You’ve joined ${invite.workspace.name}`,
        body: 'This invite has been used. Open Sotto to carry on.',
      },
      expired: {
        title: 'This invite has expired',
        body: `Invites last a week. Ask ${from} to send a new one.`,
      },
      revoked: {
        title: 'This invite was withdrawn',
        body: `Ask ${from} if you should still join ${invite.workspace.name}.`,
      },
      declined: {
        title: 'This invite was declined',
        body: `Ask ${from} to send a new one if you’d like to join.`,
      },
    }[invite.state];
    return (
      <AuthScreen
        stage={invite.state}
        hero={
          <>
            <Illustration name="team" className="mb-2 text-primary-text" />
            <AuthTitle title={copy.title}>{copy.body}</AuthTitle>
          </>
        }
      >
        <Button
          className="w-full"
          variant={invite.state === 'accepted' ? 'primary' : 'ghost'}
          onClick={() => loadPage('/home')}
        >
          Open Sotto
        </Button>
      </AuthScreen>
    );
  }

  const here = `/invite/${encodeURIComponent(id)}`;
  const wrongAccount = signedInAs && signedInAs.toLowerCase() !== invite.email.toLowerCase();

  function join() {
    setError(null);
    accept.mutate(id, {
      onSuccess: async () => {
        // The new workspace is active now; make sure /me agrees before entering the app.
        await fetchMe().catch(() => null);
        loadPage('/home');
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Couldn’t join. Try again.'),
    });
  }

  return (
    <AuthScreen
      stage="pending"
      hero={
        <>
          <span
            aria-hidden
            className="mb-3 grid size-16 place-items-center rounded-[18px] bg-primary text-[28px] font-bold text-primary-foreground shadow-fab"
          >
            {invite.workspace.name.trim().charAt(0).toUpperCase()}
          </span>
          <AuthTitle title={`Join ${invite.workspace.name}`}>
            {from} invited you to join as {ROLE_PHRASE[invite.role]}. The invite is for{' '}
            <span className="font-semibold text-foreground">{invite.email}</span> and lasts until{' '}
            {formatDay(invite.expiresAt)}.
          </AuthTitle>
        </>
      }
    >
      {error && <AuthNotice>{error}</AuthNotice>}
      {wrongAccount && (
        <AuthNotice tone="info">
          You’re signed in as <span className="font-semibold">{signedInAs}</span>. Switch to{' '}
          {invite.email} to accept.
        </AuthNotice>
      )}
      {signedInAs && !wrongAccount && (
        <Button className="w-full" loading={accept.isPending} onClick={join}>
          Join {invite.workspace.name}
        </Button>
      )}
      {wrongAccount && (
        <Button
          className="w-full"
          onClick={async () => {
            await authClient.signOut();
            loadPage(
              `/sign-in?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`,
            );
          }}
        >
          Switch account
        </Button>
      )}
      {!signedInAs && (
        <Button
          className="w-full"
          onClick={() =>
            loadPage(
              `/sign-in?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`,
            )
          }
        >
          Sign in to join
        </Button>
      )}
      <AuthNote>Not expecting this? You can ignore it. Nobody joins unless they accept.</AuthNote>
    </AuthScreen>
  );
}
