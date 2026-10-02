import { cn } from '@/lib/utils';

/** A key, as drawn in menus, the palette and the shortcuts sheet. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] bg-fill px-1.5',
        'font-sans text-[13px] leading-none font-medium text-muted-foreground',
        'shadow-[inset_0_-1px_0_var(--separator)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * The command key: ⌘ on Apple devices, Ctrl elsewhere. The boot script marks the platform before
 * the first paint and CSS picks the label, so server and client markup agree.
 */
export function ModKey() {
  return (
    <>
      <span className="mod-apple">⌘</span>
      <span className="mod-other">Ctrl</span>
    </>
  );
}
