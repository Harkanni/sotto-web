import { cn } from '@/lib/utils';

const SPOKES = 8;

/**
 * Activity indicator: eight spokes in currentColor, turned in eight steps like the system one.
 * One transform animation on the compositor; under reduced motion it pulses instead of turning.
 */
export function Spinner({
  size = 16,
  className,
  label,
}: {
  size?: number;
  className?: string;
  /** Accessible label. Omit when the spinner sits inside something that already says it's busy. */
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'shrink-0 animate-[spin_0.8s_steps(8)_infinite] motion-reduce:animate-[spinner-pulse_1.2s_ease-in-out_infinite]',
        className,
      )}
    >
      {Array.from({ length: SPOKES }, (_, i) => (
        <line
          key={i}
          x1="12"
          y1="2.75"
          x2="12"
          y2="7.25"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          // The leading spoke is solid; the rest fade behind it.
          opacity={1 - (i / SPOKES) * 0.82}
          transform={`rotate(${-i * (360 / SPOKES)} 12 12)`}
        />
      ))}
    </svg>
  );
}
