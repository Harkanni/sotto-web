'use client';

import { Check, Lock, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Badge, SensitivityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useRenameConversation } from '@/lib/api/ask';
import { useUpdateFile, type Sensitivity } from '@/lib/api/files';
import { useActiveWorkspace, useWorkspaceCollections } from '@/lib/api/hooks';
import { accessAtLeast, atLeast } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { onScreenEvent } from '@/screens/parts/screen-events';

const ROW =
  'flex w-full items-center gap-3 pl-4 text-left transition-colors duration-300 active:bg-row-pressed disabled:opacity-40';

/**
 * "Move to…": the collections you can add files to, plus Unfiled. The check marks where it is
 * now; a restricted collection says so, because moving there changes who can open the file.
 */
export function MoveSheet() {
  const collections = useWorkspaceCollections().data ?? [];
  const update = useUpdateFile();
  const [target, setTarget] = useState<{
    id: string;
    title: string;
    collectionId: string | null;
  } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onScreenEvent('move', (detail) => {
        setTarget(detail);
        setOpen(true);
      }),
    [],
  );
  const choices = [
    { id: null, name: 'Unfiled', restricted: false, hint: 'Everyone in the workspace can open it' },
    ...collections
      .filter((c) => accessAtLeast(c.access, 'edit'))
      .map((c) => ({
        id: c.id as string | null,
        name: c.name,
        restricted: c.restricted,
        hint: c.restricted ? 'Only the people it names can open it' : 'Everyone in the workspace',
      })),
  ];

  const move = (to: (typeof choices)[number]) => {
    if (!target || to.id === target.collectionId) {
      setOpen(false);
      return;
    }
    setOpen(false);
    update.mutate(
      { id: target.id, collectionId: to.id },
      {
        onSuccess: () =>
          toast(to.id ? `Moved to ${to.name}` : 'Moved out of its collection', {
            description: target.title,
          }),
        onError: (e) => toast(messageOf(e)),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Move to" description={target?.title}>
      <ul className="surface-elevated mx-[var(--gutter)] mb-2 overflow-hidden rounded-card bg-card-nested">
        {choices.map((c) => {
          const current = c.id === (target?.collectionId ?? null);
          return (
            <li key={c.id ?? 'unfiled'} className="list-row">
              <button type="button" aria-pressed={current} onClick={() => move(c)} className={ROW}>
                <span className="row-main flex min-h-11 flex-1 items-center justify-between gap-3 py-2.5 pr-4">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body">{c.name}</span>
                    <span className="text-subhead text-muted-foreground">{c.hint}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {c.restricted && (
                      <Badge tone="danger">
                        <Lock aria-hidden strokeWidth={2.25} />
                        Restricted
                      </Badge>
                    )}
                    <Check
                      aria-hidden
                      className={cn('size-5 text-primary-text', !current && 'opacity-0')}
                      strokeWidth={2.5}
                    />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/** Rename a file, or a sample chat (chats are real from Phase 5). */
export function RenameSheet() {
  const update = useUpdateFile();
  const renameChat = useRenameConversation();
  const [target, setTarget] = useState<{
    kind: 'doc' | 'meeting' | 'thread';
    id: string;
    title: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      onScreenEvent('rename', (detail) => {
        setTarget(detail);
        setValue(detail.title);
        setOpen(true);
      }),
    [],
  );

  const save = () => {
    const title = value.trim();
    if (!target || !title) return;
    setOpen(false);
    if (target.kind === 'thread') {
      renameChat.mutate(
        { id: target.id, title },
        {
          onSuccess: () => toast('Renamed', { description: title }),
          onError: (e) => toast(messageOf(e)),
        },
      );
      return;
    }
    update.mutate(
      { id: target.id, title },
      {
        onSuccess: () => toast('Renamed', { description: title }),
        onError: (e) => toast(messageOf(e)),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Rename"
      footer={
        <Button
          className="w-full"
          disabled={!value.trim() || value.trim() === target?.title}
          onClick={save}
        >
          Save
        </Button>
      }
    >
      <form
        className="px-[var(--gutter)] pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="sr-only" htmlFor="rename-input">
          Name
        </label>
        <input
          id="rename-input"
          ref={inputRef}
          value={value}
          maxLength={120}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          enterKeyHint="done"
          className="h-11 w-full rounded-input bg-fill px-3 text-[17px] outline-none focus-visible:outline-2 focus-visible:outline-ring"
          onFocus={(e) => e.currentTarget.select()}
        />
      </form>
    </Sheet>
  );
}

const LABELS: { value: Sensitivity; title: string; hint: string }[] = [
  {
    value: 'internal',
    title: 'Internal',
    hint: 'The default. Any AI mode your workspace allows can read it.',
  },
  {
    value: 'confidential',
    title: 'Confidential',
    hint: 'Outside AI models read it only if your admins allow that.',
  },
  {
    value: 'restricted',
    title: 'Restricted',
    hint: 'Only ever read by private AI. Never sent to an outside model.',
  },
];

/**
 * A file's sensitivity label (BRIEF §3). Anyone who edits the file may raise it; lowering it
 * from Restricted is for admins and owners, so that option says why it's unavailable.
 */
export function LabelSheet() {
  const update = useUpdateFile();
  const admin = atLeast(useActiveWorkspace()?.role, 'admin');
  const [target, setTarget] = useState<{
    id: string;
    title: string;
    sensitivity: Sensitivity;
  } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onScreenEvent('label', (detail) => {
        setTarget(detail);
        setOpen(true);
      }),
    [],
  );
  const locked = target?.sensitivity === 'restricted' && !admin;

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Label" description={target?.title}>
      <ul className="surface-elevated mx-[var(--gutter)] overflow-hidden rounded-card bg-card-nested">
        {LABELS.map((l) => {
          const current = l.value === target?.sensitivity;
          const disabled = locked && !current;
          return (
            <li key={l.value} className="list-row">
              <button
                type="button"
                aria-pressed={current}
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  if (!target || current) return;
                  update.mutate(
                    { id: target.id, sensitivity: l.value },
                    {
                      onSuccess: () => toast(`Labelled ${l.title}`, { description: target.title }),
                      onError: (e) => toast(messageOf(e)),
                    },
                  );
                }}
                className={ROW}
              >
                <span className="row-main flex min-h-[60px] flex-1 items-center justify-between gap-3 py-2.5 pr-4">
                  <span className="flex flex-col gap-1">
                    <SensitivityBadge level={l.value} className="self-start" />
                    <span className="text-subhead text-muted-foreground">{l.hint}</span>
                  </span>
                  <Check
                    aria-hidden
                    className={cn('size-5 shrink-0 text-primary-text', !current && 'opacity-0')}
                    strokeWidth={2.5}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* A fixed slot, so the sheet never changes height (UI_DESIGN_SYSTEM §8). */}
      <p className="min-h-10 px-[calc(var(--gutter)+16px)] pt-2 pb-1 text-footnote text-muted-foreground">
        {locked ? 'Only admins and owners can lower a file from Restricted.' : ''}
      </p>
    </Sheet>
  );
}

/** Tags: short words to group and find files. Lowercase, up to 20, each under 32 characters. */
export function TagsSheet() {
  const update = useUpdateFile();
  const [target, setTarget] = useState<{ id: string; title: string; tags: string[] } | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onScreenEvent('tags', (detail) => {
        setTarget(detail);
        setTags(detail.tags);
        setDraft('');
        setOpen(true);
      }),
    [],
  );

  const add = () => {
    const tag = draft.trim().toLowerCase().slice(0, 32);
    if (tag && !tags.includes(tag) && tags.length < 20) setTags([...tags, tag]);
    setDraft('');
  };
  const changed = JSON.stringify(tags) !== JSON.stringify(target?.tags ?? []);
  const save = () => {
    if (!target) return;
    setOpen(false);
    update.mutate(
      { id: target.id, tags },
      {
        onSuccess: () => toast('Tags saved', { description: target.title }),
        onError: (e) => toast(messageOf(e)),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Tags"
      description={target?.title}
      footer={
        <Button className="w-full" disabled={!changed} onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-3 px-[var(--gutter)] pb-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="sr-only" htmlFor="tag-input">
            New tag
          </label>
          <input
            id="tag-input"
            value={draft}
            maxLength={32}
            placeholder="Add a tag"
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            enterKeyHint="done"
            className="h-11 min-w-0 flex-1 rounded-input bg-fill px-3 text-[17px] outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          />
          <Button
            variant="secondary"
            size="icon"
            aria-label="Add tag"
            icon={<Plus aria-hidden />}
            disabled={!draft.trim()}
          />
        </form>
        {/* A fixed-height area: chips wrap inside it, the sheet keeps its size. */}
        <ul aria-label="Tags" className="flex min-h-[96px] flex-wrap content-start gap-2">
          {tags.length === 0 && (
            <li className="text-callout text-muted-foreground">No tags yet.</li>
          )}
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                className="pressable relative flex h-8 items-center gap-1 rounded-full bg-fill pr-2 pl-3 text-subhead before:absolute before:-inset-y-1.5 before:inset-x-0 active:bg-fill-strong"
              >
                {tag}
                <X aria-hidden className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
