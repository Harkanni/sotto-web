import { cn } from '@/lib/utils';

/**
 * Loading placeholder that mirrors the final layout (brief §8). Its colour is mixed from the
 * surface it sits on (`--surface`, the card by default), with a slow shimmer that becomes a
 * still tint under reduced motion. Decorative: the widget around it announces "Loading".
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn('skeleton rounded-xs', className)}
      {...props}
    />
  );
}

/** A line of text-shaped skeleton. `width` as a fraction keeps paragraphs looking natural. */
export function SkeletonText({
  lines = 1,
  className,
  lineClassName,
  lastLineWidth = 0.6,
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
  lastLineWidth?: number;
}) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5', lineClassName)}
          style={{ width: i === lines - 1 && lines > 1 ? `${lastLineWidth * 100}%` : '100%' }}
        />
      ))}
    </div>
  );
}
