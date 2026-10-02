import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

/**
 * Button (brief §8): a drop-in shadcn button — `variant`, `size`, `asChild` — with Sotto's four
 * variants and a `loading` prop.
 *
 * Every variant is exactly 44 px tall: 10 px + 24 px line + 10 px. Hover exists only where a
 * pointer can hover; press scales to 0.97 instantly and springs back on release.
 */
export const buttonVariants = cva(
  [
    'pressable relative inline-flex min-w-11 shrink-0 items-center justify-center gap-2',
    'rounded-button px-4 py-2.5 text-[16px] leading-6 font-semibold tracking-[var(--tracking-callout)]',
    'whitespace-nowrap select-none',
    'disabled:pointer-events-none disabled:opacity-40',
    'aria-disabled:pointer-events-none aria-disabled:opacity-40',
    'aria-busy:cursor-progress',
    '[&_svg:not([class*=size-])]:size-5 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary text-primary-foreground',
          'hover:bg-[color-mix(in_oklab,var(--primary),black_8%)]',
          'active:bg-[color-mix(in_oklab,var(--primary),black_12%)]',
        ],
        secondary: [
          'bg-transparent text-primary-text shadow-[inset_0_0_0_1px_var(--primary-text)]',
          'hover:bg-primary-tint active:bg-primary-tint-strong',
        ],
        ghost: [
          'bg-transparent text-primary-text',
          'hover:bg-primary-tint active:bg-primary-tint-strong',
        ],
        destructive: [
          'bg-destructive text-destructive-foreground',
          'hover:bg-[color-mix(in_oklab,var(--destructive),black_8%)]',
          'active:bg-[color-mix(in_oklab,var(--destructive),black_12%)]',
        ],
      },
      size: {
        default: '',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (a link, say) with the button's styles and behaviour. */
    asChild?: boolean;
    /** Leading icon. While loading, the spinner takes its place so the width never changes. */
    icon?: React.ReactNode;
    /** Shows a spinner, sets aria-busy and ignores clicks. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  icon,
  loading = false,
  children,
  onClick,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';

  // Without a leading icon there is nowhere for the spinner to go, so it sits over the label,
  // which turns transparent (still announced) and keeps the button's width.
  // (With asChild the label belongs to the child element, so the spinner simply overlays it.)
  const overlaySpinner = loading && !icon;
  const iconOnly = size === 'icon';

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? 'primary'}
      className={cn(buttonVariants({ variant, size }), className)}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? 'button')}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      {icon != null &&
        (loading ? (
          <Spinner size={iconOnly ? 20 : 16} className={iconOnly ? undefined : 'mx-0.5'} />
        ) : (
          icon
        ))}
      {overlaySpinner && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <Spinner />
        </span>
      )}
      <Slot.Slottable>
        {overlaySpinner && !asChild ? <span className="opacity-0">{children}</span> : children}
      </Slot.Slottable>
    </Comp>
  );
}
