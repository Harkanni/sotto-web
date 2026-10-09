'use client';

import { ExternalLink, RotateCw, ShieldAlert } from 'lucide-react';
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '@/lib/nav/hooks';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { Avatar } from '@/components/ui/avatar';
import { Badge, SensitivityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import { fileLink, useFile, useFileContent, useRetryFile, type FileItem } from '@/lib/api/files';
import { failureText, overallOf, stepLabel } from '@/lib/files/status';
import { fileSize, updatedLabel } from '@/lib/format';
import { navigateUp } from '@/lib/nav/store';
import { accessAtLeast } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { AskButton, DetailWithAsk } from './parts/detail';
import { MoreMenu } from './parts/more-menu';
import { useFileActions } from './parts/file-actions';
import { FileIcon, documentKind } from './parts/file-rows';

function DocSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-[var(--gutter)] pt-2 [--surface:var(--background)]">
      <SkeletonText lines={8} lineClassName="h-4" />
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

function DocHeading({ file }: { file: FileItem }) {
  const meta = [
    documentKind(file).label,
    file.pageCount ? `${file.pageCount} ${file.pageCount === 1 ? 'page' : 'pages'}` : null,
    fileSize(Math.max(1, Math.round(file.sizeBytes / 1024))),
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <header className="flex flex-col gap-4 px-[var(--gutter)] pt-1 pb-6">
      <div className="flex items-start gap-3">
        <FileIcon file={file} size={44} />
        <div className="min-w-0 flex-1">
          {/* Screen's own h1 (read and focused after a push) carries this title. */}
          <p aria-hidden className="text-title-2 text-balance">
            {file.title}
          </p>
          <p className="mt-1 text-subhead text-muted-foreground">{meta}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {file.owner && (
          <span className="flex items-center gap-2 text-subhead">
            <Avatar name={file.owner.name} size={24} />
            {file.owner.name}
          </span>
        )}
        <span className="text-subhead text-muted-foreground">
          {updatedLabel(new Date(file.updatedAt).getTime())}
        </span>
        <SensitivityBadge level={file.sensitivity} />
        {file.source === 'sample' && <Badge>Sample</Badge>}
        {file.collection && (
          <span className="text-subhead text-muted-foreground">in {file.collection.name}</span>
        )}
        {file.tags.map((t) => (
          <span
            key={t}
            className="rounded-full bg-fill px-2.5 py-0.5 text-footnote text-muted-foreground"
          >
            {t}
          </span>
        ))}
      </div>
    </header>
  );
}

/** While Sotto works on it: a step and a bar; if it failed: why, and Retry for people who can. */
export function NotReady({ file }: { file: FileItem }) {
  const retry = useRetryFile();
  if (file.status === 'failed') {
    return (
      <div className="mx-[var(--gutter)] rounded-card bg-card">
        <EmptyState
          illustration="error"
          title={
            file.kind === 'audio' ? 'Sotto couldn’t transcribe this' : 'Sotto couldn’t read this'
          }
          description={failureText(file.error)}
          action={
            accessAtLeast(file.access, 'edit') ? (
              <Button
                variant="secondary"
                icon={<RotateCw aria-hidden />}
                loading={retry.isPending}
                onClick={() => retry.mutate(file.id, { onError: (e) => toast(messageOf(e)) })}
              >
                Retry
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }
  const pct = Math.round(overallOf(file) * 100);
  return (
    <div className="mx-[var(--gutter)] flex flex-col items-center rounded-card bg-card px-6 py-7 text-center">
      <EmptyState
        illustration="processing"
        title={`${stepLabel(file)}…`}
        description={
          file.kind === 'audio'
            ? 'The transcript and notes appear here when Sotto finishes. You can leave this screen.'
            : 'The text appears here as soon as Sotto has read it. You can leave this screen.'
        }
        className="p-0"
      />
      <span
        role="progressbar"
        aria-label={stepLabel(file)}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-4 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-fill"
      >
        <span
          className="block h-full rounded-full bg-primary transition-[translate] duration-700 ease-out"
          style={{ translate: `${pct - 100}% 0` }}
        />
      </span>
    </div>
  );
}

/** Letters and digits only: Markdown, spacing and punctuation never stop a passage matching. */
function matchKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Where a cited passage starts: the first block (on the cited page first) whose text holds the
 * passage's opening words. Chunks can start mid-paragraph, so it's a substring match.
 */
function findPassage(
  pages: { page: number; text: string }[],
  quote: string,
  page: number | null,
): { page: number; block: number } | null {
  const key = matchKey(quote);
  if (key.length < 8) return null;
  const ordered = page
    ? [...pages].sort((a, b) => Number(b.page === page) - Number(a.page === page))
    : pages;
  for (const length of [48, 24]) {
    const probe = key.slice(0, length);
    for (const p of ordered) {
      const blocks = blocksOf(p.text);
      const i = blocks.findIndex((b) => matchKey(b).includes(probe));
      if (i !== -1) return { page: p.page, block: i };
    }
  }
  return null;
}

function blocksOf(text: string): string[] {
  return text.split(/\n{2,}/).filter((b) => b.trim());
}

/** A Markdown heading or list item reads as one; everything else is a paragraph. */
function Block({ text }: { text: string }) {
  const heading = /^(#{1,3})\s+(.*)$/.exec(text);
  if (heading) {
    const level = heading[1]!.length;
    return (
      <p className={cn('font-semibold', level === 1 ? 'text-title-3' : 'text-headline')}>
        {heading[2]}
      </p>
    );
  }
  const lines = text.split('\n');
  if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
    return (
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        {lines.map((l, i) => (
          <li key={i}>{l.replace(/^\s*([-*]|\d+\.)\s+/, '')}</li>
        ))}
      </ul>
    );
  }
  return <p>{text.replace(/\n/g, ' ')}</p>;
}

function Content({
  file,
  target,
}: {
  file: FileItem;
  target: { page: number | null; hl: string | null };
}) {
  const query = useFileContent(file.id, file.status === 'ready');
  const content = query.data;
  const found = useMemo(
    () => (content && target.hl ? findPassage(content.pages, target.hl, target.page) : null),
    [content, target.hl, target.page],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const landed = useRef(false);

  // A citation opens the document at its passage (or at least its page), centred, once.
  useLayoutEffect(() => {
    if (landed.current || !content || (!target.hl && !target.page)) return;
    const root = rootRef.current;
    const el =
      root?.querySelector<HTMLElement>('[data-cited]') ??
      (target.page ? root?.querySelector<HTMLElement>(`#page-${target.page}`) : null);
    if (!el) return;
    landed.current = true;
    el.scrollIntoView({ block: el.hasAttribute('data-cited') ? 'center' : 'start' });
  }, [content, target.hl, target.page]);

  return (
    <AsyncWidget
      query={query}
      label="Document text"
      errorTitle="Couldn’t open the text"
      isEmpty={(c) => c.pages.every((p) => !p.text.trim())}
      empty={{
        illustration: 'docs',
        title: 'No text',
        description: 'This document has no readable text.',
      }}
      skeleton={<DocSkeleton />}
    >
      {(content) => (
        <div ref={rootRef} className="mx-[var(--gutter)] rounded-card bg-card px-5 py-5">
          <div className="prose-reading mx-auto flex flex-col gap-4">
            {content.pages.map((page) => (
              <Fragment key={page.page}>
                {content.paged && (
                  // Page markers match what citations name: "page 3".
                  <p
                    id={`page-${page.page}`}
                    className="flex scroll-mt-16 items-center gap-3 pt-2 text-footnote text-muted-foreground first:pt-0"
                  >
                    <span className="h-px flex-1 bg-separator" aria-hidden />
                    Page {page.page}
                    <span className="h-px flex-1 bg-separator" aria-hidden />
                  </p>
                )}
                {blocksOf(page.text).map((block, i) =>
                  found && found.page === page.page && found.block === i ? (
                    // The cited passage: tinted like a citation, and named for screen readers.
                    <div
                      key={i}
                      data-cited
                      role="mark"
                      aria-label="Cited passage"
                      className="-mx-2.5 animate-[fade-in_400ms_var(--ease-out)] rounded-[8px] bg-primary-tint-strong px-2.5 py-1.5"
                    >
                      <Block text={block} />
                    </div>
                  ) : (
                    <Block key={i} text={block} />
                  ),
                )}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </AsyncWidget>
  );
}

/** A document: what it is, who added it, its label, and its text page by page. */
export function DocScreen() {
  const { entry, parent } = useLayer();
  const id = entry.id!;
  const query = useFile(id);
  const actionsFor = useFileActions();
  const file = query.data;
  const nav = useNav();
  // A citation opens the document at its page and passage: ?page=3&hl=<the passage's start>.
  const [target] = useState(() => {
    const params = new URLSearchParams(nav.search);
    return { page: Number(params.get('page')) || null, hl: params.get('hl') };
  });
  const actions = file ? actionsFor(file, entry.key) : [];

  const openOriginal = async () => {
    // The tab opens inside the click (popup blockers allow that), then gets the short-lived link.
    const tab = window.open('', '_blank');
    try {
      const { url } = await fileLink(id, true);
      if (tab) tab.location.href = url;
    } catch (error) {
      tab?.close();
      toast(messageOf(error));
    }
  };

  return (
    <DetailWithAsk about={file?.title ?? 'this document'} fileId={id} base={entry.key}>
      <Screen
        title={file?.title ?? 'Document'}
        largeTitle={false}
        heading={
          file ? <DocHeading file={file} /> : query.isPending ? <HeadingSkeleton /> : undefined
        }
        actions={
          file && (
            <>
              {file.mime === 'application/pdf' && file.status !== 'uploading' && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open the original PDF"
                  icon={<ExternalLink aria-hidden />}
                  onClick={() => void openOriginal()}
                />
              )}
              <AskButton scopeLabel={file.title} fileId={file.id} />
              <MoreMenu actions={actions} />
            </>
          )
        }
      >
        <AsyncWidget
          query={query}
          label="Document"
          errorTitle="Couldn’t open this document"
          isEmpty={(f) => !f || f.deletedAt !== null}
          empty={{
            illustration: 'docs',
            title: 'This document is gone',
            description: 'It was deleted, or moved somewhere you can’t open.',
            action: (
              <Button variant="secondary" onClick={() => navigateUp(parent?.key ?? '/docs')}>
                Go back
              </Button>
            ),
          }}
          skeleton={<DocSkeleton />}
        >
          {(f) =>
            f && (
              <article className="flex flex-col gap-6">
                {f.sensitivity === 'restricted' && (
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
                {f.status === 'ready' ? (
                  <Content file={f} target={target} />
                ) : (
                  <NotReady file={f} />
                )}
              </article>
            )
          }
        </AsyncWidget>
      </Screen>
    </DetailWithAsk>
  );
}
