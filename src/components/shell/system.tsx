'use client';

import { Cloud, CloudOff } from 'lucide-react';
import { useTheme } from 'next-themes';
import { memo, useEffect, useState, useSyncExternalStore } from 'react';

/** Keeps the browser chrome colour in step with an explicit light or dark choice. */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === 'dark' ? '#000000' : '#f2f2f7';
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = color;
    }
  }, [resolvedTheme]);
  return null;
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement)
    return !['button', 'checkbox', 'radio', 'range', 'file', 'submit'].includes(el.type);
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * iOS keeps the layout the same size when the keyboard opens and pans the visible area instead.
 * This pins the shell to the visible area (so the composer sits right above the keyboard and
 * the nav bar stays put) and exposes --keyboard-inset for sheets. Android resizes the layout
 * itself (interactive-widget=resizes-content), so this measures zero there.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    let last = '';
    const write = (open: boolean, inset: number, top: number, height: number) => {
      // Custom properties on <html> restyle the whole page: write only real changes.
      const key = `${open}|${inset}|${top}|${height}`;
      if (key === last) return;
      last = key;
      root.toggleAttribute('data-keyboard-open', open);
      root.style.setProperty('--keyboard-inset', `${inset}px`);
      root.style.setProperty('--vv-top', `${top}px`);
      root.style.setProperty('--vv-height', open ? `${height}px` : '100%');
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Nothing to do unless someone is typing (reading the viewport costs a layout).
        if (!isTextInput(document.activeElement)) {
          write(false, 0, 0, 0);
          return;
        }
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        const open = vv.scale <= 1.01 && inset > 80;
        write(open, open ? inset : 0, open ? Math.round(vv.offsetTop) : 0, Math.round(vv.height));
      });
    };
    const onFocusChange = (e: FocusEvent) => {
      if (isTextInput(e.target as Element) || isTextInput(e.relatedTarget as Element | null))
        sync();
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
    };
  }, []);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** True while the browser reports no connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

type Connection = 'offline' | 'back' | null;

/**
 * The offline banner (brief §9). On phones it rises from behind the tab bar as a slim strip,
 * nudging the + button up, so it never covers a button; on wider windows it's a pill at the
 * bottom of the content. When the connection returns it says so, briefly, then slides away.
 */
export const OfflineBanner = memo(function OfflineBanner() {
  const online = useOnline();
  const [state, setState] = useState<Connection>(null);

  useEffect(() => {
    // Ignore blips shorter than a second; "Back online" only follows a real outage.
    const t = setTimeout(
      () => setState((prev) => (online ? (prev === 'offline' ? 'back' : null) : 'offline')),
      online ? 0 : 1000,
    );
    return () => clearTimeout(t);
  }, [online]);

  useEffect(() => {
    if (state !== 'back') return;
    const t = setTimeout(() => setState(null), 1800);
    return () => clearTimeout(t);
  }, [state]);

  // Lets the + button, toasts and the composer make room for the strip.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-offline', state !== null);
  }, [state]);

  // Keeps the last message while the strip slides away.
  const [shownText, setShownText] = useState('');
  const text =
    state === 'offline'
      ? 'Offline. Showing what’s saved on this device.'
      : state === 'back'
        ? 'Back online.'
        : null;
  if (text && text !== shownText) setShownText(text);

  return (
    <>
      <div aria-hidden className="offline-strip" data-shown={state ?? undefined}>
        {state === 'back' ? (
          <Cloud aria-hidden className="size-4 text-primary-text" strokeWidth={2} />
        ) : (
          <CloudOff aria-hidden className="size-4 text-muted-foreground" strokeWidth={2} />
        )}
        <span className="truncate">{shownText}</span>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {text}
      </div>
    </>
  );
});
