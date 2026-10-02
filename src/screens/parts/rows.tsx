'use client';

import { memo } from 'react';
import {
  AudioLines,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  NotebookPen,
  ScrollText,
} from 'lucide-react';
import { AvatarStack } from '@/components/ui/avatar';
import { SensitivityBadge } from '@/components/ui/badge';
import { ListRowContent } from '@/components/ui/list';
import { ActionRow } from '@/components/ui/row-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { duration, relativeTime, whenInGroup } from '@/lib/format';
import { navigate } from '@/lib/nav/store';
import type { Doc, DocKind, Meeting, Thread } from '@/lib/sample/data';
import { personById } from '@/lib/sample/data';
import { cn } from '@/lib/utils';
import { useItemActions } from './item-actions';

export const DOC_KINDS: Record<DocKind, { icon: typeof FileText; tint: string; label: string }> = {
  memo: {
    icon: ScrollText,
    tint: 'text-[#5856d6] bg-[#5856d6]/12 dark:text-[#9a98ff] dark:bg-[#5e5ce6]/24',
    label: 'Memo',
  },
  pdf: {
    icon: FileText,
    tint: 'text-[#d70015] bg-[#ff3b30]/12 dark:text-[#ff6961] dark:bg-[#ff453a]/22',
    label: 'PDF',
  },
  note: {
    icon: NotebookPen,
    tint: 'text-[#b33000] bg-[#ff9500]/14 dark:text-[#ff9f0a] dark:bg-[#ff9f0a]/22',
    label: 'Note',
  },
  sheet: {
    icon: FileSpreadsheet,
    tint: 'text-[#1d7432] bg-[#34c759]/14 dark:text-[#30d158] dark:bg-[#30d158]/20',
    label: 'Sheet',
  },
};

export function docKindLabel(kind: DocKind) {
  return DOC_KINDS[kind].label;
}

export function KindIcon({ kind, size = 36 }: { kind: DocKind; size?: 36 | 44 }) {
  const { icon: Icon, tint } = DOC_KINDS[kind];
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-[9px]',
        tint,
        size === 44 ? 'size-11' : 'size-9',
      )}
    >
      <Icon className={size === 44 ? 'size-6' : 'size-5'} strokeWidth={1.9} />
    </span>
  );
}

function TintIcon({ icon: Icon, tint }: { icon: typeof FileText; tint: string }) {
  return (
    <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center rounded-full', tint)}>
      <Icon className="size-5" strokeWidth={1.9} />
    </span>
  );
}

export const MEETING_TINT =
  'text-[#5856d6] bg-[#5856d6]/12 dark:text-[#9a98ff] dark:bg-[#5e5ce6]/24';
export const THREAD_TINT =
  'text-[#0040dd] bg-[#007aff]/12 dark:text-[#64d2ff] dark:bg-[#0a84ff]/24';

export function ownerName(id: string) {
  return personById(id)?.name ?? 'Someone';
}

/** Sensitivity worth flagging in a list: everything but the default, Internal. */
function shouldShowLabel(doc: Doc) {
  return doc.sensitivity !== 'internal';
}

// ── Previews (long-press) ────────────────────────────────────────────────────────────────

function DocPreview({ doc }: { doc: Doc }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <KindIcon kind={doc.kind} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline">{doc.title}</p>
          <p className="text-subhead text-muted-foreground">
            {ownerName(doc.ownerId)}, {relativeTime(doc.updatedAt)}
          </p>
        </div>
      </div>
      <p className="line-clamp-4 text-callout text-muted-foreground">{doc.summary}</p>
      <div className="flex items-center gap-2">
        <SensitivityBadge level={doc.sensitivity} />
        <span className="text-footnote text-muted-foreground">
          {doc.pages} {doc.pages === 1 ? 'page' : 'pages'}
        </span>
      </div>
    </div>
  );
}

function MeetingPreview({ meeting }: { meeting: Meeting }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-headline">{meeting.title}</p>
        <p className="text-subhead text-muted-foreground">
          {relativeTime(meeting.startedAt)}, {duration(meeting.durationSec)}
        </p>
      </div>
      {meeting.summary.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-callout text-muted-foreground">
          {meeting.summary.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-callout text-muted-foreground">
          The summary appears when processing finishes.
        </p>
      )}
      <AvatarStack names={meeting.participantIds.map(ownerName)} max={5} />
    </div>
  );
}

