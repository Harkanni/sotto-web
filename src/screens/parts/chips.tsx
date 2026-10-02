'use client';

import { cn } from '@/lib/utils';

/**
 * A row of filter chips that scrolls sideways (the page still scrolls vertically through it).
 * Single choice, announced as a radio group.
 */
export function ChipGroup<T extends string>({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: string }[];
  'aria-label': string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'flex snap-x scroll-px-[var(--gutter)] gap-2 overflow-x-auto px-[var(--gutter)] py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'touch-pan-x touch-pan-y',
        className,
      )}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next =
          options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]!;
        onValueChange(next.value);
        (
          e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null
        )?.focus();
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-value={o.value}
            onClick={() => onValueChange(o.value)}
            className={cn(
              'pressable relative h-9 shrink-0 snap-start rounded-full px-4 text-[15px] leading-5 font-medium whitespace-nowrap select-none',
              'before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""]',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-fill text-foreground hover:bg-fill-strong active:bg-fill-strong',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
