'use client';

import { tabOf } from './routes';
import { navigate, type NavIntent } from './store';

export type NavLinkProps = React.ComponentProps<'a'> & {
  href: string;
  replace?: boolean;
  intent?: NavIntent;
};

/**
 * A link inside the app shell. Plain clicks navigate client-side (instant, works offline);
 * modified clicks (new tab, new window, download) and links outside the app behave like any
 * link. Renders a real <a>, so it can be copied, opened in a new tab and read by assistive tech.
 */
export function NavLink({ href, replace, intent, onClick, ...props }: NavLinkProps) {
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === '_blank' ||
          props.download !== undefined
        ) {
          return;
        }
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin || !tabOf(url.pathname)) return;
        event.preventDefault();
        navigate(url.pathname + url.search, { replace, intent });
      }}
      {...props}
    />
  );
}
