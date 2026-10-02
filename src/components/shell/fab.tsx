'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { emitShellEvent } from './shell-events';

/**
 * The floating + button (brief §9): 56 px, bottom-right (left for left-handed use), 16 px above
 * the tab bar, opening "Add to Sotto". Hidden on Ask, where the composer is the primary action.
 */
export function Fab({ hidden }: { hidden: boolean }) {
  return (
    <button
      type="button"
      aria-label="Add to Sotto"
      aria-haspopup="dialog"
      data-fab
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      onClick={() => emitShellEvent('open-add')}
      className={cn(
        // Wide windows have the sidebar's New button and drag-and-drop instead.
        'fab grid size-14 place-items-center lg:hidden rounded-full bg-primary text-primary-foreground shadow-fab select-none',
        'transition-[transform,opacity,background-color] duration-[var(--duration-standard)] ease-standard',
        'hover:bg-[color-mix(in_oklab,var(--primary),black_8%)]',
        'active:scale-[0.92] active:bg-[color-mix(in_oklab,var(--primary),black_12%)] active:duration-75 active:ease-out',
        hidden && 'pointer-events-none scale-50 opacity-0 duration-200 ease-out',
      )}
    >
      <Plus className="size-7" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
