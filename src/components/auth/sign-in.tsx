'use client';

import { KeyRound } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SottoMark } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TextField } from '@/components/ui/text-field';
import { Illustration } from '@/components/widgets/illustrations';
import { fetchMe, useSignInMethods } from '@/lib/api/hooks';
import { useIsClient } from '@/lib/prefs/stored';
import type { Me } from '@/lib/api/client';
import { authClient, canAutofillPasskeys, landing, supportsPasskeys } from '@/lib/auth/client';
import { AuthNote, AuthNotice, AuthScreen, AuthTitle, OrDivider } from './auth-screen';
import { loadPage } from '@/lib/auth/navigate';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_AFTER_S = 30;

type AuthError = { code?: string; message?: string; status?: number } | null | undefined;

/** Better Auth's error for a request, in Sotto's words. */
export function signInMessage(error: AuthError): string {
  if (!error) return 'Something went wrong. Try again.';
  if (error.status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (error.code === 'MAIL_NOT_CONFIGURED') {
    return 'Email isn’t set up on this server yet. Use a passkey, or ask whoever runs Sotto.';
  }
  if (error.code === 'MAIL_SEND_FAILED')
    return 'The email couldn’t be sent. Try again in a moment.';
  if (!error.status) return 'Sotto can’t be reached. Check your connection and try again.';
  return error.message || 'Something went wrong. Try again.';
}

/** Where to go once signed in: onboarding for people without a workspace, else back. */
function destination(me: Me | null, next: string | null): string {
  if (me && !me.workspace) return next ? `/welcome?next=${encodeURIComponent(next)}` : '/welcome';
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
}

/** Installed to the home screen (its sign-in links open in the browser instead). */
function standalone(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true)
  );
}

/**
 * Sign in (brief §4): an email link, a passkey (offered by the browser's autofill on the email
 * field, or with its own button), and Google or Microsoft when the server has them. New people
 * sign up the same way; onboarding follows.
 */
