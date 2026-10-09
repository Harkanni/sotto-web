'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { onShellEvent } from '@/components/shell/shell-events';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { createNote, updateNote, useNote } from '@/lib/api/ask';
import { fileKeys } from '@/lib/api/files';
import { useActiveWorkspace } from '@/lib/api/hooks';
import { navigate } from '@/lib/nav/store';
import { currentCollectionId } from '@/lib/uploads/target';

/**
 * New note and Edit note (BRIEF §9's + sheet; PLAN's notes API). A note is a file Sotto indexes
 * like a document, so Ask can cite it. A new note goes into the collection on screen, as
 * uploads do. Opened by the `open-note` shell event from the + sheet, ⌘K or a note's screen.
 */
export function NoteSheet() {
  const [open, setOpen] = useState(false);
  const [fileId, setFileId] = useState<string | null>(null);
  const [session, setSession] = useState(0);

  useEffect(
    () =>
      onShellEvent('open-note', ({ fileId }) => {
        setFileId(fileId);
        // A fresh editor each time, so a half-typed note never reappears in another one.
        setSession((s) => s + 1);
        setOpen(true);
      }),
    [],
  );

  return <NoteEditor key={session} fileId={fileId} open={open} onOpenChange={setOpen} />;
}

/** One editing session: its own sheet, so Save sits in the sheet's footer, in thumb reach. */
function NoteEditor({
  fileId,
  open,
  onOpenChange,
}: {
  fileId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const onDone = () => onOpenChange(false);
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  const note = useNote(fileId ?? '-', Boolean(fileId));
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const loading = Boolean(fileId) && !note.data;
  // Until you type, an existing note shows what's saved.
  const shownTitle = title ?? note.data?.file.title ?? '';
  const shownBody = body ?? note.data?.body ?? '';
  const changed = fileId
    ? (title !== null && title.trim() !== note.data?.file.title) ||
      (body !== null && body !== note.data?.body)
    : shownBody.trim().length > 0;

  const save = async () => {
    if (!changed || saving || !shownBody.trim()) return;
    setSaving(true);
    try {
      const saved = fileId
        ? await updateNote(fileId, {
            ...(title !== null && title.trim() ? { title: title.trim() } : {}),
            ...(body !== null ? { body } : {}),
          })
        : await createNote({
            body: shownBody,
            ...(shownTitle.trim() ? { title: shownTitle.trim() } : {}),
            collectionId: currentCollectionId(),
          });
      void client.invalidateQueries({ queryKey: fileKeys.all(ws) });
      client.setQueryData(['api', 'w', ws, 'notes', saved.file.id], saved);
      onDone();
      toast(fileId ? 'Note saved' : 'Note added', {
        description: 'Sotto is reading it; Ask can cite it in a moment.',
        ...(fileId
          ? {}
          : { action: { label: 'Open', onClick: () => navigate(`/docs/${saved.file.id}`) } }),
      });
    } catch (error) {
      toast(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={fileId ? 'Edit note' : 'New note'}
      detents={['large']}
      footer={
        <Button
          className="w-full"
          loading={saving}
          disabled={!changed || loading}
          onClick={() => void save()}
        >
          {fileId ? 'Save note' : 'Add note'}
        </Button>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3 px-[var(--gutter)] pb-4" aria-busy>
          <Skeleton className="h-11 w-full rounded-input" />
          <Skeleton className="h-60 w-full rounded-input" />
        </div>
      ) : (
        <NoteFields
          title={shownTitle}
          body={shownBody}
          autoFocus={!fileId}
          bodyRef={bodyRef}
          onTitle={setTitle}
          onBody={setBody}
          onSave={() => void save()}
        />
      )}
    </Sheet>
  );
}

function NoteFields({
  title: shownTitle,
  body: shownBody,
  autoFocus,
  bodyRef,
  onTitle: setTitle,
  onBody: setBody,
  onSave,
}: {
  title: string;
  body: string;
  autoFocus: boolean;
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
  onTitle: (title: string) => void;
  onBody: (body: string) => void;
  onSave: () => void;
}) {
  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 px-[var(--gutter)] pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <label className="sr-only" htmlFor="note-title">
        Title
      </label>
      <input
        id="note-title"
        value={shownTitle}
        maxLength={200}
        placeholder="Title (optional)"
        autoComplete="off"
        enterKeyHint="next"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            bodyRef.current?.focus();
          }
        }}
        className="h-11 w-full rounded-input bg-fill px-3 text-[17px] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
      />
      <label className="sr-only" htmlFor="note-body">
        Note
      </label>
      <textarea
        id="note-body"
        ref={bodyRef}
        value={shownBody}
        autoFocus={autoFocus}
        placeholder="Write your note. Markdown works: # headings, - lists."
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave();
          }
        }}
        className="min-h-60 w-full flex-1 resize-none rounded-input bg-fill px-3 py-2.5 text-[17px] leading-[24px] outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
      />
    </form>
  );
}
