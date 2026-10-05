'use client';

import { Ellipsis } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { menuContent, menuItem, type RowAction } from '@/components/ui/row-actions';

/** A detail screen's "…" menu: the same actions as the item's row, destructive ones last. */
export function MoreMenu({ actions }: { actions: RowAction[] }) {
  const safe = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);
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
          {safe.map((a) => (
            <DropdownMenu.Item key={a.id} className={menuItem} onSelect={a.onSelect}>
              <span className="flex-1">{a.label}</span>
              <a.icon aria-hidden className="size-5 text-muted-foreground" />
            </DropdownMenu.Item>
          ))}
          {destructive.length > 0 && safe.length > 0 && (
            <DropdownMenu.Separator className="mx-1 my-1 h-px bg-separator" />
          )}
          {destructive.map((a) => (
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
