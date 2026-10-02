'use client';

import { FileAudio, Mic, PenLine, Upload, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { toastPreview } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { onShellEvent } from './shell-events';

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

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * "Add to Sotto" (brief §9), opened by the + button, the sidebar's New button or the N key.
 *
 * PREVIEW (Phase 2): the file pickers really open, but nothing is uploaded yet; a toast says so.
 * Uploading, recording and notes arrive in Phase 4.
 */
export function AddSheet() {
  const [open, setOpen] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  useEffect(() => onShellEvent('open-add', () => setOpen(true)), []);

  function run(id: ActionId) {
    if (id === 'upload') filesRef.current?.click();
    else if (id === 'audio') audioRef.current?.click();
    else if (id === 'record')
      toastPreview('Recording arrives in Phase 4', 'This sample workspace can’t record yet.');
    else toastPreview('Notes arrive in Phase 4', 'This sample workspace can’t save notes yet.');
  }

  const picked = (input: HTMLInputElement, kind: string) => {
    const count = input.files?.length ?? 0;
    input.value = '';
    if (count)
      toastPreview(
        `${plural(count, kind)} ready`,
        'Uploading arrives in Phase 4. Nothing has left your device.',
      );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen} title="Add to Sotto">
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
        <p className="px-[var(--gutter)] pt-2 pb-1 text-footnote text-muted-foreground">
          Sample workspace: adding content arrives in Phase 4.
        </p>
      </Sheet>
      <input
        ref={filesRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.rtf"
        className="hidden"
        onChange={(e) => picked(e.currentTarget, 'file')}
      />
      <input
        ref={audioRef}
        type="file"
        multiple
        accept="audio/*"
        className="hidden"
        onChange={(e) => picked(e.currentTarget, 'recording')}
      />
    </>
  );
}
