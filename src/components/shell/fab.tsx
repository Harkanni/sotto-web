'use client';

import { memo } from 'react';
import { Plus } from 'lucide-react';
import { ProgressRing } from '@/components/uploads/transfers';
import { useCanAdd } from '@/lib/uploads/permissions';
import { overallProgress, useUploads } from '@/lib/uploads/store';
import { cn } from '@/lib/utils';
import { emitShellEvent } from './shell-events';

/**
 * The floating + button (brief §9): 56 px, bottom-right (left for left-handed use), 16 px above
 * the tab bar, opening "Add to Sotto". Hidden on Ask, where the composer is the primary action,
 * and for viewers, who can't add files. While uploads move, a ring around it fills.
 */
export const Fab = memo(function Fab({ hidden: onAsk }: { hidden: boolean }) {
  const canAdd = useCanAdd();
  const progress = overallProgress(useUploads());
  const hidden = onAsk || !canAdd;
  return (
    <button
      type="button"
      aria-label={
        progress === null
          ? 'Add to Sotto'
          : `Add to Sotto, uploading ${Math.round(progress * 100)}%`
      }
      aria-haspopup="dialog"
      data-fab
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      onClick={() => emitShellEvent('open-add')}
      className={cn(
        // Wide windows have the sidebar's New button and drag-and-drop instead.
        'fab grid size-14 place-items-center lg:hidden rounded-full bg-primary text-primary-foreground shadow-fab select-none',
        'transition-[transform,translate,scale,opacity,background-color] duration-[var(--duration-standard)] ease-standard',
        'hover:bg-[color-mix(in_oklab,var(--primary),black_8%)]',
        'active:scale-[0.92] active:bg-[color-mix(in_oklab,var(--primary),black_12%)] active:duration-75 active:ease-out',
        hidden && 'pointer-events-none scale-50 opacity-0 duration-200 ease-out',
      )}
    >
      <Plus className="col-start-1 row-start-1 size-7" strokeWidth={2.25} aria-hidden />
      <ProgressRing
        progress={progress}
        size={50}
        stroke={2.5}
        className="col-start-1 row-start-1"
      />
    </button>
  );
});
