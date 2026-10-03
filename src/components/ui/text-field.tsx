'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A labelled text field (forms: email, names, invites). The label sits above like a list
 * section header; the field is 50 px tall with 17 px text (iOS never zooms on focus). On the
 * grey page it's a white card (`surface="page"`); inside cards and sheets it's filled
 * (`surface="card"`). Errors replace the hint, are announced, and mark the field invalid.
 */
export function TextField({
  label,
  hideLabel = false,
  hint,
  error,
  surface = 'card',
  className,
  inputClassName,
  ...input
}: Omit<React.ComponentProps<'input'>, 'className'> & {
  label: string;
  /** Keep the label for screen readers only (the context names the field). */
  hideLabel?: boolean;
  /** One line under the field. */
  hint?: React.ReactNode;
  /** Shown instead of the hint; marks the field invalid. */
  error?: string | null;
  /** What the field sits on: the grey page or a card/sheet. */
  surface?: 'page' | 'card';
  className?: string;
  inputClassName?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cn('px-4 text-footnote text-muted-foreground', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cn(
          'h-[50px] w-full min-w-0 rounded-input px-4 text-[17px] leading-[22px] tracking-[var(--tracking-body)] text-foreground',
          'placeholder:text-muted-foreground disabled:opacity-40',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          'aria-invalid:shadow-[inset_0_0_0_1.5px_var(--destructive-text)]',
          'transition-[box-shadow] duration-150 ease-out',
          surface === 'page' ? 'bg-card' : 'bg-fill',
          inputClassName,
        )}
        {...input}
      />
      {note && (
        <p
          id={noteId}
          role={error ? 'alert' : undefined}
          className={cn(
            'px-4 text-footnote',
            error ? 'text-destructive-text' : 'text-muted-foreground',
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}
