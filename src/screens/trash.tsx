'use client';

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Screen } from '@/components/shell/screen';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { ListRow, ListRowContent } from '@/components/ui/list';
import { ActionRow } from '@/components/ui/row-actions';
import { Sheet } from '@/components/ui/sheet';
import { AsyncWidget } from '@/components/widgets/async-widget';
import { useDeleteForever, useFiles, useRestoreFile, type FileItem } from '@/lib/api/files';
import { relativeTime } from '@/lib/format';
import { accessAtLeast } from '@/lib/roles';
import { FileIcon } from './parts/file-rows';
import { RowsSkeleton } from './parts/rows';

const DAY = 86_400_000;

/** "deleted 2 h ago", "deleted yesterday", "deleted on 1 Oct". */
function deletedWhen(file: FileItem): string {
  const rel = relativeTime(new Date(file.deletedAt!).getTime());
  return /ago$|^Just now$|^Yesterday$/.test(rel)
    ? `Deleted ${rel.toLowerCase()}`
    : `Deleted on ${rel}`;
}

function daysLeft(file: FileItem): string {
  const days = Math.max(0, Math.ceil((new Date(file.purgeAt!).getTime() - Date.now()) / DAY));
  return days <= 1 ? 'Deleted for good tomorrow' : `${days} days left`;
}

/** Restore is undoable, so it's one tap; deleting for good asks, in the same 44 px. */
function TrashedSheet({
  file,
  open,
  onOpenChange,
}: {
  file: FileItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const restore = useRestoreFile();
  const destroy = useDeleteForever();
  const canEdit = file ? accessAtLeast(file.access, 'edit') : false;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={file?.title ?? 'Deleted file'}
      description={file ? daysLeft(file) : undefined}
    >
      {file && (
        <div className="flex flex-col gap-6 pt-1 pb-2">
          {canEdit ? (
            <>
              <ul className="surface-elevated mx-[var(--gutter)] overflow-hidden rounded-card bg-card-nested [--surface:var(--card-nested)]">
                <ListRow
                  title="Restore"
                  leading={<RotateCcw aria-hidden className="size-5 text-primary-text" />}
                  onClick={() => {
                    onOpenChange(false);
                    restore.mutate(file.id, {
                      onSuccess: () =>
                        toast(`Restored “${file.title}”`, {
                          description: file.collection
                            ? `Back in ${file.collection.name}.`
                            : 'It’s unfiled.',
                        }),
                      onError: (e) => toast(messageOf(e)),
                    });
                  }}
                />
              </ul>
              <ConfirmAction
                surface="sheet"
                label="Delete for good"
                confirmLabel="Delete"
                note="The file, its transcript and everything Sotto learned from it are removed. This can’t be undone."
                loading={destroy.isPending}
                onConfirm={() =>
                  destroy.mutate(file.id, {
                    onSuccess: () => {
                      onOpenChange(false);
                      toast(`Deleted “${file.title}” for good`);
                    },
                    onError: (e) => toast(messageOf(e)),
                  })
                }
              />
            </>
          ) : (
            <p className="px-[calc(var(--gutter)+4px)] text-callout text-muted-foreground">
              Only people who can edit this file can restore it.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/**
 * Recently deleted (BRIEF §4: a 30-day trash). Deleted files wait here, out of search and
 * answers, until they're restored or the 30 days run out.
 */
export function TrashScreen() {
  const query = useFiles({ trash: true, sort: 'recent' });
  const restore = useRestoreFile();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<FileItem | null>(null);

  return (
    <Screen title="Recently deleted">
      <div className="flex flex-col gap-2 pt-1">
        <p className="px-[calc(var(--gutter)+4px)] pb-2 text-callout text-muted-foreground">
          Files stay here for 30 days, then they’re deleted for good.
        </p>
        <div className="px-[var(--gutter)]">
          <AsyncWidget
            query={query}
            label="Deleted files"
            errorTitle="Couldn’t load deleted files"
            empty={{
              illustration: 'docs',
              title: 'Nothing deleted',
              description: 'Files you delete wait here for 30 days, in case you change your mind.',
            }}
            skeleton={<RowsSkeleton rows={3} />}
          >
            {(files) => (
              <ul className="overflow-hidden rounded-card bg-card">
                {files.map((file) => (
                  <ActionRow
                    key={file.id}
                    label={file.title}
                    actions={
                      accessAtLeast(file.access, 'edit')
                        ? [
                            {
                              id: 'restore',
                              label: 'Restore',
                              icon: RotateCcw,
                              swipe: 'leading',
                              tone: 'indigo',
                              onSelect: () =>
                                restore.mutate(file.id, {
                                  onSuccess: () => toast(`Restored “${file.title}”`),
                                  onError: (e) => toast(messageOf(e)),
                                }),
                            },
                          ]
                        : []
                    }
                    preview={
                      <div className="flex items-center gap-3 p-4">
                        <FileIcon file={file} size={44} />
                        <div className="min-w-0">
                          <p className="truncate text-headline">{file.title}</p>
                          <p className="text-subhead text-muted-foreground">{daysLeft(file)}</p>
                        </div>
                      </div>
                    }
                    onOpen={() => {
                      setShown(file);
                      setOpen(true);
                    }}
                  >
                    <ListRowContent
                      plain
                      leading={<FileIcon file={file} />}
                      title={file.title}
                      subtitle={`${deletedWhen(file)}, ${daysLeft(file).toLowerCase()}`}
                      onClick={() => {
                        setShown(file);
                        setOpen(true);
                      }}
                      rowProps={{ 'data-item': file.id }}
                    />
                  </ActionRow>
                ))}
              </ul>
            )}
          </AsyncWidget>
        </div>
      </div>
      <TrashedSheet file={shown} open={open} onOpenChange={setOpen} />
    </Screen>
  );
}
