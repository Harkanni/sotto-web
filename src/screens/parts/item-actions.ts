'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { FolderInput, Pencil, Pin, PinOff, Share, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { RowAction } from '@/components/ui/row-actions';
import { toastWithUndo } from '@/components/ui/toaster';
import * as api from '@/lib/sample/api';
import { keys } from '@/lib/sample/queries';
import { emitScreenEvent } from './screen-events';

type Kind = api.ItemKind;

const PREFIX: Record<Kind, string> = { doc: 'docs', meeting: 'meetings', thread: 'threads' };

/** Optimistically drops an item from every cached list, so it vanishes at once. */
function removeFromLists(client: QueryClient, kind: Kind, id: string) {
  client.setQueriesData<{ id: string }[]>({ queryKey: ['sample', PREFIX[kind]] }, (old) =>
    Array.isArray(old) ? old.filter((x) => x.id !== id) : old,
  );
}

async function share(title: string, path: string) {
  const url = new URL(path, window.location.origin).href;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Link copied', { description: 'Only people in this workspace can open it.' });
  } catch {
    // Share sheet dismissed: nothing to say.
  }
}

/**
 * The secondary actions every document, meeting and chat row offers (brief §9). They work on the
 * SAMPLE workspace in memory; the real API takes over in Phase 4.
 */
export function useItemActions() {
  const client = useQueryClient();

  return function actionsFor(
    kind: Kind,
    item: { id: string; title: string; pinned?: boolean },
    path: string,
  ): RowAction[] {
    const actions: RowAction[] = [];
    if (kind !== 'thread') {
      actions.push({
        id: 'pin',
        label: item.pinned ? 'Unpin' : 'Pin',
        icon: item.pinned ? PinOff : Pin,
        swipe: 'leading',
        tone: 'orange',
        onSelect: () => {
          api.setPinned(kind, item.id, !item.pinned);
          void client.invalidateQueries({ queryKey: keys.all });
          toast(item.pinned ? 'Unpinned' : 'Pinned', { description: item.title });
        },
      });
    }
    actions.push({
      id: 'share',
      label: 'Share',
      icon: Share,
      swipe: 'trailing',
      tone: 'blue',
      onSelect: () => void share(item.title, path),
    });
    if (kind === 'doc') {
      actions.push({
        id: 'move',
        label: 'Move',
        icon: FolderInput,
        swipe: 'trailing',
        tone: 'indigo',
        onSelect: () =>
          emitScreenEvent('move', { id: item.id, title: item.title, collectionId: null }),
      });
    }
    actions.push({
      id: 'rename',
      label: 'Rename',
      icon: Pencil,
      onSelect: () => emitScreenEvent('rename', { kind, id: item.id, title: item.title }),
    });
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      swipe: 'trailing',
      tone: 'red',
      onSelect: () => {
        // No "are you sure?": delete at once, offer Undo (brief §9).
        api.deleteItem(item.id);
        removeFromLists(client, kind, item.id);
        toastWithUndo(`Deleted “${item.title}”`, () => {
          api.restoreItem(item.id);
          void client.invalidateQueries({ queryKey: keys.all });
        });
        void client.invalidateQueries({ queryKey: keys.all, refetchType: 'none' });
      },
    });
    return actions;
  };
}
