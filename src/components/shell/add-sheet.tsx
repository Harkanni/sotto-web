'use client';

import { FileAudio, Mic, PenLine, Upload, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/sheet';
import { toastPreview } from '@/components/ui/toaster';
import { TransferList } from '@/components/uploads/transfers';
import { useWorkspaceCollections } from '@/lib/api/hooks';
import { useCanAdd } from '@/lib/uploads/permissions';
import { addUploads, useUploads, type UploadItem } from '@/lib/uploads/store';
import { currentCollectionId } from '@/lib/uploads/target';
import { cn } from '@/lib/utils';
import { emitShellEvent, onShellEvent } from './shell-events';

type ActionId = 'upload' | 'record' | 'audio' | 'note';

type Action = {
  id: ActionId;
  icon: LucideIcon;
  title: string;
  hint: string;
  tint: string;
};

const ACTIONS: Action[] = [
  {
    id: 'upload',
    icon: Upload,
    title: 'Upload files',
    hint: 'PDFs, memos, notes',
    tint: 'text-[#5856d6] bg-[#5856d6]/12 dark:text-[#9a98ff] dark:bg-[#5e5ce6]/24',
  },
  {
    id: 'record',
    icon: Mic,
    title: 'Record a meeting',
    hint: 'Sotto takes the notes',
    tint: 'text-[#d70015] bg-[#ff3b30]/12 dark:text-[#ff6961] dark:bg-[#ff453a]/22',
  },
  {
    id: 'audio',
    icon: FileAudio,
    title: 'Import audio',
    hint: 'Voice memos, recorders',
    tint: 'text-[#b33000] bg-[#ff9500]/14 dark:text-[#ff9f0a] dark:bg-[#ff9f0a]/22',
  },
  {
    id: 'note',
    icon: PenLine,
    title: 'New note',
    hint: 'Write it, ask about it later',
    tint: 'text-[#1f7f93] bg-[#30b0c7]/14 dark:text-[#64d2ff] dark:bg-[#64d2ff]/20',
  },
];

/** What Sotto reads (the api checks again): PDF, Word, text, Markdown; audio separately. */
export const DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.md,.markdown';
export const AUDIO_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.webm,.ogg,.opus,.flac,.aac';

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Starts uploading files the person picked or dropped, into the collection on screen. */
export function startUploads(files: File[], kind: 'file' | 'recording' = 'file') {
  if (!files.length) return;
  addUploads(files, { collectionId: currentCollectionId() });
  toast(
    files.length === 1
      ? `Uploading “${files[0]!.name}”`
      : `Uploading ${plural(files.length, kind)}`,
    {
      description: 'You can keep working. Sotto reads them as soon as they arrive.',
      action: { label: 'Show', onClick: () => emitShellEvent('open-add') },
    },
  );
}

export const VIEWER_CANT_ADD = 'Viewers can’t add files. Ask an admin to make you a member.';

/** Where new files go, said once under the tiles. */
function Destination() {
  const id = currentCollectionId();
  const collection = useWorkspaceCollections().data?.find((c) => c.id === id);
  return (
    <p className="px-[var(--gutter)] pt-2 pb-1 text-footnote text-muted-foreground">
      {collection
        ? `New files go into ${collection.name}.`
        : 'New files stay unfiled until you move them into a collection.'}
    </p>
  );
}

/**
 * "Add to Sotto" (brief §9), opened by the + button, the sidebar's New button or the N key.
 * Uploads go straight to storage with progress, pause and resume (src/lib/uploads); the ones in
 * flight are listed at the top. New notes arrive with Ask in Phase 5.
 */
export function AddSheet() {
  const [open, setOpen] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const live = useUploads();
  const canAdd = useCanAdd();
  // The rows present when the sheet opened stay until it closes (a finished upload shows as
  // Uploaded instead of leaving), so the sheet never changes height under your thumb.
  const [rows, setRows] = useState<UploadItem[]>([]);
  const uploads = rows.map((row) => {
    const current = live.find((u) => u.id === row.id);
    return current ?? { ...row, state: 'done' as const, sent: row.size };
  });

  useEffect(
    () =>
      onShellEvent('open-add', () => {
        if (!canAdd) {
          toast(VIEWER_CANT_ADD);
          return;
        }
        setRows(live);
        setOpen(true);
      }),
    [live, canAdd],
  );
  // Runs inside the user's click or keypress, which the browser requires to open a file picker.
  useEffect(
    () =>
      onShellEvent('pick-files', (kind) => {
        if (!canAdd) toast(VIEWER_CANT_ADD);
        else (kind === 'audio' ? audioRef : filesRef).current?.click();
      }),
    [canAdd],
  );

  function run(id: ActionId) {
    if (id === 'upload') filesRef.current?.click();
    else if (id === 'audio') audioRef.current?.click();
    else if (id === 'record') emitShellEvent('open-recorder');
    else
      toastPreview(
        'Notes arrive in Phase 5',
        'Writing notes comes with Ask. Nothing is saved yet.',
      );
  }

  const picked = (input: HTMLInputElement, kind: 'file' | 'recording') => {
    const files = [...(input.files ?? [])];
    input.value = '';
    startUploads(files, kind);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen} title="Add to Sotto">
        {uploads.length > 0 && (
          <section aria-label="Uploading" className="px-[var(--gutter)] pt-1 pb-4">
            <h3 className="px-4 pb-1.5 text-footnote text-muted-foreground">Uploading</h3>
            <TransferList items={uploads} className="surface-elevated bg-card-nested" />
          </section>
        )}
        <div className="grid grid-cols-2 gap-3 px-[var(--gutter)] pt-1 pb-2">
          {ACTIONS.map(({ id, icon: Icon, title, hint, tint }) => (
            <button
              key={id}
              type="button"
              data-action={id}
              onClick={() => {
                run(id);
                setOpen(false);
              }}
              className="pressable flex min-h-[112px] flex-col items-start justify-between gap-3 rounded-card bg-card-nested p-3.5 text-left select-none active:bg-fill-strong"
            >
              <span className={cn('grid size-10 place-items-center rounded-full', tint)}>
                <Icon aria-hidden className="size-[22px]" strokeWidth={2} />
              </span>
              <span>
                <span className="block text-headline">{title}</span>
                <span className="block text-subhead text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        {open && <Destination />}
      </Sheet>
      <input
        ref={filesRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => picked(e.currentTarget, 'file')}
      />
      <input
        ref={audioRef}
        type="file"
        multiple
        accept={AUDIO_ACCEPT}
        className="hidden"
        onChange={(e) => picked(e.currentTarget, 'recording')}
      />
    </>
  );
}
