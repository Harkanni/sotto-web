'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import { NavLink } from '@/lib/nav/link';
import { tabOf } from '@/lib/nav/routes';
import { cn } from '@/lib/utils';

/**
 * Inset grouped lists (brief §8): rounded cards of rows with hairline separators that start
 * where the text starts, like iOS Settings. Rows are at least 44 px tall.
 */
export function List({
  header,
  footer,
  children,
  className,
  'aria-label': ariaLabel,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <section className={cn('px-[var(--gutter)]', className)} aria-label={ariaLabel}>
      {header && <h2 className="px-4 pb-1.5 text-footnote text-muted-foreground">{header}</h2>}
      <ul role="list" className="overflow-hidden rounded-card bg-card [--surface:var(--card)]">
        {children}
      </ul>
      {footer && <p className="px-4 pt-1.5 text-footnote text-muted-foreground">{footer}</p>}
    </section>
  );
}

const ICON_TINTS = {
  indigo: 'bg-[#5856d6]',
  blue: 'bg-[#007aff]',
  green: 'bg-[#34c759]',
  orange: 'bg-[#ff9500]',
  red: 'bg-[#ff3b30]',
  gray: 'bg-[#8e8e93]',
  teal: 'bg-[#30b0c7]',
  pink: 'bg-[#ff2d55]',
  purple: 'bg-[#af52de]',
} as const;

/** The small rounded-square icon of a settings row. Decorative: the row's title names it. */
export function RowIcon({
  icon: Icon,
  tint = 'indigo',
}: {
  icon: LucideIcon;
  tint?: keyof typeof ICON_TINTS;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[29px] shrink-0 place-items-center rounded-[7px] text-white',
        ICON_TINTS[tint],
      )}
    >
      <Icon className="size-[18px]" strokeWidth={2} />
    </span>
  );
}

export type ListRowProps = {
  title: React.ReactNode;
  /** A second line under the title. */
  subtitle?: React.ReactNode;
  /** A value shown at the trailing end ("System", "3 members"). */
  detail?: React.ReactNode;
  leading?: React.ReactNode;
  /** A control at the trailing end (a switch, a badge, a "…" button). */
  trailing?: React.ReactNode;
  /** Navigate on tap; shows a chevron. */
  href?: string;
  onClick?: (event: React.MouseEvent) => void;
  chevron?: boolean;
  destructive?: boolean;
  /**
   * Reads as an item (normal text) though it responds to taps: rows that open a sheet about
   * themselves (a person, a passkey). Without it, a tappable row that isn't a link is an action
   * and reads in indigo ("Invite people").
   */
  plain?: boolean;
  /** Selected in the list pane next to its open detail (wide windows). */
  selected?: boolean;
  className?: string;
  /** Extra props for the interactive element (data attributes, aria). */
  rowProps?: React.HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined>;
};

/** The row's interactive element, without the list item around it (for ActionRow). */
export function ListRowContent({
  title,
  subtitle,
  detail,
  leading,
  trailing,
  href,
  onClick,
  chevron,
  destructive,
  plain,
  selected,
  className,
  rowProps,
}: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const showChevron = chevron ?? Boolean(href);
  const rowClass = cn(
    'group/row relative flex w-full items-stretch pl-4 text-left select-none',
    'outline-offset-[-2px] focus-visible:rounded-[inherit]',
    interactive && [
      // Pressed: immediate on touch-down after a beat (so a scroll never flashes it), fading
      // out on release.
      'transition-[background-color] duration-300 ease-out',
      'active:bg-row-pressed active:delay-[40ms] active:duration-0',
      'can-hover:hover:bg-fill-subtle',
    ],
    selected && 'bg-fill',
    className,
  );

  const content = (
    <>
      {leading && <span className="flex shrink-0 items-center py-2 pr-3">{leading}</span>}
      <span className="row-main flex min-h-11 min-w-0 flex-1 items-center gap-2 py-[11px] pr-4">
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-body',
              destructive && 'text-destructive-text',
              interactive && !destructive && !href && !plain && 'text-primary-text',
            )}
          >
            {title}
          </span>
          {subtitle && (
            <span className="mt-0.5 block truncate text-subhead text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        {detail != null && (
          <span className="max-w-[45%] shrink-0 truncate text-body text-muted-foreground">
            {detail}
          </span>
        )}
        {trailing}
        {showChevron && (
          <ChevronRight
            aria-hidden
            className="row-chevron -mr-1 size-5 shrink-0 text-faint-foreground transition-opacity duration-150"
            strokeWidth={2.25}
          />
        )}
      </span>
    </>
  );

  if (href) {
    return (
      <NavLink
        href={href}
        className={rowClass}
        data-row=""
        aria-current={selected ? 'page' : undefined}
        onClick={(event) => {
          onClick?.(event);
          // Phones: keep this row highlighted under the pushed screen; it fades on the way back.
          // A link to another tab pushes nothing over this row, so nothing would ever clear it.
          if (
            !event.defaultPrevented &&
            !window.matchMedia('(min-width: 1024px)').matches &&
            tabOf(new URL(href, window.location.href).pathname) === tabOf(window.location.pathname)
          ) {
            event.currentTarget.setAttribute('data-just-opened', '');
          }
        }}
        {...rowProps}
      >
        {content}
      </NavLink>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={rowClass} data-row="" onClick={onClick} {...rowProps}>
        {content}
      </button>
    );
  }
  return (
    <div className={rowClass} {...rowProps}>
      {content}
    </div>
  );
}

export function ListRow(props: ListRowProps) {
  return (
    <li className="list-row relative">
      <ListRowContent {...props} />
    </li>
  );
}
