'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * An action that can't be undone, confirmed in place (removing a person, a passkey, withdrawing
 * an invite). The first press turns the red row into Cancel and the action itself, in the same
 * 44 px of height, so a sheet never changes size. Deletes that can be undone don't ask: they
 * offer Undo in a toast instead (UI_DESIGN_SYSTEM §7).
 */
export function ConfirmAction({
  label,
  confirmLabel,
  note,
  onConfirm,
  loading = false,
  disabled = false,
  surface = 'page',
  className,
}: {
  /** The red row: "Remove from workspace". */
  label: string;
  /** The final button: "Remove Amaka". */
  confirmLabel: string;
  /** What happens, under the row: always visible, so the confirmation adds no reading. */
  note?: React.ReactNode;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** What it sits on: the grey page (a card row) or a sheet (a nested row). */
  surface?: 'page' | 'sheet';
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Keyboard and screen-reader users land on the safe choice.
  useEffect(() => {
    if (asking) cancelRef.current?.focus({ preventScroll: true });
  }, [asking]);

  return (
    <div className={cn('flex flex-col gap-1.5 px-[var(--gutter)]', className)}>
      {asking ? (
        <div
          role="group"
          aria-label={label}
          className="flex gap-2 animate-[fade-in_150ms_var(--ease-out)]"
        >
          <Button
            ref={cancelRef}
            variant="secondary"
            className="flex-1"
            disabled={loading}
            onClick={() => setAsking(false)}
          >
            Cancel
          </Button>
          <Button variant="destructive" className="flex-1" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setAsking(true)}
          className={cn(
            'flex min-h-11 w-full items-center rounded-card px-4 text-left text-body text-destructive-text select-none',
            'transition-[background-color] duration-300 ease-out active:bg-row-pressed active:delay-[40ms] active:duration-0',
            'can-hover:hover:bg-fill-subtle disabled:opacity-40',
            'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
            surface === 'sheet' ? 'bg-card-nested' : 'bg-card',
          )}
        >
          {label}
        </button>
      )}
      {note && <p className="px-4 text-footnote text-muted-foreground">{note}</p>}
    </div>
  );
}
