import { cn } from '@/lib/utils';

/**
 * Sotto's mark (src/app/icon.svg): an indigo tile with a four-bar waveform that tapers like a
 * voice fading out. The tile follows the theme's primary; the bars stay white. Decorative by
 * default: the page around it names the product.
 */
export function SottoMark({
  size = 56,
  className,
  title,
}: {
  size?: number;
  className?: string;
  /** Give it a name when it stands alone (otherwise it's hidden from screen readers). */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      <rect width="28" height="28" rx="8" fill="var(--primary)" />
      <g fill="#ffffff">
        <rect x="6" y="9" width="2.5" height="10" rx="1.25" />
        <rect x="10.5" y="6.5" width="2.5" height="15" rx="1.25" />
        <rect x="15" y="10" width="2.5" height="8" rx="1.25" />
        <rect x="19.5" y="12" width="2.5" height="4" rx="1.25" />
      </g>
    </svg>
  );
}
