'use client';

import { createContext, use } from 'react';
import type { StackEntry, Tab } from '@/lib/nav/routes';

export type LayerInfo = {
  tab: Tab;
  entry: StackEntry;
  /** 0 for the tab's root screen. */
  depth: number;
  /** The screen below this one, which the back button returns to. */
  parent: StackEntry | null;
  /** Screens register their scroller so the tab bar can scroll them to the top. */
  registerScroller: (key: string, el: HTMLElement | null) => void;
};

export const LayerContext = createContext<LayerInfo | null>(null);

export function useLayer(): LayerInfo {
  const layer = use(LayerContext);
  if (!layer) throw new Error('useLayer must be used inside a stack layer');
  return layer;
}

/** For components that also render outside the shell (Storybook, tests). */
export function useOptionalLayer(): LayerInfo | null {
  return use(LayerContext);
}
