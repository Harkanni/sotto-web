import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Small status labels: 12 px semibold on a 10% tint of their colour (16% in dark mode). Every
 * pairing holds 4.5:1 (see tokens.css). Metadata only, so 12 px is allowed (brief §8).
 */
const badgeVariants = cva(
  [
    'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] leading-4 font-semibold tracking-[0.01em] whitespace-nowrap',
    'bg-[color-mix(in_srgb,var(--badge)_10%,transparent)] text-[var(--badge)] dark:bg-[color-mix(in_srgb,var(--badge)_16%,transparent)]',
    '[&_svg]:size-3',
  ],
  {
    variants: {
      tone: {
        neutral: '[--badge:var(--label-internal)]',
        accent: '[--badge:var(--label-accent)]',
        success: '[--badge:var(--label-public)]',
        warning: '[--badge:var(--label-confidential)]',
        danger: '[--badge:var(--label-restricted)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

const SENSITIVITY: Record<Sensitivity, { label: string; tone: BadgeProps['tone'] }> = {
  public: { label: 'Public', tone: 'success' },
  internal: { label: 'Internal', tone: 'neutral' },
  confidential: { label: 'Confidential', tone: 'warning' },
  restricted: { label: 'Restricted', tone: 'danger' },
};

/** A document's sensitivity label (Docs). Restricted sources never reach outside AI models. */
export function SensitivityBadge({ level, className }: { level: Sensitivity; className?: string }) {
  const { label, tone } = SENSITIVITY[level];
  return (
    <Badge tone={tone} className={className} title={`Sensitivity: ${label}`}>
      {label}
    </Badge>
  );
}
