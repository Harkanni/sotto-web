'use client';

import { Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * iOS search field: a filled, rounded field with a magnifier, a clear button once there's text,
 * and a Cancel button that slides in while it has focus. Text is 17 px, so iOS never zooms.
 */
export function SearchField({
  value,
  onValueChange,
  placeholder = 'Search',
  className,
  'aria-label': ariaLabel,
  onCancel,
  autoFocus,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div role="search" className={cn('flex items-center', className)}>
      <label className="relative flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-input bg-fill pr-1 pl-2 text-muted-foreground">
        <Search aria-hidden className="size-[18px] shrink-0" strokeWidth={2} />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-label={ariaLabel ?? placeholder}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onValueChange('');
              inputRef.current?.blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] leading-[22px] tracking-[var(--tracking-body)] text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              onValueChange('');
              inputRef.current?.focus();
            }}
            className="relative grid size-7 shrink-0 place-items-center rounded-full before:absolute before:-inset-2 before:content-['']"
          >
            <span className="grid size-[17px] place-items-center rounded-full bg-muted-foreground/70 text-card">
              <X aria-hidden className="size-3" strokeWidth={3} />
            </span>
          </button>
        )}
      </label>
      <button
        type="button"
        tabIndex={active ? 0 : -1}
        aria-hidden={!active || undefined}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          onValueChange('');
          inputRef.current?.blur();
          onCancel?.();
        }}
        className={cn(
          'h-11 shrink-0 overflow-hidden pl-3 text-[17px] text-primary-text select-none',
          'transition-[max-width,opacity,translate] duration-[var(--duration-standard)] ease-standard',
          active
            ? 'max-w-24 opacity-100'
            : 'pointer-events-none max-w-0 translate-x-2 pl-0 opacity-0',
        )}
      >
        Cancel
      </button>
    </div>
  );
}
