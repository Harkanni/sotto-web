'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownUp,
  Check,
  ChevronRight,
  Ellipsis,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { AccessSheet } from '@/components/docs/access-sheet';
import { CreateCollectionSheet, RenameCollectionSheet } from '@/components/docs/collection-sheets';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { emitShellEvent } from '@/components/shell/shell-events';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import { useFiles, type FileItem } from '@/lib/api/files';
import {
  apiKeys,
  useActiveWorkspace,
  useDeleteCollection,
  useWorkspaceCollection,
  useWorkspaceCollections,
  type Collection,
} from '@/lib/api/hooks';
import { NavLink } from '@/lib/nav/link';
import { useChildKey } from '@/lib/nav/hooks';
import { pushPath } from '@/lib/nav/routes';
import { navigate, navigateUp } from '@/lib/nav/store';
import { ACCESS_SENTENCE, accessAtLeast, atLeast } from '@/lib/roles';
import { useCanAdd } from '@/lib/uploads/permissions';
import { cn } from '@/lib/utils';
import { ChipGroup } from './parts/chips';
import { FileRow, RecordingRow, documentKind } from './parts/file-rows';
import { RowsSkeleton } from './parts/rows';

type DocSort = 'recent' | 'name';
type Filter = 'all' | 'pdf' | 'word' | 'text';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'word', label: 'Word' },
  { value: 'text', label: 'Text' },
];

function matches(filter: Filter, file: FileItem): boolean {
  if (filter === 'all') return true;
  const kind = documentKind(file).key;
  if (filter === 'pdf') return kind === 'pdf';
  if (filter === 'word') return kind === 'memo';
  return kind === 'note';
}

