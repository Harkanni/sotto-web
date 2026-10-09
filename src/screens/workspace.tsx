'use client';

import { Check, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  CreateWorkspaceSheet,
  messageOf,
  useSwitchWorkspace,
} from '@/components/account/workspace-actions';
import { WorkspaceTile } from '@/components/account/workspace-tile';
import { Screen } from '@/components/shell/screen';
import { Button } from '@/components/ui/button';
import { List, ListRow, RowIcon } from '@/components/ui/list';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { TextField } from '@/components/ui/text-field';
import { AsyncWidget } from '@/components/widgets/async-widget';
import {
  useActiveWorkspace,
  useLoadSampleContent,
  useRenameWorkspace,
  useWorkspaces,
} from '@/lib/api/hooks';
import { ROLE_LABEL, atLeast } from '@/lib/roles';
import { RowsSkeleton } from './parts/rows';

function peopleLabel(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

/**
 * Fictional collections to explore with (owners). Loading twice changes nothing; a load whose
 * files didn't all arrive (storage or the queue was down) is finished by loading again.
 */
function SampleContent() {
  const workspace = useActiveWorkspace();
  const load = useLoadSampleContent();
  if (!workspace) return null;
  if (workspace.sample?.filesLoaded) {
    return (
      <List
        header="Sample content"
        footer="Four collections of fictional memos, meetings and chats. Delete them in Docs any time."
      >
        <ListRow
          leading={<RowIcon icon={Sparkles} tint="purple" />}
          title="Sample content"
          detail="Loaded"
        />
      </List>
    );
  }
  const finishing = Boolean(workspace.sample);
  return (
    <List
      header="Sample content"
      footer={
        finishing
          ? 'The sample collections are here, but their memos and meetings didn’t all arrive.'
          : 'Adds four collections of fictional memos, meetings and chats, labelled as samples.'
      }
    >
      <ListRow
        leading={<RowIcon icon={Sparkles} tint="purple" />}
        title={finishing ? 'Finish loading sample content' : 'Load sample content'}
        trailing={
          load.isPending ? <Spinner size={18} className="text-muted-foreground" /> : undefined
        }
        rowProps={{ 'aria-busy': load.isPending || undefined }}
        onClick={() => {
          if (load.isPending) return;
          load.mutate(undefined, {
            onSuccess: () => toast('Sample content loaded', { description: 'See it in Docs.' }),
            onError: (e) => toast(messageOf(e)),
          });
        }}
      />
    </List>
  );
}

/** The active workspace: its name (admins rename it), and every workspace you belong to. */
export function WorkspaceScreen() {
  const workspace = useActiveWorkspace();
  const workspaces = useWorkspaces();
  const rename = useRenameWorkspace();
  const { switchTo, pendingId } = useSwitchWorkspace();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const admin = atLeast(workspace?.role, 'admin');
  const people = workspaces.data?.find((w) => w.active)?.members;
  const dirty = draft !== null && Boolean(draft.trim()) && draft.trim() !== workspace?.name;

  const save = () => {
    if (draft !== null && !draft.trim()) return setError('Name the workspace.');
    if (!dirty || draft === null) return;
    rename.mutate(draft.trim(), {
      onSuccess: (w) => {
        setDraft(null);
        toast('Workspace renamed', { description: w.name });
      },
      onError: (e) => setError(messageOf(e)),
    });
  };

  return (
    <Screen
      title="Workspace"
      largeTitle={false}
      actions={
        admin ? (
          <Button variant="ghost" disabled={!dirty} loading={rename.isPending} onClick={save}>
            Save
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-7 pt-4">
        <header className="flex flex-col items-center gap-3 px-[var(--gutter)] text-center">
          {workspace ? (
            <WorkspaceTile name={workspace.name} size={64} />
          ) : (
            <Skeleton className="size-16 rounded-[14px]" />
          )}
          {workspace ? (
            <div className="min-w-0 max-w-full">
              <p className="truncate text-title-2">{workspace.name}</p>
              <p className="text-callout text-muted-foreground">
                {ROLE_LABEL[workspace.role]}
                {people !== undefined && `, ${peopleLabel(people)}`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
          )}
        </header>

        {admin && workspace && (
          <form
            noValidate
            className="px-[var(--gutter)]"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <TextField
              label="Name"
              surface="page"
              autoComplete="organization"
              autoCapitalize="words"
              enterKeyHint="done"
              value={draft ?? workspace.name}
              error={error}
              hint="Everyone in the workspace sees the new name."
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
            />
          </form>
        )}

        <section aria-label="Your workspaces" className="flex flex-col gap-1.5">
          <h2 className="px-[calc(var(--gutter)+16px)] text-footnote text-muted-foreground">
            Your workspaces
          </h2>
          <AsyncWidget
            query={workspaces}
            label="Your workspaces"
            errorTitle="Couldn’t load your workspaces"
            isEmpty={() => false}
            empty={{ illustration: 'team', title: 'No workspaces yet' }}
            skeleton={
              <div className="px-[var(--gutter)]">
                <RowsSkeleton rows={2} />
              </div>
            }
          >
            {(list) => (
              <List
                aria-label="Workspaces"
                footer="Each workspace has its own documents, meetings and people."
              >
                {list.map((w) => (
                  <ListRow
                    key={w.id}
                    plain
                    leading={<WorkspaceTile name={w.name} size={32} />}
                    title={w.name}
                    subtitle={`${ROLE_LABEL[w.role]}, ${peopleLabel(w.members)}`}
                    trailing={
                      w.active ? (
                        <Check
                          aria-label="Active"
                          className="size-5 text-primary-text"
                          strokeWidth={2.5}
                        />
                      ) : pendingId === w.id ? (
                        <Spinner size={18} className="text-muted-foreground" />
                      ) : undefined
                    }
                    rowProps={{ 'aria-current': w.active ? 'true' : undefined }}
                    onClick={w.active || pendingId ? undefined : () => switchTo(w.id)}
                  />
                ))}
                <ListRow
                  leading={<RowIcon icon={Plus} tint="indigo" />}
                  title="New workspace"
                  onClick={() => setCreating(true)}
                />
              </List>
            )}
          </AsyncWidget>
        </section>

        {workspace?.role === 'owner' && <SampleContent />}
      </div>
      <CreateWorkspaceSheet open={creating} onOpenChange={setCreating} />
    </Screen>
  );
}
