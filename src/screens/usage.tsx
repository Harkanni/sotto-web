'use client';

import { CreditCard } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Screen } from '@/components/shell/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { List, ListRow, RowIcon } from '@/components/ui/list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import {
  type Billing,
  type Plan,
  type UsageRange,
  type UsageReport,
  compactNumber,
  formatBytes,
  formatPrice,
  meterLevel,
  useBilling,
  useCheckout,
  useConfirmCheckout,
  usePortal,
  useUsage,
} from '@/lib/api/billing';
import { useActiveWorkspace } from '@/lib/api/hooks';
import { useNav } from '@/lib/nav/hooks';
import { navigate } from '@/lib/nav/store';
import { cn } from '@/lib/utils';
import { RowsSkeleton } from './parts/rows';

type Meter = UsageReport['meters'][number];
type Interval = 'monthly' | 'yearly';

const METER_LABEL: Record<Meter['id'], string> = {
  privateTokens: 'Private AI',
  managedTokens: 'Managed AI',
  transcriptionMinutes: 'Transcription',
  storageBytes: 'Storage',
};

/** A meter's number; the unit only on the last one ("858 of 200K tokens"). */
function amount(id: Meter['id'], n: number, unit = true): string {
  if (id === 'storageBytes') return formatBytes(n);
  if (id === 'transcriptionMinutes') return unit ? `${Math.round(n)} min` : String(Math.round(n));
  return unit ? `${compactNumber(n)} tokens` : compactNumber(n);
}

function dayLabel(date: string, withMonth = true): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    ...(withMonth ? { month: 'short' } : {}),
    timeZone: 'UTC',
  });
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

// ── The plan ───────────────────────────────────────────────────────────────────────────

function statusLine(billing: Billing): { text: string; tone: 'muted' | 'warning' } {
  const sub = billing.subscription;
  if (!sub || billing.plan.id === 'FREE')
    return { text: 'Free forever, no card needed', tone: 'muted' };
  const end = sub.currentPeriodEnd ? longDate(sub.currentPeriodEnd) : null;
  if (sub.status === 'PAST_DUE') {
    return { text: 'The last payment failed. Update the card to keep the plan.', tone: 'warning' };
  }
  if (sub.status === 'CANCELLED')
    return { text: end ? `Ends on ${end}` : 'Cancelled', tone: 'muted' };
  return { text: end ? `Renews on ${end}` : 'Active', tone: 'muted' };
}

function PlanCard({ billing }: { billing: Billing }) {
  const portal = usePortal();
  const status = statusLine(billing);
  const paid = billing.plan.id !== 'FREE' && billing.subscription !== null;
  const test = billing.subscription?.provider === 'test';
  return (
    <section
      aria-label="Your plan"
      className="mx-[var(--gutter)] flex flex-col gap-3 rounded-card bg-card p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <RowIcon icon={CreditCard} tint="green" />
        <div className="min-w-0 flex-1">
          <p className="text-footnote text-muted-foreground">Your plan</p>
          <h2 className="truncate text-title-3">{billing.plan.name}</h2>
          <p
            className={cn(
              'mt-0.5 text-subhead',
              status.tone === 'warning' ? 'text-warning-text' : 'text-muted-foreground',
            )}
          >
            {status.text}
          </p>
        </div>
      </div>
      {billing.provider.testMode && (
        <p className="text-footnote text-muted-foreground">
          <Badge className="mr-1.5">Test</Badge>
          {billing.provider.label}. No real money moves.
        </p>
      )}
      {paid && billing.subscription?.status !== 'CANCELLED' && (
        <Button
          variant="secondary"
          className="w-full md:w-auto md:self-start"
          loading={portal.isPending}
          onClick={() =>
            portal.mutate(undefined, {
              onSuccess: ({ url }) => {
                if (!url) toast('Back on the Free plan', { description: 'The test plan ended.' });
              },
              onError: (e) => toast(messageOf(e)),
            })
          }
        >
          {test ? 'End the test plan' : 'Manage subscription'}
        </Button>
      )}
    </section>
  );
}

// ── This month ─────────────────────────────────────────────────────────────────────────

function MeterRow({ meter, plan }: { meter: Meter; plan: Plan }) {
  const level = meterLevel(meter.used, meter.limit);
  const ratio = meter.limit ? Math.min(1, meter.used / meter.limit) : 0;
  const notIncluded = meter.limit === 0;
  const value = notIncluded
    ? 'Comes with Pro'
    : meter.limit === null
      ? `${amount(meter.id, meter.used)} · no limit`
      : `${amount(meter.id, meter.used, false)} of ${amount(meter.id, meter.limit)}`;
  return (
    <li className="list-row flex min-h-11 flex-col justify-center gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body">{METER_LABEL[meter.id]}</span>
        <span
          className={cn(
            'truncate text-subhead tabular-nums',
            level === 'full' ? 'text-destructive-text' : 'text-muted-foreground',
          )}
        >
          {value}
        </span>
      </div>
      {!notIncluded && meter.limit !== null && (
        <div
          role="meter"
          aria-label={METER_LABEL[meter.id]}
          aria-valuemin={0}
          aria-valuemax={meter.limit}
          aria-valuenow={Math.min(meter.used, meter.limit)}
          aria-valuetext={value}
          className="h-1.5 overflow-hidden rounded-full bg-fill"
        >
          {/* A translate, never a width: the bar is the compositor's to move. */}
          <div
            className={cn(
              'h-full w-full rounded-full transition-[translate] duration-300 ease-[var(--ease-out)]',
              level === 'full'
                ? 'bg-destructive'
                : level === 'near'
                  ? 'bg-warning-text'
                  : 'bg-primary',
            )}
            style={{ translate: `${(ratio - 1) * 100}% 0` }}
          />
        </div>
      )}
      {level === 'full' && (
        <p className="text-footnote text-destructive-text">
          {meter.id === 'storageBytes'
            ? 'Full. Empty the trash or delete files to upload more.'
            : `Used up for this month on ${plan.name}.`}
        </p>
      )}
    </li>
  );
}

