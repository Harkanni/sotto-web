'use client';

import { Ellipsis, ShieldAlert } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { Avatar } from '@/components/ui/avatar';
import { SensitivityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { AsyncWidget } from '@/components/widgets/async-widget';
import { fileSize, updatedLabel } from '@/lib/format';
import { navigateUp } from '@/lib/nav/store';
import { COLLECTIONS, personById, type Doc } from '@/lib/sample/data';
import { useDoc } from '@/lib/sample/queries';
import { useItemActions } from './parts/item-actions';
import { AskButton, DetailWithAsk } from './parts/detail';
import { KindIcon, docKindLabel } from './parts/rows';

function MoreMenu({ actions }: { actions: ReturnType<ReturnType<typeof useItemActions>> }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="More" icon={<Ellipsis aria-hidden />} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className={menuContent}
        >
          {actions
            .filter((a) => !a.destructive)
            .map((a) => (
              <DropdownMenu.Item key={a.id} className={menuItem} onSelect={a.onSelect}>
                <span className="flex-1">{a.label}</span>
                <a.icon aria-hidden className="size-5 text-muted-foreground" />
              </DropdownMenu.Item>
            ))}
          <DropdownMenu.Separator className="mx-1 my-1 h-px bg-separator" />
          {actions
            .filter((a) => a.destructive)
            .map((a) => (
              <DropdownMenu.Item
                key={a.id}
                className={`${menuItem} text-destructive-text`}
                onSelect={a.onSelect}
              >
                <span className="flex-1">{a.label}</span>
                <a.icon aria-hidden className="size-5" />
              </DropdownMenu.Item>
            ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function DocSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-[var(--gutter)] pt-2 [--surface:var(--background)]">
      <Skeleton className="h-24 rounded-card" />
      <SkeletonText lines={6} lineClassName="h-4" />
    </div>
  );
}

function HeadingSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-4 px-[var(--gutter)] pt-1 pb-6 [--surface:var(--background)]"
    >
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 rounded-[9px]" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-6 w-2/3" />
    </div>
  );
}

function DocHeading({ d }: { d: Doc }) {
  const owner = personById(d.ownerId);
  const collection = COLLECTIONS.find((c) => c.id === d.collectionId);
  return (
    <header className="flex flex-col gap-4 px-[var(--gutter)] pt-1 pb-6">
      <div className="flex items-start gap-3">
        <KindIcon kind={d.kind} size={44} />
        <div className="min-w-0 flex-1">
          {/* Screen's own h1 (read and focused after a push) carries this title. */}
          <p aria-hidden className="text-title-2 text-balance">
            {d.title}
          </p>
          <p className="mt-1 text-subhead text-muted-foreground">
            {docKindLabel(d.kind)}, {d.pages} {d.pages === 1 ? 'page' : 'pages'},{' '}
            {fileSize(d.sizeKb)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {owner && (
          <span className="flex items-center gap-2 text-subhead">
            <Avatar name={owner.name} size={24} />
            {owner.name}
          </span>
        )}
        <span className="text-subhead text-muted-foreground">{updatedLabel(d.updatedAt)}</span>
        <SensitivityBadge level={d.sensitivity} />
        {collection && (
          <span className="text-subhead text-muted-foreground">in {collection.name}</span>
        )}
      </div>
    </header>
  );
}

/** A document: what it is, who owns it, its sensitivity, a summary, and the text. */
export function DocScreen() {
  const { entry, parent } = useLayer();
  const id = entry.id!;
  const query = useDoc(id);
  const actionsFor = useItemActions();
  const doc = query.data;
  const actions = doc ? actionsFor('doc', doc, entry.key) : [];

  return (
    <DetailWithAsk about={doc?.title ?? 'this document'} base={entry.key}>
      <Screen
        title={doc?.title ?? 'Document'}
        largeTitle={false}
        heading={doc ? <DocHeading d={doc} /> : query.isPending ? <HeadingSkeleton /> : undefined}
        actions={
          doc && (
            <>
              <AskButton scopeLabel={doc.title} />
              <MoreMenu actions={actions} />
            </>
          )
        }
      >
        <AsyncWidget
          query={query}
          label="Document"
          errorTitle="Couldn’t open this document"
          isEmpty={(d) => d === null}
          empty={{
            illustration: 'docs',
            title: 'This document is gone',
            description: 'It was deleted or moved somewhere you can’t open.',
            action: (
              <Button variant="secondary" onClick={() => navigateUp(parent?.key ?? '/docs')}>
                Go back
              </Button>
            ),
          }}
          skeleton={<DocSkeleton />}
        >
          {(d) =>
            d && (
              <article className="flex flex-col gap-6">
                {d.sensitivity === 'restricted' && (
                  <div className="mx-[var(--gutter)] flex gap-3 rounded-card bg-card p-4">
                    <ShieldAlert
                      aria-hidden
                      className="mt-0.5 size-5 shrink-0 text-destructive-text"
                    />
                    <p className="text-callout">
                      Restricted. Sotto answers from this document only with private AI; it is never
                      sent to an outside model.
                    </p>
                  </div>
                )}

                <section
                  aria-label="Summary"
                  className="mx-[var(--gutter)] rounded-card bg-card p-4"
                >
                  <h3 className="text-footnote text-muted-foreground">Summary</h3>
                  <p className="mt-1.5 text-callout leading-[1.45]">{d.summary}</p>
                </section>

                <div className="mx-[var(--gutter)] rounded-card bg-card px-5 py-5">
                  <div className="prose-reading mx-auto flex flex-col gap-4">
                    {d.body.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
              </article>
            )
          }
        </AsyncWidget>
      </Screen>
    </DetailWithAsk>
  );
}
