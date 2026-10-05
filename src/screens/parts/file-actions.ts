'use client';

import {
  Download,
  FolderInput,
  Pencil,
  Pin,
  PinOff,
  RotateCw,
  Share,
  ShieldHalf,
  Tag,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { RowAction } from '@/components/ui/row-actions';
import { messageOf } from '@/components/account/workspace-actions';
import {
  fileLink,
  useRestoreFile,
  useRetryFile,
  useTrashFile,
  useUpdateFile,
  type FileItem,
} from '@/lib/api/files';
import { accessAtLeast } from '@/lib/roles';
import { emitScreenEvent } from './screen-events';

async function share(title: string, path: string) {
  const url = new URL(path, window.location.origin).href;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Link copied', { description: 'Only people in this workspace who can open it will.' });
  } catch {
    // Share sheet dismissed: nothing to say.
  }
}

/** Saves the original through a short-lived link (the api records the download). */
export async function downloadFile(file: Pick<FileItem, 'id' | 'title'>) {
  try {
    const { url } = await fileLink(file.id, false);
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.click();
  } catch (error) {
    toast(messageOf(error));
  }
}

/**
 * Every secondary action on a file (brief §9: swipe left for Share, Move and Delete, right to
 * Pin; long-press or "…" for all of them), offered only when your access allows it. Delete
 * moves to the trash and offers Undo; nothing asks "are you sure".
 */
export function useFileActions() {
  const update = useUpdateFile();
  const trash = useTrashFile();
  const restore = useRestoreFile();
  const retry = useRetryFile();

  return function actionsFor(file: FileItem, path: string): RowAction[] {
    const canEdit = accessAtLeast(file.access, 'edit');
    const actions: RowAction[] = [];
    if (canEdit) {
      actions.push({
        id: 'pin',
        label: file.pinned ? 'Unpin' : 'Pin',
        icon: file.pinned ? PinOff : Pin,
        swipe: 'leading',
        tone: 'orange',
        onSelect: () =>
          update.mutate(
            { id: file.id, pinned: !file.pinned },
            {
              onSuccess: () =>
                toast(file.pinned ? 'Unpinned' : 'Pinned', { description: file.title }),
              onError: (e) => toast(messageOf(e)),
            },
          ),
      });
    }
    actions.push({
      id: 'share',
      label: 'Share',
      icon: Share,
      swipe: 'trailing',
      tone: 'blue',
      onSelect: () => void share(file.title, path),
    });
    if (canEdit) {
      actions.push({
        id: 'move',
        label: 'Move',
        icon: FolderInput,
        swipe: 'trailing',
        tone: 'indigo',
        onSelect: () =>
          emitScreenEvent('move', {
            id: file.id,
            title: file.title,
            collectionId: file.collection?.id ?? null,
          }),
      });
      actions.push({
        id: 'rename',
        label: 'Rename',
        icon: Pencil,
        onSelect: () =>
          emitScreenEvent('rename', {
            kind: file.kind === 'audio' ? 'meeting' : 'doc',
            id: file.id,
            title: file.title,
          }),
      });
      actions.push({
        id: 'label',
        label: 'Label',
        icon: ShieldHalf,
        onSelect: () =>
          emitScreenEvent('label', {
            id: file.id,
            title: file.title,
            sensitivity: file.sensitivity,
          }),
      });
      actions.push({
        id: 'tags',
        label: 'Tags',
        icon: Tag,
        onSelect: () =>
          emitScreenEvent('tags', { id: file.id, title: file.title, tags: file.tags }),
      });
    }
    if (!(file.source === 'sample' && file.kind === 'audio') && file.status !== 'uploading') {
      actions.push({
        id: 'download',
        label: 'Download',
        icon: Download,
        onSelect: () => void downloadFile(file),
      });
    }
    if (canEdit && file.status === 'failed') {
      actions.push({
        id: 'retry',
        label: 'Retry',
        icon: RotateCw,
        onSelect: () =>
          retry.mutate(file.id, {
            onSuccess: () => toast('Retrying', { description: file.title }),
            onError: (e) => toast(messageOf(e)),
          }),
      });
    }
    if (canEdit) {
      actions.push({
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        swipe: 'trailing',
        tone: 'red',
        onSelect: () =>
          trash.mutate(file.id, {
            onSuccess: () =>
              toast(`Deleted “${file.title}”`, {
                description: 'It’s in Recently deleted for 30 days.',
                action: {
                  label: 'Undo',
                  onClick: () => restore.mutate(file.id, { onError: (e) => toast(messageOf(e)) }),
                },
              }),
            onError: (e) => toast(messageOf(e)),
          }),
      });
    }
    return actions;
  };
}
