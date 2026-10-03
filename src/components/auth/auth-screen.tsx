'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The frame for screens outside the app shell: sign-in, onboarding and invites. Phone first and
 * one-handed: the message sits in the upper part of the screen and every action in the bottom
 * part, within thumb reach (brief §9). From 768 px the column is centred on the page.
 *
 * `stage` keys the content: when it changes (form → "check your email"), the new content rises
 * in on the standard spring as the answer to what you just did; reduced motion crossfades.
 */
export function AuthScreen({
  hero,
  children,
  stage,
  className,
}: {
  hero: React.ReactNode;
  children: React.ReactNode;
  stage?: string;
  className?: string;
}) {
  // Only a stage reached by an action animates in; the first one is simply there (no entrance
  // animations on page load).
  const [initial] = useState(stage);
  return (
    <main
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-[var(--gutter)] pt-safe',
        'md:justify-center md:py-12',
        className,
      )}
    >
      <div
        key={stage}
        data-animate={stage !== initial || undefined}
        className="auth-stage flex flex-1 flex-col md:flex-none"
      >
        <header className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center md:flex-none md:pt-0 md:pb-8">
          {hero}
        </header>
        <div className="flex flex-col gap-3 pb-[max(var(--safe-bottom),24px)]">{children}</div>
      </div>
    </main>
  );
}

/** The large title of an auth screen and the line under it. */
export function AuthTitle({
  title,
  children,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <h1 className="text-title-1 text-balance">{title}</h1>
      {children && (
        <p className="max-w-[34ch] text-callout text-balance text-muted-foreground">{children}</p>
      )}
    </>
  );
}

/** "or" between the main action and the alternatives. */
export function OrDivider() {
  return (
    <div
      role="separator"
      className="flex items-center gap-3 py-1 text-footnote text-muted-foreground"
    >
      <span aria-hidden className="h-px flex-1 bg-separator" />
      or
      <span aria-hidden className="h-px flex-1 bg-separator" />
    </div>
  );
}

/** A quiet note under an auth screen's actions. */
export function AuthNote({ children }: { children: React.ReactNode }) {
  return <p className="px-4 text-center text-footnote text-muted-foreground">{children}</p>;
}

/** An inline message about the last action (a failed link, a server answer). */
export function AuthNotice({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info';
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-card px-4 py-3 text-callout',
        tone === 'error'
          ? 'bg-[color-mix(in_srgb,var(--destructive-text)_10%,var(--card))] text-destructive-text'
          : 'bg-primary-tint text-foreground/75',
      )}
    >
      {children}
    </p>
  );
}
