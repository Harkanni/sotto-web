'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { TextField } from '@/components/ui/text-field';
import { useCreateCollection, useRenameCollection, type Collection } from '@/lib/api/hooks';

export const RESTRICTED_HINT = {
  open: 'Everyone in the workspace can open it. Members edit, viewers view.',
  restricted: 'Only admins, owners and the people or roles you add can open it.',
};

/** New collection: a name, and whether it starts private. You manage it. */
export function CreateCollectionSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (collection: Collection) => void;
}) {
  const create = useCreateCollection();
  const [name, setName] = useState('');
  const [restricted, setRestricted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = name.trim();
    if (!value) return setError('Name the collection.');
    create.mutate(
      { name: value, restricted },
      {
        onSuccess: (collection) => {
          onOpenChange(false);
          setName('');
          setRestricted(false);
          toast('Collection created', { description: collection.name });
          onCreated?.(collection);
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
      title="New collection"
      description="Collections group documents and decide who can open them."
      footer={
        <Button className="w-full" loading={create.isPending} onClick={submit}>
          Create collection
        </Button>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-5 px-[var(--gutter)] pt-1 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Name"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          placeholder="Board papers, Customer calls…"
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <div className="flex flex-col gap-1.5">
          <label className="flex min-h-11 items-center gap-3 rounded-card bg-card-nested py-1.5 pr-3 pl-4 text-body select-none">
            <span className="flex-1">Restricted</span>
            <Switch checked={restricted} onCheckedChange={setRestricted} />
          </label>
          <p className="px-4 text-footnote text-muted-foreground">
            {restricted ? RESTRICTED_HINT.restricted : RESTRICTED_HINT.open}
          </p>
        </div>
      </form>
    </Sheet>
  );
}

/** Rename a collection (Edit access). */
export function RenameCollectionSheet({
  collection,
  open,
  onOpenChange,
}: {
  collection: Collection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rename = useRenameCollection();
  const [name, setName] = useState(collection?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const dirty = Boolean(name.trim()) && name.trim() !== collection?.name;

  const save = () => {
    if (!collection) return;
    if (!name.trim()) return setError('Name the collection.');
    if (!dirty) return;
    rename.mutate(
      { id: collection.id, name: name.trim() },
      {
        onSuccess: (updated) => {
          onOpenChange(false);
          toast('Renamed', { description: updated.name });
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Rename collection"
      footer={
        <Button className="w-full" disabled={!dirty} loading={rename.isPending} onClick={save}>
          Save
        </Button>
      }
    >
      <form
        noValidate
        className="px-[var(--gutter)] pt-1 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField
          label="Name"
          hideLabel
          autoComplete="off"
          enterKeyHint="done"
          value={name}
          error={error}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </form>
    </Sheet>
  );
}
