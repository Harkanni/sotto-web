'use client';

import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toastPreview } from '@/components/ui/toaster';
import { prefersReducedMotion } from '@/lib/motion/driver';
import { springEasing, springs } from '@/lib/motion/spring';

const READABLE = /\.(pdf|docx?|txt|md|markdown|rtf|mp3|m4a|wav|webm|ogg|aac|flac)$/i;

function readable(file: File) {
  return file.type.startsWith('audio/') || READABLE.test(file.name);
}

function extension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : name;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Says what a drop would have done, in the same words as the + sheet's pickers. */
function report(files: File[]) {
  const ok = files.filter(readable);
  const skipped = files.filter((f) => !readable(f));
  const skippedNote = skipped.length
    ? ` Skipped ${plural(skipped.length, 'file')} (${[...new Set(skipped.map((f) => extension(f.name)))].join(', ')}): Sotto reads PDF, Word, text, Markdown and audio.`
    : '';
  if (ok.length)
    toastPreview(
      `${plural(ok.length, 'file')} ready`,
      `Uploading arrives in Phase 4. Nothing has left your device.${skippedNote}`,
    );
  else toastPreview('Nothing Sotto can read', skippedNote.trim());
}

/**
 * Drag-and-drop upload anywhere (brief §9): dragging files over the window raises a drop target
 * over the whole app; letting go adds them.
 *
 * PREVIEW (Phase 2): dropped files are counted and checked, never read or sent; uploading
 * arrives in Phase 4.
 */
export function DropOverlay() {
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let depth = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const carriesFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const hide = () => {
      depth = 0;
      clearTimeout(idle);
      setVisible(false);
    };
    // Browsers don't always say when a drag leaves the window (Escape, or a drop elsewhere);
    // dragover repeats every few frames while it's here, so silence means it's gone.
    const keepAlive = () => {
      clearTimeout(idle);
      idle = setTimeout(hide, 400);
    };
    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setVisible(true);
      keepAlive();
    };
    const onOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      keepAlive();
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) hide();
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      hide();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) report(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      clearTimeout(idle);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // The target rises to meet the files.
  useEffect(() => {
    if (!visible || prefersReducedMotion()) return;
    const lift = springEasing(springs.standard);
    cardRef.current?.animate([{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }], {
      duration: lift.duration,
      easing: lift.easing,
    });
  }, [visible]);

  return (
    <div
      aria-hidden={!visible}
      data-visible={visible || undefined}
      className="drop-overlay fixed inset-0 z-[var(--z-palette)] p-3 lg:p-4"
    >
      <div
        ref={cardRef}
        className="flex h-full flex-col items-center justify-center gap-4 rounded-[24px] border-2 border-dashed border-primary/45 bg-primary-tint dark:border-primary/70 text-center"
      >
        <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-fab">
          <Upload aria-hidden className="size-7" strokeWidth={2.25} />
        </span>
        <div>
          <p className="text-title-2">Drop to add to Sotto</p>
          <p className="mt-1 text-callout text-muted-foreground">
            PDF, Word, text, Markdown and audio. Sample workspace: files stay on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
