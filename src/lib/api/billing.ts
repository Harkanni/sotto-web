'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, isSignedOut, type Schemas } from './client';
import { useActiveWorkspace } from './hooks';
import { useHydrationSafe } from './hydration';

export type UsageReport = Schemas['UsageReport'];
export type Billing = Schemas['Billing'];
export type Plan = Schemas['Plan'];
export type UsageRange = '7d' | '30d' | '90d';

export const billingKeys = {
  all: (w: string) => ['api', 'w', w, 'billing'] as const,
  usage: (w: string, range: UsageRange) => ['api', 'w', w, 'billing', 'usage', range] as const,
  billing: (w: string) => ['api', 'w', w, 'billing', 'summary'] as const,
};

function retryable(count: number, error: Error): boolean {
  if (isSignedOut(error)) return false;
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return count < 1;
}

/** This month against the plan, and daily usage for the chart (owners). */
export function useUsage(range: UsageRange, enabled = true) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: billingKeys.usage(workspace?.id ?? '', range),
      queryFn: () => call(api.GET('/api/v1/usage', { params: { query: { range } } })),
      enabled: enabled && Boolean(workspace),
      // Switching the range keeps the last chart up until the new one arrives.
      placeholderData: keepPreviousData,
      retry: retryable,
    }),
  );
}

export function useBilling(enabled = true) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: billingKeys.billing(workspace?.id ?? ''),
      queryFn: () => call(api.GET('/api/v1/billing')),
      enabled: enabled && Boolean(workspace),
      retry: retryable,
    }),
  );
}

/** Opens the payment page (the provider's, or the app itself for the test checkout). */
export function useCheckout() {
  return useMutation({
    mutationFn: (body: Schemas['CheckoutBody']) =>
      call(api.POST('/api/v1/billing/checkout', { body })),
    onSuccess: ({ url }) => {
      if (url) window.location.assign(url);
    },
  });
}

/** Back from checkout: the api verifies the payment before the plan changes. */
export function useConfirmCheckout() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (reference: string) =>
      call(api.POST('/api/v1/billing/confirm', { body: { reference } })),
    onSuccess: (billing) => {
      if (!workspace) return;
      client.setQueryData(billingKeys.billing(workspace.id), billing);
      void client.invalidateQueries({ queryKey: billingKeys.all(workspace.id) });
      // The plan decides which AI modes can be used.
      void client.invalidateQueries({ queryKey: ['api', 'w', workspace.id, 'ai'] });
    },
  });
}

export function usePortal() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: () => call(api.POST('/api/v1/billing/portal')),
    onSuccess: ({ url }) => {
      if (url) {
        window.location.assign(url);
        return;
      }
      if (!workspace) return;
      void client.invalidateQueries({ queryKey: billingKeys.all(workspace.id) });
      void client.invalidateQueries({ queryKey: ['api', 'w', workspace.id, 'ai'] });
    },
  });
}

/** "₦15,000" from kobo; no decimals for whole naira. */
export function formatPrice(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** "12.3k", "1.2M": tokens at a glance. */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3)
    return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

/** How full a meter is: calm, near (80%+) or full. Unlimited and "not included" are neither. */
export function meterLevel(used: number, limit: number | null): 'ok' | 'near' | 'full' | 'none' {
  if (limit === null || limit === 0) return 'none';
  const ratio = used / limit;
  return ratio >= 1 ? 'full' : ratio >= 0.8 ? 'near' : 'ok';
}