// ── Daily usage ────────────────────────────────────────────────────────────────────────

/**
 * AI tokens per day, one series in the accent (the meters above carry the split by mode, and
 * the tooltip repeats it per day). Bars are thin with a 2px gap and rounded data-ends; the
 * only gridline marks the busiest day. A hidden table gives screen readers the numbers.
 */
function UsageChart({ daily }: { daily: UsageReport['daily'] }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = daily.map((d) => d.privateTokens + d.managedTokens + d.byokTokens);
  const max = Math.max(...totals, 0);
  const sum = totals.reduce((a, b) => a + b, 0);
  const shown = active ?? null;
  const day = shown !== null ? daily[shown] : null;
  const dense = daily.length > 31;
  return (
    <figure className="mx-[var(--gutter)] rounded-card bg-card p-4 shadow-card">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-headline">AI tokens per day</span>
        <span className="text-subhead text-muted-foreground tabular-nums">
          {compactNumber(sum)} in all
        </span>
      </figcaption>
      {/* The tooltip line: what's under the finger or pointer, else a hint. A fixed slot. */}
      <p
        className="mt-1 min-h-5 truncate text-footnote text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        {day
          ? `${dayLabel(day.date)}: ${compactNumber(totals[shown!]!)} · Private ${compactNumber(day.privateTokens)} · Managed ${compactNumber(day.managedTokens)} · Your keys ${compactNumber(day.byokTokens)}`
          : max > 0
            ? 'Tap or point at a day for its numbers.'
            : 'No questions answered in this period.'}
      </p>
      <div
        role="img"
        aria-label={`AI tokens per day, ${compactNumber(sum)} in all, busiest day ${compactNumber(max)}.`}
        className="relative mt-3 h-36"
        onPointerLeave={() => setActive(null)}
      >
        {max > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-separator">
            <span className="absolute -top-2 left-0 bg-card pr-1 text-caption text-muted-foreground tabular-nums">
              {compactNumber(max)}
            </span>
          </div>
        )}
        <div className={cn('absolute inset-0 flex items-end', dense ? 'gap-px' : 'gap-0.5')}>
          {daily.map((d, i) => {
            const h = max ? totals[i]! / max : 0;
            return (
              <button
                key={d.date}
                type="button"
                aria-label={`${dayLabel(d.date)}: ${totals[i]} tokens`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="group flex h-full min-w-0 flex-1 items-end outline-none"
              >
                <span
                  aria-hidden
                  className={cn(
                    'block w-full rounded-t-[4px] transition-opacity duration-150',
                    h > 0 ? 'bg-primary' : 'bg-fill',
                    active !== null && active !== i ? 'opacity-40' : 'opacity-100',
                    'group-focus-visible:outline-2 group-focus-visible:outline-ring',
                  )}
                  style={{ height: h > 0 ? `max(3px, ${h * 100}%)` : '2px' }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-caption text-muted-foreground tabular-nums">
        <span>{daily[0] ? dayLabel(daily[0].date) : ''}</span>
        <span>{daily.at(-1) ? dayLabel(daily.at(-1)!.date) : ''}</span>
      </div>
      <table className="sr-only">
        <caption>AI tokens per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Private</th>
            <th>Managed</th>
            <th>Your keys</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.date}>
              <td>{dayLabel(d.date)}</td>
              <td>{d.privateTokens}</td>
              <td>{d.managedTokens}</td>
              <td>{d.byokTokens}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function ThisMonth({ range, onRange }: { range: UsageRange; onRange: (r: UsageRange) => void }) {
  const usage = useUsage(range);
  return (
    <AsyncWidget
      query={usage}
      label="Usage"
      errorTitle="Couldn’t load the usage"
      isEmpty={() => false}
      empty={{ illustration: 'tasks', title: 'No usage yet' }}
      skeleton={
        <div className="px-[var(--gutter)]">
          <RowsSkeleton rows={4} />
        </div>
      }
    >
      {(report) => (
        <div className="flex flex-col gap-7">
          <List
            header="This month"
            footer={`Limits reset on ${longDate(report.period.end)}. Questions answered with your own keys are never limited: ${compactNumber(report.byokTokens)} tokens this month.`}
          >
            {report.meters.map((m) => (
              <MeterRow key={m.id} meter={m} plan={report.plan} />
            ))}
          </List>
          <div className="flex flex-col gap-3">
            <div className="px-[var(--gutter)]">
              <SegmentedControl<UsageRange>
                aria-label="Period"
                value={range}
                onValueChange={onRange}
                segments={[
                  { value: '7d', label: '7 days' },
                  { value: '30d', label: '30 days' },
                  { value: '90d', label: '90 days' },
                ]}
              />
            </div>
            <UsageChart daily={report.daily} />
          </div>
        </div>
      )}
    </AsyncWidget>
  );
}

// ── Plans ──────────────────────────────────────────────────────────────────────────────

function Plans({ billing }: { billing: Billing }) {
  const checkout = useCheckout();
  const [interval, setInterval] = useState<Interval>('monthly');
  const current = billing.plan.id;
  const paidActive =
    billing.subscription !== null &&
    billing.subscription.status !== 'CANCELLED' &&
    billing.plan.id !== 'FREE';
  const placeholder = billing.plans.some((p) => p.placeholderPrices);
  return (
    <div className="flex flex-col gap-3">
      <div className="px-[var(--gutter)]">
        <SegmentedControl<Interval>
          aria-label="Billing period"
          value={interval}
          onValueChange={setInterval}
          segments={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
        />
      </div>
      <List
        header="Plans"
        footer={
          placeholder
            ? 'Prices are placeholders while Sotto is in preview.'
            : 'Prices include everything listed. Cancel any time.'
        }
      >
        {billing.plans.map((plan) => {
          const isCurrent = plan.id === current;
          const price = plan.price
            ? plan.price.monthly === 0
              ? 'Free'
              : `${formatPrice(interval === 'yearly' ? plan.price.yearly : plan.price.monthly, plan.currency)}/${interval === 'yearly' ? 'yr' : 'mo'}`
            : 'Talk to us';
          const canChoose = plan.selfServe && !isCurrent && !paidActive;
          const pending = checkout.isPending && checkout.variables?.plan === plan.id;
          return (
            <ListRow
              key={plan.id}
              plain
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{plan.name}</span>
                  {isCurrent && <Badge tone="accent">Current</Badge>}
                </span>
              }
              subtitle={plan.features.slice(0, 2).join(' · ')}
              detail={canChoose ? undefined : price}
              trailing={
                canChoose ? (
                  <Button
                    variant="ghost"
                    loading={pending}
                    aria-label={`Choose ${plan.name}, ${price}`}
                    onClick={() =>
                      checkout.mutate(
                        { plan: plan.id as 'PRO' | 'BUSINESS', interval },
                        { onError: (e) => toast(messageOf(e)) },
                      )
                    }
                  >
                    {price}
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </List>
    </div>
  );
}

/** Back from checkout (`?checkout=done&reference=…`): confirm once, then tidy the address. */
function useReturnFromCheckout(base: string) {
  const nav = useNav();
  const confirm = useConfirmCheckout();
  const done = useRef(false);
  const reference = useMemo(() => {
    const params = new URLSearchParams(nav.search);
    return params.get('checkout') === 'done'
      ? (params.get('reference') ?? params.get('trxref'))
      : null;
  }, [nav.search]);
  useEffect(() => {
    if (!reference || done.current) return;
    done.current = true;
    confirm.mutate(reference, {
      onSuccess: (billing) =>
        toast(`You’re on ${billing.plan.name}`, {
          description: billing.provider.testMode
            ? 'Test checkout: nothing was charged.'
            : undefined,
        }),
      onError: (e) => toast(messageOf(e)),
      onSettled: () => navigate(base, { replace: true, intent: 'none' }),
    });
  }, [reference, confirm, base]);
}

/** Profile → Usage and billing (owners): the plan, this month against it, and the plans. */
export function UsageScreen() {
  const workspace = useActiveWorkspace();
  const owner = workspace?.role === 'owner';
  const billing = useBilling(owner);
  const [range, setRange] = useState<UsageRange>('30d');
  useReturnFromCheckout('/profile/usage');

  if (workspace && !owner) {
    return (
      <Screen title="Usage and billing" largeTitle={false}>
        <div className="mx-[var(--gutter)] mt-4 rounded-card bg-card">
          <EmptyState
            illustration="tasks"
            title="Only the owner sees billing"
            description={`Ask the owner of ${workspace.name} about the plan and its limits.`}
          />
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Usage and billing" largeTitle={false}>
      <div className="flex flex-col gap-7 pt-4 pb-8">
        <AsyncWidget
          query={billing}
          label="Billing"
          errorTitle="Couldn’t load the plan"
          isEmpty={() => false}
          empty={{ illustration: 'tasks', title: 'No plan' }}
          skeleton={
            <div className="px-[var(--gutter)]">
              <RowsSkeleton rows={2} />
            </div>
          }
        >
          {(b) => <PlanCard billing={b} />}
        </AsyncWidget>
        <ThisMonth range={range} onRange={setRange} />
        {billing.data && <Plans billing={billing.data} />}
      </div>
    </Screen>
  );
}
