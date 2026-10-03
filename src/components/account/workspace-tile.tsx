import { cn } from '@/lib/utils';

const SIZES = {
  28: 'size-7 rounded-sm text-[14px]',
  32: 'size-8 rounded-sm text-[15px]',
  64: 'size-16 rounded-[14px] text-[28px]',
};

/** A workspace's mark: its first letter on indigo (sidebar, switcher, onboarding, settings). */
export function WorkspaceTile({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center bg-primary font-bold text-primary-foreground select-none',
        SIZES[size],
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  );
}