function SortMenu({
  sort,
  onSortChange,
}: {
  sort: DocSort;
  onSortChange: (sort: DocSort) => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Sort" icon={<ArrowDownUp aria-hidden />} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className={menuContent}
        >
          <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-footnote text-muted-foreground">
            Sort by
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={sort} onValueChange={(v) => onSortChange(v as DocSort)}>
            {(
              [
                ['recent', 'Recently updated'],
                ['name', 'Name'],
              ] as const
            ).map(([value, label]) => (
              <DropdownMenu.RadioItem key={value} value={value} className={menuItem}>
                <span className="flex-1">{label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden className="size-5 text-primary-text" strokeWidth={2.25} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function fileCount(count: number | undefined): string {
  if (!count) return 'No files yet';
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}

const CARD =
  'pressable flex h-[112px] w-[156px] flex-col justify-between rounded-card bg-card p-3 text-left select-none active:bg-row-pressed outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring';

/** How many files (documents and recordings) each collection holds. */
function useFileCounts(): Record<string, number> {
  const files = useFiles({}).data;
  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of files ?? [])
      if (f.collection) counts[f.collection.id] = (counts[f.collection.id] ?? 0) + 1;
    return counts;
  }, [files]);
}

function Collections() {
  const { entry } = useLayer();
  const workspace = useActiveWorkspace();
  const query = useWorkspaceCollections();
  const counts = useFileCounts();
  const [creating, setCreating] = useState(false);
  const canCreate = atLeast(workspace?.role, 'member');
  const create = () => setCreating(true);

  return (
    <>
      <AsyncWidget
        query={query}
        label="Collections"
        errorTitle="Couldn’t load collections"
        empty={{
          illustration: 'docs',
          title: 'No collections yet',
          description: 'Collections group documents and decide who can open them.',
          action: canCreate ? (
            <Button variant="secondary" onClick={create}>
              New collection
            </Button>
          ) : undefined,
        }}
        skeleton={
          <div className="flex gap-3 overflow-hidden px-[var(--gutter)]">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[112px] w-[156px] shrink-0 rounded-card" />
            ))}
          </div>
        }
      >
        {(collections) => (
          <ul className="flex snap-x scroll-px-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] pb-1 [scrollbar-width:none] touch-pan-x touch-pan-y [&::-webkit-scrollbar]:hidden">
            {collections.map((c) => (
              <li key={c.id} className="snap-start">
                <NavLink href={pushPath(entry.key, 'collection', c.id)} className={CARD}>
                  <span className="line-clamp-2 text-headline">{c.name}</span>
                  <span className="flex flex-col items-start gap-1">
                    {c.restricted && <RestrictedBadge />}
                    <span className="text-subhead text-muted-foreground tabular">
                      {fileCount(counts[c.id])}
                    </span>
                  </span>
                </NavLink>
              </li>
            ))}
            {canCreate && (
              <li className="snap-start">
                <button type="button" onClick={create} className={cn(CARD, 'text-primary-text')}>
                  <span
                    aria-hidden
                    className="grid size-8 place-items-center rounded-full bg-primary-tint"
                  >
                    <Plus className="size-5" strokeWidth={2} />
                  </span>
                  <span className="text-headline">New collection</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </AsyncWidget>
      <CreateCollectionSheet
        open={creating}
        onOpenChange={setCreating}
        onCreated={(c) => navigate(pushPath(entry.key, 'collection', c.id))}
      />
    </>
  );
}

/** Only admins, owners and the people or roles it names can open this one. */
function RestrictedBadge() {
  return (
    <Badge tone="danger" title="Restricted: only the people and roles it names can open it">
      <Lock aria-hidden strokeWidth={2.25} />
      Restricted
    </Badge>
  );
}

function DocList({
  files,
  base,
  selectedKey,
  label,
}: {
  files: FileItem[];
  base: string;
  selectedKey: string | null;
  label?: string;
}) {
  if (!files.length) return null;
  return (
    <section aria-label={label} className="px-[var(--gutter)]">
      {label && <h2 className="px-4 pb-1.5 text-footnote text-muted-foreground">{label}</h2>}
      <ul className="overflow-hidden rounded-card bg-card">
        {files.map((file) => {
          const audio = file.kind === 'audio';
          const href = pushPath(base, audio ? 'meeting' : 'doc', file.id);
          const Row = audio ? RecordingRow : FileRow;
          return <Row key={file.id} file={file} href={href} selected={selectedKey === href} />;
        })}
      </ul>
    </section>
  );
}

/** The way into the trash, below the library. */
function RecentlyDeleted({ base }: { base: string }) {
  return (
    <div className="px-[var(--gutter)]">
      <NavLink
        href={`${base}/trash`}
        className="flex min-h-11 items-center gap-3 rounded-card bg-card pr-3 pl-4 active:bg-row-pressed"
      >
        <Trash2 aria-hidden className="size-5 text-muted-foreground" />
        <span className="flex-1 text-body">Recently deleted</span>
        <ChevronRight aria-hidden className="size-5 text-faint-foreground" />
      </NavLink>
    </div>
  );
}

/** Docs (brief §9): documents and collections, with filters, sort and sensitivity labels. */
export function DocsScreen() {
  const { entry, tab } = useLayer();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<DocSort>('recent');
  // Typing stays instant; the list catches up a frame later.
  const query = useDeferredValue(search);
  const docsQuery = useFiles({ kind: 'document', q: query, sort });
  const selected = useChildKey(tab, entry.key);
  const searching = query.trim().length > 0;
  const canAdd = useCanAdd();

  return (
    <Screen
      title="Docs"
      actions={<SortMenu sort={sort} onSortChange={setSort} />}
      header={
        <div className="flex flex-col gap-3 pb-3">
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Search documents"
            className="px-[var(--gutter)]"
          />
          <ChipGroup aria-label="Type" value={filter} onValueChange={setFilter} options={FILTERS} />
        </div>
      }
    >
      <div className="flex flex-col gap-6 pt-1">
        {!searching && filter === 'all' && (
          <section aria-label="Collections" className="flex flex-col gap-1.5">
            <h2 className="px-[calc(var(--gutter)+16px)] text-footnote text-muted-foreground">
              Collections
            </h2>
            <Collections />
          </section>
        )}
        <AsyncWidget
          query={docsQuery}
          label="Documents"
          errorTitle="Couldn’t load your documents"
          empty={{
            illustration: 'docs',
            title: 'No documents yet',
            description:
              'Upload memos, PDFs and notes. Sotto reads them so you can ask about them.',
            action: canAdd ? (
              <Button onClick={() => emitShellEvent('pick-files', 'files')}>Upload files</Button>
            ) : undefined,
          }}
          skeleton={
            <div className="px-[var(--gutter)]">
              <RowsSkeleton rows={6} />
            </div>
          }
        >
          {(docs) => {
            const shown = docs.filter((d) => matches(filter, d));
            if (!shown.length) {
              return (
                <EmptyState
                  illustration="search"
                  title={searching ? `No results for “${query.trim()}”` : 'Nothing of this type'}
                  description={
                    searching
                      ? 'Try fewer words, or search in Ask to look inside documents.'
                      : 'Try another filter.'
                  }
                />
              );
            }
            const pinned = shown.filter((d) => d.pinned);
            return (
              <div
                className={cn(
                  'flex flex-col gap-6 transition-opacity duration-150',
                  docsQuery.isPlaceholderData && 'opacity-70',
                )}
              >
                {!searching && pinned.length > 0 && (
                  <DocList files={pinned} base={entry.key} selectedKey={selected} label="Pinned" />
                )}
                <DocList
                  files={searching ? shown : shown.filter((d) => !d.pinned)}
                  base={entry.key}
                  selectedKey={selected}
                  label={
                    searching
                      ? `${shown.length} ${shown.length === 1 ? 'result' : 'results'}`
                      : 'All documents'
                  }
                />
              </div>
            );
          }}
        </AsyncWidget>
        {!searching && filter === 'all' && <RecentlyDeleted base={entry.key} />}
      </div>
    </Screen>
  );
}

/** A collection's actions, by what you may do: who has access, rename, delete. */
function CollectionMenu({
  collection,
  onAccess,
  onRename,
  onDelete,
}: {
  collection: Collection;
  onAccess: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const workspace = useActiveWorkspace();
  const admin = atLeast(workspace?.role, 'admin');
  const canEdit = accessAtLeast(collection.access, 'edit');
  const canDelete = accessAtLeast(collection.access, 'manage');
  if (!admin && !canEdit && !canDelete) return null;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Collection actions"
          icon={<Ellipsis aria-hidden />}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className={menuContent}
        >
          {admin && (
            <DropdownMenu.Item className={menuItem} onSelect={onAccess}>
              <span className="flex-1">Who has access</span>
              <Users aria-hidden className="size-5 text-muted-foreground" />
            </DropdownMenu.Item>
          )}
          {canEdit && (
            <DropdownMenu.Item className={menuItem} onSelect={onRename}>
              <span className="flex-1">Rename</span>
              <Pencil aria-hidden className="size-5 text-muted-foreground" />
            </DropdownMenu.Item>
          )}
          {canDelete && (
            <>
              {(admin || canEdit) && (
                <DropdownMenu.Separator className="mx-1 my-1 h-px bg-separator" />
              )}
              <DropdownMenu.Item
                className={cn(menuItem, 'text-destructive-text')}
                onSelect={onDelete}
              >
                <span className="flex-1">Delete collection</span>
                <Trash2 aria-hidden className="size-5" />
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Delete doesn't ask (UI_DESIGN_SYSTEM §7): the collection leaves the list at once and the
 * toast offers Undo. The API call goes out when the toast closes, so Undo needs no restore.
 */
function useDeleteWithUndo() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  const remove = useDeleteCollection();
  return (collection: Collection) => {
    if (!workspace) return;
    const key = apiKeys.collections(workspace.id);
    const before = client.getQueryData<Collection[]>(key);
    client.setQueryData<Collection[]>(key, (list) => list?.filter((c) => c.id !== collection.id));
    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      remove.mutate(collection.id, {
        onError: (e) => {
          client.setQueryData(key, before);
          toast(messageOf(e));
        },
      });
    };
    toast(`Deleted ${collection.name}`, {
      action: {
        label: 'Undo',
        onClick: () => {
          settled = true;
          client.setQueryData(key, before);
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  };
}

/** One collection: who can open it, what you may do, and its documents. */
export function CollectionScreen() {
  const { entry, tab, parent } = useLayer();
  const id = entry.id!;
  const { collection: c, ...list } = useWorkspaceCollection(id);
  const files = useFiles({ collection: id });
  const canAdd = useCanAdd() && accessAtLeast(c?.access ?? 'view', 'edit');
  const selected = useChildKey(tab, entry.key);
  const deleteWithUndo = useDeleteWithUndo();
  const [sheet, setSheet] = useState<'access' | 'rename' | null>(null);
  const [shown, setShown] = useState<'access' | 'rename'>('access');
  const openSheet = (which: 'access' | 'rename') => {
    setShown(which);
    setSheet(which);
  };

  if (list.data && !c) {
    return (
      <Screen title="Collection" largeTitle={false}>
        <div className="mx-[var(--gutter)] mt-4 rounded-card bg-card">
          <EmptyState
            illustration="search"
            title="This collection isn’t here"
            description="It was deleted, or it’s restricted and you aren’t on its list."
            action={
              parent && (
                <Button variant="secondary" onClick={() => navigateUp(parent.key)}>
                  Go back
                </Button>
              )
            }
          />
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      title={c?.name ?? 'Collection'}
      largeTitle
      actions={
        c && (
          <CollectionMenu
            collection={c}
            onAccess={() => openSheet('access')}
            onRename={() => openSheet('rename')}
            onDelete={() => {
              if (parent) navigateUp(parent.key);
              deleteWithUndo(c);
            }}
          />
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex min-h-5 items-center gap-2 px-[calc(var(--gutter)+4px)]">
          {c ? (
            <>
              {c.restricted && <RestrictedBadge />}
              <p className="text-callout text-muted-foreground">{ACCESS_SENTENCE[c.access]}</p>
            </>
          ) : (
            <Skeleton className="h-4 w-32" />
          )}
        </div>
        <AsyncWidget
          query={files}
          label="Files"
          errorTitle="Couldn’t load this collection"
          empty={{
            illustration: 'docs',
            title: 'This collection is empty',
            description: canAdd
              ? 'Files you add while you’re here go into this collection.'
              : 'Files appear here when someone adds them.',
            action: canAdd ? (
              <Button
                variant="secondary"
                icon={<Upload aria-hidden />}
                onClick={() => emitShellEvent('pick-files', 'files')}
              >
                Upload files
              </Button>
            ) : undefined,
          }}
          skeleton={
            <div className="px-[var(--gutter)]">
              <RowsSkeleton rows={4} />
            </div>
          }
        >
          {(items) => <DocList files={items} base={entry.key} selectedKey={selected} />}
        </AsyncWidget>
      </div>
      <AccessSheet
        collection={c}
        open={sheet === 'access'}
        onOpenChange={(open) => setSheet(open ? 'access' : null)}
      />
      {shown === 'rename' && (
        <RenameCollectionSheet
          key={c?.name}
          collection={c}
          open={sheet === 'rename'}
          onOpenChange={(open) => setSheet(open ? 'rename' : null)}
        />
      )}
    </Screen>
  );
}
