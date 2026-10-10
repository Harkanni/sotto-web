'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  NotebookPen,
  RefreshCw,
  Repeat2,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { DropdownMenu } from 'radix-ui';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { useAiModels } from '@/lib/api/ai';
import { createNote, useFeedback, type ChatMessage, type Citation } from '@/lib/api/ask';
import { fileKeys } from '@/lib/api/files';
import { useActiveWorkspace } from '@/lib/api/hooks';
import { pushPath } from '@/lib/nav/routes';
import { navigate } from '@/lib/nav/store';
import { useCanAdd } from '@/lib/uploads/permissions';
import { cn } from '@/lib/utils';
import { placeOf } from './answer';

/** An answer as plain text with its sources listed, for copying and for notes. */
export function answerAsText(message: ChatMessage, markdown = false): string {
  const sources = message.citations
    .filter((c) => c.available)
    .map((c: Citation) => {
      const where = placeOf(c);
      return `${c.n}. ${c.title}${where ? `, ${where}` : ''}`;
    });
  const body = message.content.trim();
  if (!sources.length) return body;
  return `${body}\n\n${markdown ? '## Sources' : 'Sources'}\n${sources.join('\n')}`;
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  pressed,
  busy,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  busy?: boolean;
} & Omit<React.ComponentProps<'button'>, 'onClick'>) {
  return (
    <button
      {...rest}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={onClick}
      className={cn(
        'pressable grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150',
        'hovered:bg-primary-tint pressed:bg-primary-tint-strong disabled:opacity-40',
        pressed ? 'text-primary-text' : 'text-muted-foreground',
      )}
    >
      <Icon
        aria-hidden
        className={cn('size-[19px]', busy && 'motion-safe:animate-[spin_0.8s_linear_infinite]')}
        strokeWidth={1.9}
        fill={pressed && (Icon === ThumbsUp || Icon === ThumbsDown) ? 'currentColor' : 'none'}
        fillOpacity={0.18}
      />
    </button>
  );
}

/**
 * Switch model: the workspace's models in a menu, the one that answered checked; picking one
 * answers again with it. Each says where it runs, so the choice is also a privacy choice.
 */
function SwitchModel({ message, onPick }: { message: ChatMessage; onPick: (ref: string) => void }) {
  const models = useAiModels();
  const list = models.data?.models ?? [];
  if (list.length < 2) {
    return (
      <ActionButton
        icon={Repeat2}
        label="Switch model"
        onClick={() =>
          toast(list.length ? 'This workspace has one model' : 'No model to switch to', {
            description: message.route?.label
              ? `This answer came from ${message.route.label}. Admins add models in AI settings.`
              : 'Admins add models in AI settings.',
          })
        }
      />
    );
  }
  const groups = (['PRIVATE', 'BYOK', 'MANAGED'] as const)
    .map((mode) => ({ mode, items: list.filter((m) => m.mode === mode) }))
    .filter((g) => g.items.length);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <ActionButton icon={Repeat2} label="Switch model" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className={cn(menuContent, 'max-w-[min(340px,calc(100vw-24px))]')}
        >
          <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-footnote text-muted-foreground">
            Answer again with
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={message.model ?? ''} onValueChange={onPick}>
            {groups.map((g, i) => (
              <DropdownMenu.Group key={g.mode}>
                {i > 0 && <DropdownMenu.Separator className="mx-1 my-1 h-px bg-separator" />}
                {g.items.map((m) => (
                  <DropdownMenu.RadioItem
                    key={m.ref}
                    value={m.ref}
                    className={cn(menuItem, 'py-1.5')}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{m.model}</span>
                      <span className="truncate text-footnote text-muted-foreground">
                        {m.routeLabel}
                      </span>
                    </span>
                    <DropdownMenu.ItemIndicator>
                      <Check aria-hidden className="size-5 text-primary-text" strokeWidth={2.25} />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.Group>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The actions under a finished answer (BRIEF §4): copy, answer again, save as note, thumbs up or
 * down, and switch model.
 */
export function AnswerActions({
  message,
  question,
  base,
  onRegenerate,
  regenerating,
}: {
  message: ChatMessage;
  question: string;
  base: string;
  /** Answers again, with another model when one is picked. */
  onRegenerate: (model?: string) => void;
  regenerating: boolean;
}) {
  const feedback = useFeedback();
  const canSave = useCanAdd();
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const value = message.feedback ?? 0;
  const hasText = message.content.trim().length > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answerAsText(message));
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
      toast('Answer copied');
    } catch {
      toast('Couldn’t copy', {
        description: 'Your browser didn’t allow it. Select the text instead.',
      });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const note = await createNote({
        title: question.replace(/[?.!]+$/, '').slice(0, 200) || 'Saved answer',
        body: `${answerAsText(message, true)}\n`,
      });
      void client.invalidateQueries({ queryKey: fileKeys.lists(ws) });
      toast('Saved as a note', {
        description: 'It’s in Docs, and Ask can cite it.',
        action: { label: 'Open', onClick: () => navigate(pushPath(base, 'doc', note.file.id)) },
      });
    } catch (error) {
      toast(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const rate = (next: -1 | 1) => {
    const v = value === next ? 0 : next;
    feedback.mutate({ id: message.id, value: v });
    if (v) toast(v === 1 ? 'Thanks for the feedback' : 'Thanks. That helps make answers better');
  };

  return (
    <div
      role="toolbar"
      aria-label="Answer actions"
      className="-ml-3 flex animate-[fade-in_200ms_var(--ease-out)] items-center"
    >
      {hasText && <ActionButton icon={copied ? Check : Copy} label="Copy answer" onClick={copy} />}
      <ActionButton
        icon={RefreshCw}
        label="Answer again"
        onClick={() => onRegenerate()}
        busy={regenerating}
      />
      {canSave && hasText && (
        <ActionButton icon={NotebookPen} label="Save as note" onClick={save} busy={saving} />
      )}
      {!message.passagesOnly && (
        <>
          <ActionButton
            icon={ThumbsUp}
            label="Helpful"
            pressed={value === 1}
            onClick={() => rate(1)}
          />
          <ActionButton
            icon={ThumbsDown}
            label="Not helpful"
            pressed={value === -1}
            onClick={() => rate(-1)}
          />
        </>
      )}
      <SwitchModel message={message} onPick={(ref) => onRegenerate(ref)} />
    </div>
  );
}

/** Suggested next questions after the latest answer; tapping one asks it. */
export function FollowUps({
  questions,
  onAsk,
}: {
  questions: string[];
  onAsk: (question: string) => void;
}) {
  if (!questions.length) return null;
  return (
    <div className="flex animate-[fade-in_240ms_var(--ease-out)] flex-col gap-2">
      <p className="text-footnote text-muted-foreground">Ask next</p>
      <div className="flex flex-col items-start gap-2">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onAsk(q)}
            className="pressable min-h-11 max-w-full rounded-[18px] bg-card px-4 py-2.5 text-left text-callout text-primary-text shadow-card hovered:bg-primary-tint"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
