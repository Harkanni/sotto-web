'use client';

import { AlertCircle, AudioLines } from 'lucide-react';
import { memo } from 'react';
import { SensitivityBadge } from '@/components/ui/badge';
import { ListRowContent } from '@/components/ui/list';
import { ActionRow } from '@/components/ui/row-actions';
import type { FileItem } from '@/lib/api/files';
import { duration, fileSize, relativeTime, whenInGroup } from '@/lib/format';
import { failureText, overallOf, stepLabel } from '@/lib/files/status';
import { navigate } from '@/lib/nav/store';
import { cn } from '@/lib/utils';
import { useFileActions } from './file-actions';
import { DOC_KINDS, MEETING_TINT } from './rows';

/** What a document is, from its type: PDF, Word, Markdown or text. */
export function documentKind(file: Pick<FileItem, 'mime'>): {
  key: keyof typeof DOC_KINDS;
  label: string;
} {
  if (file.mime === 'application/pdf') return { key: 'pdf', label: 'PDF' };
  if (file.mime.includes('wordprocessingml')) return { key: 'memo', label: 'Word document' };
  if (file.mime === 'text/markdown') return { key: 'note', label: 'Markdown' };
  return { key: 'note', label: 'Text' };
}

export function FileIcon({
  file,
  size = 36,
}: {
  file: Pick<FileItem, 'mime' | 'kind'>;
  size?: 36 | 44;
}) {
  if (file.kind === 'audio') {
    return (
      <span
        aria-hidden
        className={cn(
          'grid shrink-0 place-items-center rounded-full',
          MEETING_TINT,
          size === 44 ? 'size-11' : 'size-9',
        )}
      >
        <AudioLines className={size === 44 ? 'size-6' : 'size-5'} strokeWidth={1.9} />
      </span>
    );
  }
  const { icon: Icon, tint } = DOC_KINDS[documentKind(file).key];
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

const time = (iso: string) => new Date(iso).getTime();

/** "Transcribing, 42%" with a bar that slides; or why it failed; or nothing once it's Ready. */
export function StatusLine({ file }: { file: FileItem }) {
  if (file.status === 'failed') {
    return (
      <span className="flex items-center gap-1.5 text-destructive-text">
        <AlertCircle aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{failureText(file.error)}</span>
      </span>
    );
  }
  const pct = Math.round(overallOf(file) * 100);
  return (
    <span className="flex items-center gap-2">
      <span>
        {stepLabel(file)}
        {file.status === 'transcribing' ? `, ${pct}%` : ''}
      </span>
      <span
        role="progressbar"
        aria-label={`${file.title}: ${stepLabel(file)}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 w-14 overflow-hidden rounded-full bg-fill"
      >
        <span
          className="block h-full rounded-full bg-primary transition-[translate] duration-700 ease-out"
          style={{ translate: `${pct - 100}% 0` }}
        />
      </span>
    </span>
  );
}

function FilePreview({ file }: { file: FileItem }) {
  const meta =
    file.kind === 'audio'
      ? file.durationMs
        ? duration(file.durationMs / 1000)
        : 'Recording'
      : [
          documentKind(file).label,
          file.pageCount ? `${file.pageCount} ${file.pageCount === 1 ? 'page' : 'pages'}` : null,
          fileSize(Math.max(1, Math.round(file.sizeBytes / 1024))),
        ]
          .filter(Boolean)
          .join(', ');
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <FileIcon file={file} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline">{file.title}</p>
          <p className="text-subhead text-muted-foreground">
            {file.owner?.name ?? 'Someone'}, {relativeTime(time(file.updatedAt))}
          </p>
        </div>
      </div>
      <p className="text-callout text-muted-foreground">
        {file.status === 'ready' ? meta : <StatusLine file={file} />}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SensitivityBadge level={file.sensitivity} />
        {file.collection && (
          <span className="text-footnote text-muted-foreground">in {file.collection.name}</span>
        )}
        {file.tags.map((t) => (
          <span
            key={t}
            className="rounded-full bg-fill px-2 py-0.5 text-footnote text-muted-foreground"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A document in a list: kind, title, when and who, its label; progress while it's processed. */
export const FileRow = memo(function FileRow({
  file,
  href,
  selected,
}: {
  file: FileItem;
  href: string;
  selected?: boolean;
}) {
  const actionsFor = useFileActions();
  const ready = file.status === 'ready';
  return (
    <ActionRow
      label={file.title}
      actions={actionsFor(file, href)}
      preview={<FilePreview file={file} />}
      onOpen={() => navigate(href)}
    >
      <ListRowContent
        href={href}
        selected={selected}
        leading={<FileIcon file={file} />}
        title={file.title}
        subtitle={
          ready ? (
            `${relativeTime(time(file.updatedAt))}, ${file.owner?.name ?? 'Someone'}`
          ) : (
            <StatusLine file={file} />
          )
        }
        trailing={
          file.sensitivity !== 'internal' ? (
            <SensitivityBadge level={file.sensitivity} />
          ) : undefined
        }
        rowProps={{ 'data-item': file.id, 'data-status': file.status }}
      />
    </ActionRow>
  );
});

/** A recording in Meetings: time and length when Ready, its progress until then. */
export const RecordingRow = memo(function RecordingRow({
  file,
  href,
  selected,
}: {
  file: FileItem;
  href: string;
  selected?: boolean;
}) {
  const actionsFor = useFileActions();
  const ready = file.status === 'ready';
  return (
    <ActionRow
      label={file.title}
      actions={actionsFor(file, href)}
      preview={<FilePreview file={file} />}
      onOpen={() => navigate(href)}
    >
      <ListRowContent
        href={href}
        selected={selected}
        leading={<FileIcon file={file} />}
        title={file.title}
        subtitle={
          ready ? (
            [
              whenInGroup(time(file.createdAt)),
              file.durationMs ? duration(file.durationMs / 1000) : null,
            ]
              .filter(Boolean)
              .join(', ')
          ) : (
            <StatusLine file={file} />
          )
        }
        trailing={
          file.sensitivity !== 'internal' ? (
            <SensitivityBadge level={file.sensitivity} />
          ) : undefined
        }
        rowProps={{ 'data-item': file.id, 'data-status': file.status }}
      />
    </ActionRow>
  );
});
