'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Illustration, type IllustrationName } from './illustrations';

/** Shown only after this long, so fast loads never flash a skeleton (brief §8)… */
export const SKELETON_DELAY = 150;
/** …and once shown, kept at least this long, so it never flickers. */
export const SKELETON_MIN = 300;

type Phase = 'waiting' | 'skeleton' | 'ready';

/**
 * Turns "is it loading?" into what to draw: nothing (reserved space) for the first 150 ms, then a
 * skeleton for at least 300 ms, then the content. State changes only in timer callbacks.
 */
export function useLoadingPhase(loading: boolean): { phase: Phase; revealed: boolean } {
  // When the skeleton appeared (null: not shown in this loading cycle).
  const [shownAt, setShownAt] = useState<number | null>(null);
  // The skeleton has been up for its minimum time.
  const [held, setHeld] = useState(false);
  const [wasLoading, setWasLoading] = useState(loading);
  if (loading !== wasLoading) {
    setWasLoading(loading);
    if (loading) {
      // A new loading cycle (a Retry): start over.
      setShownAt(null);
      setHeld(false);
    }
  }

  useEffect(() => {
    if (!loading || shownAt !== null) return;
    const timer = setTimeout(() => setShownAt(performance.now()), SKELETON_DELAY);
    return () => clearTimeout(timer);
  }, [loading, shownAt]);

  useEffect(() => {
    if (shownAt === null || held) return;
    const timer = setTimeout(
      () => setHeld(true),
      Math.max(0, SKELETON_MIN - (performance.now() - shownAt)),
    );
    return () => clearTimeout(timer);
  }, [shownAt, held]);

  const phase: Phase = loading
    ? shownAt === null
      ? 'waiting'
      : 'skeleton'
    : shownAt !== null && !held
      ? 'skeleton'
      : 'ready';
  // Content that replaces a visible skeleton fades in instead of popping.
  return { phase, revealed: shownAt !== null && held && !loading };
}

export type EmptyStateProps = {
  illustration: IllustrationName;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/** An empty widget is an invitation to act: what's missing, and the one thing to do about it. */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-8 text-center', className)}>
      <Illustration name={illustration} className="h-auto w-24 text-primary-text" />
      <h3 className="mt-4 text-headline">{title}</h3>
      {description && (
        <p className="mt-1 max-w-[34ch] text-callout text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export type ErrorStateProps = {
  title: string;
  description?: string;
  requestId?: string;
  onRetry?: () => void;
  retrying?: boolean;
  offline?: boolean;
  className?: string;
};

/** Plain words, a Retry that reloads only this widget, and the request ID for support. */
export function ErrorState({
  title,
  description,
  requestId,
  onRetry,
  retrying,
  offline,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center px-6 py-7 text-center', className)}
    >
      <Illustration
        name={offline ? 'offline' : 'error'}
        className="h-auto w-20 text-muted-foreground"
      />
      <h3 className="mt-3 text-headline">{offline ? 'You’re offline' : title}</h3>
      <p className="mt-1 max-w-[36ch] text-callout text-muted-foreground">
        {offline
          ? 'This will load when you’re back online.'
          : (description ?? 'Something went wrong on our side. Try again in a moment.')}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          className="mt-4"
          icon={<RotateCw aria-hidden />}
          loading={retrying}
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
      {requestId && !offline && (
        <details className="group mt-3 text-footnote text-muted-foreground">
          <summary className="inline-flex min-h-11 cursor-default list-none items-center rounded-button px-3 marker:hidden hover:text-foreground [&::-webkit-details-marker]:hidden">
            Details
          </summary>
          <p className="pb-1 select-all">
            Request ID <code className="font-mono text-[13px] text-foreground">{requestId}</code>
          </p>
        </details>
      )}
    </div>
  );
}

function requestIdOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'requestId' in error) {
    const id = (error as { requestId?: unknown }).requestId;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

function isOfflineError(error: unknown): boolean {
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    (error instanceof Error && error.name === 'OfflineError')
  );
}

export type AsyncWidgetProps<T> = {
  query: UseQueryResult<T>;
  /** Mirrors the final layout, so nothing shifts when data arrives. */
  skeleton: React.ReactNode;
  /** Defaults to "an empty array". */
  isEmpty?: (data: T) => boolean;
  empty: EmptyStateProps;
  /** "Couldn't load recent files" */
  errorTitle: string;
  /** Names the widget for screen readers: "Recent files". */
  label: string;
  children: (data: T) => React.ReactNode;
  className?: string;
};

/**
 * Every data widget's loading, empty and error states in one place (brief §8). TanStack Query
 * plus an error boundary per widget, so one failure never takes down the page, and Retry
 * refetches only this widget.
 */
export function AsyncWidget<T>({
  query,
  skeleton,
  isEmpty = (data) => Array.isArray(data) && data.length === 0,
  empty,
  errorTitle,
  label,
  children,
  className,
}: AsyncWidgetProps<T>) {
  const hasData = query.data !== undefined;
  const loading = !hasData && (query.isPending || (query.isFetching && query.isError));
  const { phase, revealed } = useLoadingPhase(loading);
  const retry = () => void query.refetch();

  let body: React.ReactNode;
  if (phase !== 'ready') {
    body = (
      <div aria-hidden className={cn(phase === 'waiting' && 'invisible')}>
        {skeleton}
      </div>
    );
  } else if (!hasData && query.isError) {
    body = (
      <ErrorState
        title={errorTitle}
        requestId={requestIdOf(query.error)}
        offline={isOfflineError(query.error)}
        onRetry={retry}
        retrying={query.isFetching}
      />
    );
  } else if (!hasData && query.fetchStatus === 'paused') {
    body = <ErrorState title={errorTitle} offline onRetry={retry} />;
  } else if (hasData && isEmpty(query.data as T)) {
    body = <EmptyState {...empty} />;
  } else if (hasData) {
    body = (
      <ErrorBoundary
        FallbackComponent={({ resetErrorBoundary }: FallbackProps) => (
          <ErrorState
            title={errorTitle}
            description="This part of the page hit a problem. The rest still works."
            onRetry={() => {
              resetErrorBoundary();
              retry();
            }}
          />
        )}
      >
        <div className={cn(revealed && 'animate-[fade-in_220ms_var(--ease-out)]')}>
          {children(query.data as T)}
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <div className={className} aria-busy={loading || undefined} aria-label={label} role="region">
      {loading && <span className="sr-only">Loading {label.toLowerCase()}</span>}
      {body}
    </div>
  );
}