export function SignIn() {
  const params = useSearchParams();
  const next = params.get('next');
  const methods = useSignInMethods();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [stage, setStage] = useState<'form' | 'sent'>('form');
  const [error, setError] = useState<string | null>(
    params.has('error')
      ? 'That sign-in link has expired or was already used. Send a new one.'
      : null,
  );
  const [busy, setBusy] = useState<null | 'email' | 'passkey' | 'google' | 'microsoft'>(null);
  const [resendIn, setResendIn] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  // Known only in the browser; the server render leaves the button out.
  const passkeys = useIsClient() && supportsPasskeys();

  const finish = useCallback(async () => {
    let me: Me | null = null;
    try {
      me = await fetchMe();
    } catch {
      // Signed in, but /me didn't answer: the app sorts out the rest.
    }
    loadPage(destination(me, next));
  }, [next]);

  // Already signed in (a bookmarked sign-in page, the back button): carry on. Better Auth's
  // session check answers 200 either way, so a signed-out visit logs no failed request.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await authClient.getSession();
      if (!data || cancelled) return;
      const me = await fetchMe().catch(() => null);
      if (!cancelled) loadPage(destination(me, next), { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [next]);

  // Passkeys in the email field's autofill (conditional mediation), where the browser offers it.
  useEffect(() => {
    let active = true;
    void canAutofillPasskeys().then(async (available) => {
      if (!available || !active) return;
      const { data } = await authClient.signIn.passkey({ autoFill: true });
      if (data && active) await finish();
    });
    return () => {
      active = false;
    };
  }, [finish]);

  // The resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // Opened the link in another tab of this browser? This one notices and carries on.
  useEffect(() => {
    if (stage !== 'sent') return;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await authClient.getSession();
      if (!data) return;
      const me = await fetchMe().catch(() => null);
      loadPage(destination(me, next));
    };
    const run = () => void check();
    const timer = setInterval(run, 4000);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', run);
    };
  }, [stage, next]);

  async function sendLink(event?: React.FormEvent) {
    event?.preventDefault();
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setError('Enter your email address, like ada@company.com.');
      field.current?.focus();
      return;
    }
    setError(null);
    setBusy('email');
    const { error: failed } = await authClient.signIn.magicLink({
      email: address,
      ...landing(next),
    });
    setBusy(null);
    if (failed) {
      setError(signInMessage(failed));
      return;
    }
    setStage('sent');
    setResendIn(RESEND_AFTER_S);
  }

  async function withPasskey() {
    setError(null);
    setBusy('passkey');
    const { data, error: failed } = await authClient.signIn.passkey();
    setBusy(null);
    if (data) return finish();
    // Closing the browser's sheet isn't an error worth a message.
    const code = failed && 'code' in failed ? failed.code : undefined;
    if (failed && code !== 'AUTH_CANCELLED' && code !== 'ERROR_CEREMONY_ABORTED') {
      setError('That passkey didn’t work. Try again, or use your email.');
    }
  }

  async function withProvider(provider: 'google' | 'microsoft') {
    setError(null);
    setBusy(provider);
    const { error: failed } = await authClient.signIn.social({ provider, ...landing(next) });
    // On success the browser is already on its way to the provider.
    if (failed) {
      setBusy(null);
      setError(signInMessage(failed));
    }
  }

  if (stage === 'sent') {
    return (
      <AuthScreen
        stage="sent"
        hero={
          <>
            <Illustration name="mail" className="mb-2 text-primary-text" />
            <AuthTitle title="Check your email">
              We sent a sign-in link to{' '}
              <span className="font-semibold text-foreground">{email.trim()}</span>. It works once,
              for 10 minutes.
            </AuthTitle>
          </>
        }
      >
        {error && <AuthNotice>{error}</AuthNotice>}
        <p
          className="flex items-center justify-center gap-2 py-2 text-footnote text-muted-foreground"
          role="status"
        >
          <Spinner size={14} />
          Waiting for you to open the link
        </p>
        <Button
          variant="secondary"
          className="w-full"
          disabled={resendIn > 0}
          loading={busy === 'email'}
          onClick={() => void sendLink()}
        >
          {resendIn > 0 ? `Send again in ${resendIn} s` : 'Send the link again'}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setStage('form');
            setError(null);
            requestAnimationFrame(() => field.current?.focus());
          }}
        >
          Use a different email
        </Button>
        {standalone() && (
          <AuthNote>
            Links open in your browser. Sign in there, then add a passkey in Profile to sign in here
            in one step.
          </AuthNote>
        )}
      </AuthScreen>
    );
  }

  const social = methods.data;
  return (
    <AuthScreen
      stage="form"
      hero={
        <>
          <SottoMark size={64} className="mb-3 rounded-[18px] shadow-fab" />
          <AuthTitle title="Sign in to Sotto">
            Private AI for your team’s memos and meetings.
          </AuthTitle>
        </>
      }
    >
      {error && <AuthNotice>{error}</AuthNotice>}
      {!error && social && !social.magicLink && (
        <AuthNotice tone="info">
          Email sign-in isn’t set up on this server yet. Use a passkey if you have one.
        </AuthNotice>
      )}
      <form noValidate onSubmit={sendLink} className="flex flex-col gap-3">
        <TextField
          ref={field}
          label="Email"
          surface="page"
          type="email"
          inputMode="email"
          name="email"
          autoComplete="username webauthn"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
        />
        <Button type="submit" className="w-full" loading={busy === 'email'}>
          Continue with email
        </Button>
      </form>
      {(passkeys || social?.google || social?.microsoft) && <OrDivider />}
      {passkeys && (
        <Button
          variant="secondary"
          className="w-full"
          icon={<KeyRound aria-hidden />}
          loading={busy === 'passkey'}
          onClick={() => void withPasskey()}
        >
          Sign in with a passkey
        </Button>
      )}
      {social?.google && (
        <Button
          variant="secondary"
          className="w-full"
          loading={busy === 'google'}
          onClick={() => void withProvider('google')}
        >
          Continue with Google
        </Button>
      )}
      {social?.microsoft && (
        <Button
          variant="secondary"
          className="w-full"
          loading={busy === 'microsoft'}
          onClick={() => void withProvider('microsoft')}
        >
          Continue with Microsoft
        </Button>
      )}
      <AuthNote>
        New to Sotto? Continue with your work email and your account is set up as you sign in.
      </AuthNote>
    </AuthScreen>
  );
}
