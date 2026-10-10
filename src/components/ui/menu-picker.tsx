'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { cn } from '@/lib/utils';

export interface PickerChoice<T extends string> {
  value: T;
  label: string;
  /** A second, quieter line (where a model runs). */
  detail?: string;
}

/**
 * The menu picker (UI_DESIGN_SYSTEM §7): the value in grey with ⇅ at the end of a row, opening
 * a menu of choices with a check on the current one. Choices can be grouped under headings. A
 * single choice is plain text; nothing to pick.
 */
export function MenuPicker<T extends string>({
  label,
  value,
  groups,
  onChange,
  disabled,
  className,
}: {
  /** Names the setting for screen readers ("Default model"). */
  label: string;
  value: T | null;
  /** Choices, optionally under headings. */
  groups: { heading?: string; choices: PickerChoice<T>[] }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const all = groups.flatMap((g) => g.choices);
  const current = all.find((c) => c.value === value);
  const text = current?.label ?? 'None';
  if (all.length <= 1 || disabled) {
    return (
      <span className={cn('min-w-0 shrink truncate text-body text-muted-foreground', className)}>
        {text}
      </span>
    );
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`${label}: ${text}`}
        className={cn(
          '-my-1 -mr-2 flex h-11 min-w-0 shrink items-center gap-1 rounded-button px-2 text-body text-muted-foreground select-none',
          'outline-offset-[-2px] hover:bg-fill-subtle focus-visible:outline-2 focus-visible:outline-ring active:bg-fill data-[state=open]:bg-fill',
          className,
        )}
      >
        <span className="truncate">{text}</span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className={cn(
            menuContent,
            'max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] max-w-[min(340px,calc(100vw-24px))] overflow-y-auto',
          )}
        >
          <DropdownMenu.RadioGroup value={value ?? ''} onValueChange={(v) => onChange(v as T)}>
            {groups.map((group, i) => (
              <DropdownMenu.Group key={group.heading ?? i}>
                {i > 0 && <DropdownMenu.Separator className="mx-1 my-1 h-px bg-separator" />}
                {group.heading && (
                  <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-footnote text-muted-foreground">
                    {group.heading}
                  </DropdownMenu.Label>
                )}
                {group.choices.map((choice) => (
                  <DropdownMenu.RadioItem
                    key={choice.value}
                    value={choice.value}
                    className={cn(menuItem, choice.detail && 'py-1.5')}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{choice.label}</span>
                      {choice.detail && (
                        <span className="truncate text-footnote text-muted-foreground">
                          {choice.detail}
                        </span>
                      )}
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
