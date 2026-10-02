'use client';

import { ArrowDownUp, Check } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useDeferredValue, useState } from 'react';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { emitShellEvent } from '@/components/shell/shell-events';
import { SensitivityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import { NavLink } from '@/lib/nav/link';
import { useChildKey } from '@/lib/nav/hooks';
import { pushPath } from '@/lib/nav/routes';
import type { DocSort } from '@/lib/sample/api';
import type { Doc, DocKind } from '@/lib/sample/data';
import { useCollection, useCollections, useDocs } from '@/lib/sample/queries';
import { cn } from '@/lib/utils';
import { ChipGroup } from './parts/chips';
import { DocRow, RowsSkeleton } from './parts/rows';

type Filter = 'all' | DocKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'memo', label: 'Memos' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'note', label: 'Notes' },
  { value: 'sheet', label: 'Sheets' },
];

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

function Collections() {
  const { entry } = useLayer();
  const query = useCollections();
  return (
    <AsyncWidget
      query={query}
      label="Collections"
      errorTitle="Couldn’t load collections"
      empty={{
        illustration: 'docs',
        title: 'No collections yet',
        description: 'Collections group documents and control who can open them.',
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
              <NavLink
                href={pushPath(entry.key, 'collection', c.id)}
                className="pressable flex h-[112px] w-[156px] flex-col justify-between rounded-card bg-card p-3 select-none active:bg-row-pressed"
              >
                <span className="line-clamp-2 text-headline">{c.name}</span>
                <span className="flex flex-col items-start gap-1">
                  {c.sensitivity !== 'internal' && <SensitivityBadge level={c.sensitivity} />}
                  <span className="text-subhead text-muted-foreground tabular">
                    {c.count} {c.count === 1 ? 'file' : 'files'}
                  </span>
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </AsyncWidget>
  );
}

function DocList({
  docs,
  base,
  selectedKey,
  label,
}: {
  docs: Doc[];
  base: string;
  selectedKey: string | null;
  label?: string;
}) {
  if (!docs.length) return null;
  return (
    <section aria-label={label} className="px-[var(--gutter)]">
      {label && <h2 className="px-4 pb-1.5 text-footnote text-muted-foreground">{label}</h2>}
      <ul className="overflow-hidden rounded-card bg-card">
        {docs.map((doc) => {
          const href = pushPath(base, 'doc', doc.id);
          return <DocRow key={doc.id} doc={doc} href={href} selected={selectedKey === href} />;
        })}
      </ul>
    </section>
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
  const docsQuery = useDocs({ query, sort });
  const selected = useChildKey(tab, entry.key);
  const searching = query.trim().length > 0;

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
            action: <Button onClick={() => emitShellEvent('open-add')}>Add files</Button>,
          }}
          skeleton={
            <div className="px-[var(--gutter)]">
              <RowsSkeleton rows={6} />
            </div>
          }
        >
          {(docs) => {
            const shown = docs.filter((d) => filter === 'all' || d.kind === filter);
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
                  <DocList docs={pinned} base={entry.key} selectedKey={selected} label="Pinned" />
                )}
                <DocList
                  docs={searching ? shown : shown.filter((d) => !d.pinned)}
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
      </div>
    </Screen>
  );
}

/** One collection: its documents, under the collection's sensitivity label. */
export function CollectionScreen() {
  const { entry, tab } = useLayer();
  const id = entry.id!;
  const collection = useCollection(id);
  const docs = useDocs({ collectionId: id });
  const selected = useChildKey(tab, entry.key);
  const c = collection.data;

  return (
    <Screen title={c?.name ?? 'Collection'} largeTitle>
      <div className="flex flex-col gap-4">
        {c && (
          <div className="flex items-center gap-2 px-[calc(var(--gutter)+4px)]">
            <SensitivityBadge level={c.sensitivity} />
            <p className="text-callout text-muted-foreground">{c.description}</p>
          </div>
        )}
        <AsyncWidget
          query={docs}
          label="Documents"
          errorTitle="Couldn’t load this collection"
          empty={{
            illustration: 'docs',
            title: 'This collection is empty',
            description: 'Move documents here from their menu, or add new ones.',
          }}
          skeleton={
            <div className="px-[var(--gutter)]">
              <RowsSkeleton rows={4} />
            </div>
          }
        >
          {(list) => <DocList docs={list} base={entry.key} selectedKey={selected} />}
        </AsyncWidget>
      </div>
    </Screen>
  );
}
