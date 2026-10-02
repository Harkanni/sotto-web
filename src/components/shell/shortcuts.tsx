'use client';

import { Fragment, useEffect, useEffectEvent, useState } from 'react';
import { Kbd, ModKey } from '@/components/ui/kbd';
import { Sheet } from '@/components/ui/sheet';
import type { Tab } from '@/lib/nav/routes';
import { emitShellEvent, onShellEvent } from './shell-events';
import { selectTab } from './tab-bar';

/** Keys as the cheat sheet draws them; MOD is ⌘ on Apple devices and Ctrl elsewhere. */
type Key = string | typeof MOD;
const MOD = Symbol('mod');

type Shortcut = { keys: Key[]; label: string; sequence?: boolean };

/**
 * Every shortcut, in the "?" cheat sheet's order (brief §9). Single keys and G sequences only
 * work outside text fields; none of them clash with the browser's own.
 */
export const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Anywhere',
    items: [
      { keys: [MOD, 'K'], label: 'Search and commands' },
      { keys: ['/'], label: 'Search' },
      { keys: ['N'], label: 'Add to Sotto' },
      { keys: ['?'], label: 'Keyboard shortcuts' },
    ],
  },
  {
    title: 'Go to',
    items: [
      { keys: ['G', 'H'], label: 'Home', sequence: true },
      { keys: ['G', 'D'], label: 'Docs', sequence: true },
      { keys: ['G', 'A'], label: 'Ask', sequence: true },
      { keys: ['G', 'M'], label: 'Meetings', sequence: true },
      { keys: ['G', 'P'], label: 'Profile', sequence: true },
    ],
  },
  {
    title: 'Lists',
    items: [
      { keys: ['J'], label: 'Next item' },
      { keys: ['K'], label: 'Previous item' },
      { keys: ['↵'], label: 'Open the item' },
    ],
  },
  {
    title: 'Documents and meetings',
    items: [{ keys: ['A'], label: 'Ask about this' }],
  },
];

const GO_KEYS: Record<string, Tab> = {
  h: 'home',
  d: 'docs',
  a: 'ask',
  m: 'meetings',
  p: 'profile',
};

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** A sheet, dialog, menu or the palette is open: single keys belong to it. */
function overlayOpen() {
  return document.querySelector('[role="dialog"]:not([data-closing]), [role="menu"]') !== null;
}

/** The screen the keyboard works on: the list pane on wide windows, else the top screen. */
function currentScope(): HTMLElement | null {
  const root = document.querySelector<HTMLElement>('.tab-root[data-active]');
  if (!root) return null;
  const wide = window.matchMedia('(min-width: 1024px)').matches;
  return (
    (wide ? root.querySelector<HTMLElement>('.stack-layer[data-pane="list"]') : null) ??
    root.querySelector<HTMLElement>('.stack-layer:last-of-type')
  );
}

/** J and K: move through the rows of the current list, keeping the focused one in view. */
function moveFocus(delta: 1 | -1) {
  const scope = currentScope();
  if (!scope) return;
  const rows = [...scope.querySelectorAll<HTMLElement>('[data-row]')].filter(
    (row) => row.getClientRects().length > 0,
  );
  if (!rows.length) return;
  const i = rows.indexOf(document.activeElement as HTMLElement);
  const next =
    i === -1
      ? rows[delta > 0 ? 0 : rows.length - 1]
      : rows[Math.min(rows.length - 1, Math.max(0, i + delta))];
  if (!next) return;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest' });
}

/**
 * The app's keyboard shortcuts (brief §9), installed once by the shell. ⌘K works everywhere,
 * even while typing; everything else steps aside for text fields and open overlays.
 */
export function useKeyboardShortcuts(active: Tab) {
  const go = useEffectEvent((tab: Tab) => selectTab(tab, active));

  useEffect(() => {
    let awaitingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        emitShellEvent('toggle-palette');
        return;
      }
      if (mod || e.altKey || isTyping(e.target) || overlayOpen()) return;

      const key = e.key;
      if (awaitingG && performance.now() - awaitingG < 1200) {
        awaitingG = 0;
        const tab = GO_KEYS[key.toLowerCase()];
        if (tab) {
          e.preventDefault();
          go(tab);
        }
        return;
      }
      awaitingG = 0;

      if (key === 'j' || key === 'k') {
        e.preventDefault();
        moveFocus(key === 'j' ? 1 : -1);
        return;
      }
      if (e.repeat) return;
      switch (key) {
        case 'g':
          awaitingG = performance.now();
          break;
        case '/':
          e.preventDefault();
          emitShellEvent('open-palette');
          break;
        case '?':
          e.preventDefault();
          emitShellEvent('open-shortcuts');
          break;
        case 'n':
          e.preventDefault();
          emitShellEvent('open-add');
          break;
        case 'a': {
          const button = document.querySelector<HTMLElement>(
            '.tab-root[data-active] .stack-layer:last-of-type [data-ask-toggle]',
          );
          if (button) {
            e.preventDefault();
            button.click();
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function KeyCap({ k }: { k: Key }) {
  return <Kbd className="min-w-[26px] text-[14px]">{k === MOD ? <ModKey /> : k}</Kbd>;
}

/** The "?" cheat sheet: every shortcut, grouped. */
export function ShortcutsSheet() {
  const [open, setOpen] = useState(false);
  useEffect(() => onShellEvent('open-shortcuts', () => setOpen(true)), []);

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Keyboard shortcuts"
      detents={['large']}
      // Two balanced columns on wide windows, so the whole sheet fits without scrolling.
      className="md:max-w-[720px]"
    >
      <div className="gap-6 px-[var(--gutter)] pt-1 pb-3 md:columns-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section
            key={group.title}
            aria-label={group.title}
            className="mb-5 break-inside-avoid md:mb-6"
          >
            <h3 className="pb-1.5 text-footnote font-semibold text-muted-foreground">
              {group.title}
            </h3>
            <dl className="overflow-hidden rounded-card bg-card-nested">
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className="flex min-h-11 items-center gap-3 px-4 py-1.5 [&:not(:last-child)]:shadow-[inset_0_-0.5px_0_var(--separator)]"
                >
                  <dt className="min-w-0 flex-1 text-body">{item.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1.5 text-footnote text-muted-foreground">
                    {item.keys.map((k, i) => (
                      <Fragment key={i}>
                        {i > 0 && item.sequence && <span>then</span>}
                        <KeyCap k={k} />
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="break-inside-avoid text-footnote text-muted-foreground">
          Single-key shortcuts pause while you type, and while a sheet or menu is open.
        </p>
      </div>
    </Sheet>
  );
}
