'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { useActivateWorkspace, useCreateWorkspace } from '@/lib/api/hooks';
import { tabOf } from '@/lib/nav/routes';
import { resetOtherTabs } from '@/lib/nav/store';

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

/** Other tabs held the previous workspace's screens: they reopen at their roots. */
function afterSwitch() {
  resetOtherTabs(tabOf(window.location.pathname));
}

/** Switch the session to another workspace; everything on screen reloads for it. */
export function useSwitchWorkspace() {
  const activate = useActivateWorkspace();
  return {
    pendingId: activate.isPending ? activate.variables : null,
    switchTo: (id: string) =>
      activate.mutate(id, {
        onSuccess: (workspace) => {
          afterSwitch();
          toast(`Switched to ${workspace.name}`);
        },
        onError: (error) => toast(messageOf(error)),
      }),
  };
}

/** New workspace: you own it and it becomes the active one. */
export function CreateWorkspaceSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = name.trim();
    if (!value) return setError('Name the workspace.');
    create.mutate(value, {
      onSuccess: (workspace) => {
        afterSwitch();
        onOpenChange(false);
        setName('');
        toast(`Created ${workspace.name}`, { description: 'It’s your active workspace now.' });
      },
      onError: (e) => setError(messageOf(e)),
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
      title="New workspace"
      description="A separate library with its own people and access. You’ll be its owner."
      footer={
        <Button className="w-full" loading={create.isPending} onClick={submit}>
          Create workspace
        </Button>
      }
    >
      <form
        noValidate
        className="px-[var(--gutter)] pt-1 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Workspace name"
          autoComplete="organization"
          autoCapitalize="words"
          enterKeyHint="done"
          placeholder="Your team or company"
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </form>
    </Sheet>
  );
}
