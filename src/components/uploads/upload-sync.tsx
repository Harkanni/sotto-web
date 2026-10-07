'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { onFileStatus, useFileEvents } from '@/lib/api/events';
import { fileFromLists, refreshFiles } from '@/lib/api/files';
import { useActiveWorkspace } from '@/lib/api/hooks';
import { pushPath } from '@/lib/nav/routes';
import { navigate } from '@/lib/nav/store';
import { failureText } from '@/lib/files/status';
import { getUploads, onUploadDone } from '@/lib/uploads/store';
import { UPLOAD_TOAST } from '@/components/shell/add-sheet';

/**
 * A result takes over the "Uploading…" toast when nothing else is still uploading (the usual
 * single file), so one toast tells the whole story; otherwise it gets its own.
 */
function resultToastId(): string | undefined {
  const moving = getUploads().some((u) => !['done', 'failed', 'canceled'].includes(u.state));
  return moving ? undefined : UPLOAD_TOAST;
}

/** Files uploaded from this tab, so only their own outcome is announced, never someone else's. */
const mine = new Map<string, { title: string; kind: 'document' | 'audio' }>();

/**
 * Keeps the app in step with the pipeline (mounted once, with the shell's overlays):
 * live events patch every list; a finished upload refreshes them; and when a file you uploaded
 * here is Ready or Failed, a toast says so with the next step (Open, or why it failed).
 */
export function UploadSync() {
  useFileEvents();
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id;

  useEffect(
    () =>
      onUploadDone((item) => {
        if (item.fileId) mine.set(item.fileId, { title: item.title, kind: item.kind });
        if (ws) void refreshFiles(client, ws);
      }),
    [client, ws],
  );

  useEffect(
    () =>
      onFileStatus(({ fileId, status }) => {
        const file = mine.get(fileId);
        if (!file || (status !== 'ready' && status !== 'failed')) return;
        mine.delete(fileId);
        if (status === 'ready') {
          const kind = file.kind === 'audio' ? 'meeting' : 'doc';
          toast(`“${file.title}” is ready`, {
            id: resultToastId(),
            description:
              file.kind === 'audio'
                ? 'The transcript and notes are in.'
                : 'You can read it and ask about it.',
            action: {
              label: 'Open',
              onClick: () =>
                navigate(pushPath(file.kind === 'audio' ? '/meetings' : '/docs', kind, fileId)),
            },
          });
        } else {
          const error = ws ? fileFromLists(client, ws, fileId)?.error : null;
          toast(`Couldn’t process “${file.title}”`, {
            id: resultToastId(),
            description: failureText(error ?? null),
          });
        }
      }),
    [client, ws],
  );

  return null;
}
