'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SensitivityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import * as api from '@/lib/sample/api';
import { COLLECTIONS } from '@/lib/sample/data';
import { keys } from '@/lib/sample/queries';
import { onScreenEvent } from '@/screens/parts/screen-events';

/** "Move to…" for documents: pick a collection. Works on the sample workspace in memory. */
export function MoveSheet() {
  const client = useQueryClient();
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onScreenEvent('move', (detail) => {
        setTarget(detail);
        setOpen(true);
      }),
    [],
  );
  const current = target ? api.docCollection(target.id) : undefined;

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Move to" description={target?.title}>
      <ul className="mx-[var(--gutter)] mb-2 overflow-hidden rounded-card bg-card-nested">
        {COLLECTIONS.map((c) => (
          <li key={c.id} className="list-row">
            <button
              type="button"
              aria-pressed={c.id === current}
              onClick={() => {
                if (!target) return;
                api.moveDoc(target.id, c.id);
                void client.invalidateQueries({ queryKey: keys.all });
                setOpen(false);
                toast(`Moved to ${c.name}`, { description: target.title });
              }}
              className="flex w-full items-center gap-3 pl-4 text-left transition-colors duration-300 active:bg-row-pressed"
            >
              <span className="row-main flex min-h-11 flex-1 items-center justify-between gap-3 py-2.5 pr-4">
                <span className="flex flex-col">
                  <span className="text-body">{c.name}</span>
                  <span className="text-subhead text-muted-foreground">{c.description}</span>
                </span>
                <span className="flex items-center gap-2">
                  <SensitivityBadge level={c.sensitivity} />
                  <Check
                    aria-hidden
                    className={c.id === current ? 'size-5 text-primary-text' : 'size-5 opacity-0'}
                    strokeWidth={2.5}
                  />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** Rename a document, meeting or chat (sample workspace, in memory). */
export function RenameSheet() {
  const client = useQueryClient();
  const [target, setTarget] = useState<{ kind: api.ItemKind; id: string; title: string } | null>(
    null,
  );
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
    api.renameItem(target.kind, target.id, title);
    void client.invalidateQueries({ queryKey: keys.all });
    setOpen(false);
    toast('Renamed', { description: title });
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
