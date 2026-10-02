'use client';

import { ArrowUp } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChipGroup } from './chips';

export const SCOPES = [
  { value: 'all', label: 'All sources' },
  { value: 'docs', label: 'Documents' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'product', label: 'Product' },
  { value: 'customers', label: 'Customers' },
] as const;

export type Scope = string;

/**
 * Ask's composer (brief §9): scope chips above a growing text field, Send in thumb reach. Text is
 * 17 px so iOS doesn't zoom; Enter sends, Shift+Enter adds a line.
 */
export function Composer({
  onSend,
  scope,
  onScopeChange,
  scopes = SCOPES as unknown as { value: string; label: string }[],
  placeholder = 'Ask about your memos and meetings',
  autoFocus,
  className,
}: {
  onSend: (text: string) => void;
  scope?: string;
  onScopeChange?: (scope: string) => void;
  scopes?: { value: string; label: string }[];
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = text.trim().length > 0;

  // Grow with the text up to six lines, then scroll. An empty field measures its placeholder,
  // so a new placeholder (narrower windows get a shorter one) measures again too.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 22 * 6 + 16)}px`;
  }, [text, placeholder]);

  const send = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
  };

  return (
    <div className={cn('flex flex-col gap-2 pt-2 pb-2', className)}>
      {scope !== undefined && onScopeChange && (
        <ChipGroup
          aria-label="Search in"
          value={scope}
          onValueChange={onScopeChange}
          options={scopes}
        />
      )}
      <form
        className="mx-[var(--gutter)] flex items-end gap-2 rounded-[22px] bg-card py-1 pr-1 pl-4 shadow-[0_0_0_0.5px_var(--separator),0_2px_10px_rgb(0_0_0/0.06)]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          autoFocus={autoFocus}
          enterKeyHint="send"
          aria-label="Question"
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-[148px] min-h-11 flex-1 resize-none bg-transparent py-[11px] text-[17px] leading-[22px] tracking-[var(--tracking-body)] outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          className={cn(
            'pressable mb-[3px] grid size-[38px] shrink-0 place-items-center rounded-full',
            'before:absolute before:-inset-[3px] before:content-[""] relative',
            canSend ? 'bg-primary text-primary-foreground' : 'bg-fill text-faint-foreground',
          )}
        >
          <ArrowUp aria-hidden className="size-5" strokeWidth={2.5} />
        </button>
      </form>
    </div>
  );
}
