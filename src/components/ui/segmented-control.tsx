'use client';

import { RadioGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

export type Segment<T extends string> = { value: T; label: React.ReactNode; 'aria-label'?: string };

/**
 * iOS segmented control: a filled track with a raised thumb that springs between equal-width
 * segments. A radio group underneath, so arrow keys move the selection and screen readers hear
 * "1 of 3". Each segment's hit area extends to 44 px tall even though the control looks 32.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  segments,
  className,
  'aria-label': ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  segments: Segment<T>[];
  className?: string;
  'aria-label': string;
}) {
  const index = Math.max(
    0,
    segments.findIndex((s) => s.value === value),
  );
  const count = segments.length;

  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      aria-label={ariaLabel}
      orientation="horizontal"
      loop={false}
      className={cn('relative isolate grid h-8 rounded-[9px] bg-fill p-0.5 select-none', className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {/* The thumb: pure CSS position, so it moves on the compositor with a spring. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0.5 left-0.5 -z-10 rounded-[7px] bg-card shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] transition-transform duration-[var(--duration-standard)] ease-standard dark:bg-[#636366]"
        style={{
          width: `calc((100% - 4px) / ${count})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {segments.map((segment, i) => {
        const selected = i === index;
        // Hairline dividers between unselected neighbours, hidden next to the thumb.
        const divider = i > 0 && i !== index && i - 1 !== index;
        return (
          <RadioGroup.Item
            key={segment.value}
            value={segment.value}
            aria-label={segment['aria-label']}
            className={cn(
              'group/seg relative flex min-w-0 items-center justify-center rounded-[7px] px-2 outline-offset-0',
              'text-[15px] leading-5 font-medium tracking-[var(--tracking-subhead)]',
              // 44 px tall target around a 28 px segment.
              'before:absolute before:inset-x-0 before:-inset-y-2 before:content-[""]',
              selected ? 'font-semibold' : 'text-foreground/90',
            )}
          >
            {divider && (
              <span
                aria-hidden
                className="absolute top-1.5 bottom-1.5 left-0 w-px bg-separator opacity-80"
              />
            )}
            <span
              className={cn(
                'truncate transition-[opacity,transform] duration-200',
                !selected && 'group-active/seg:opacity-40',
                selected && 'group-active/seg:scale-95',
              )}
            >
              {segment.label}
            </span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