function ThreadPreview({ thread }: { thread: Thread }) {
  const answer = [...thread.messages].reverse().find((m) => m.role === 'assistant');
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-headline">{thread.title}</p>
      {answer && (
        <p className="line-clamp-5 text-callout text-muted-foreground">
          {answer.text.replace(/\[\d+\]/g, '')}
        </p>
      )}
    </div>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────────────────

export const DocRow = memo(function DocRow({
  doc,
  href,
  selected,
}: {
  doc: Doc;
  href: string;
  selected?: boolean;
}) {
  const actionsFor = useItemActions();
  return (
    <ActionRow
      label={doc.title}
      actions={actionsFor('doc', doc, href)}
      preview={<DocPreview doc={doc} />}
      onOpen={() => navigate(href)}
    >
      <ListRowContent
        href={href}
        selected={selected}
        leading={<KindIcon kind={doc.kind} />}
        title={doc.title}
        subtitle={`${relativeTime(doc.updatedAt)}, ${ownerName(doc.ownerId)}`}
        trailing={shouldShowLabel(doc) ? <SensitivityBadge level={doc.sensitivity} /> : undefined}
        rowProps={{ 'data-item': doc.id }}
      />
    </ActionRow>
  );
});

export const MeetingRow = memo(function MeetingRow({
  meeting,
  href,
  selected,
}: {
  meeting: Meeting;
  href: string;
  selected?: boolean;
}) {
  const actionsFor = useItemActions();
  const processing = meeting.status.state === 'processing' ? meeting.status : null;
  return (
    <ActionRow
      label={meeting.title}
      actions={actionsFor('meeting', meeting, href)}
      preview={<MeetingPreview meeting={meeting} />}
      onOpen={() => navigate(href)}
    >
      <ListRowContent
        href={href}
        selected={selected}
        leading={<TintIcon icon={AudioLines} tint={MEETING_TINT} />}
        title={meeting.title}
        subtitle={
          processing ? (
            <span className="flex items-center gap-2">
              <span>
                {processing.step}, {Math.round(processing.progress * 100)}%
              </span>
              <span aria-hidden className="h-1 w-14 overflow-hidden rounded-full bg-fill">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${processing.progress * 100}%` }}
                />
              </span>
            </span>
          ) : (
            `${whenInGroup(meeting.startedAt)}, ${duration(meeting.durationSec)}`
          )
        }
        trailing={
          <AvatarStack
            className="row-avatars"
            names={meeting.participantIds.map(ownerName)}
            max={3}
          />
        }
        rowProps={{ 'data-item': meeting.id }}
      />
    </ActionRow>
  );
});

export const ThreadRow = memo(function ThreadRow({
  thread,
  href,
  selected,
}: {
  thread: Thread;
  href: string;
  selected?: boolean;
}) {
  const actionsFor = useItemActions();
  const last = thread.messages[thread.messages.length - 1];
  return (
    <ActionRow
      label={thread.title}
      actions={actionsFor('thread', thread, href)}
      preview={<ThreadPreview thread={thread} />}
      onOpen={() => navigate(href)}
    >
      <ListRowContent
        href={href}
        selected={selected}
        leading={<TintIcon icon={MessageCircle} tint={THREAD_TINT} />}
        title={thread.title}
        subtitle={last ? last.text.replace(/\[\d+\]/g, '') : undefined}
        detail={<span className="text-subhead">{relativeTime(thread.updatedAt)}</span>}
        chevron={false}
        rowProps={{ 'data-item': thread.id }}
      />
    </ActionRow>
  );
});

/** Skeleton rows matching DocRow / MeetingRow / ThreadRow, so nothing shifts on load. */
export function RowsSkeleton({ rows = 4, round = false }: { rows?: number; round?: boolean }) {
  return (
    <ul className="overflow-hidden rounded-card bg-card">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="list-row">
          <div className="flex items-stretch pl-4">
            <span className="flex items-center py-2 pr-3">
              <Skeleton className={cn('size-9', round ? 'rounded-full' : 'rounded-[9px]')} />
            </span>
            <span className="row-main flex min-h-[64px] flex-1 flex-col justify-center gap-2 py-[11px] pr-4">
              <Skeleton className="h-4" style={{ width: `${[72, 58, 66, 49, 61][i % 5]}%` }} />
              <Skeleton className="h-3" style={{ width: `${[40, 46, 34, 42, 38][i % 5]}%` }} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
