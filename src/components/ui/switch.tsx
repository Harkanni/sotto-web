'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * iOS-style switch, 51 × 31, indigo when on (5.65:1 against the card, where the system green
 * would fail the 3:1 the on-state needs). The thumb stretches while pressed and springs across.
 * Its hit area is the full 44 px row height.
 */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'group/switch relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-0.5',
        'bg-fill-strong transition-colors duration-200 data-[state=checked]:bg-primary',
        'disabled:opacity-40',
        // A 44 px tall target.
        'before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[""]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_3px_1px_rgb(0_0_0/0.06)]',
          'transition-[transform,width] duration-[var(--duration-standard)] ease-standard',
          'data-[state=checked]:translate-x-5',
          // Pressed: the thumb widens towards the middle, like iOS.
          'group-active/switch:w-[33px] group-active/switch:data-[state=checked]:translate-x-3.5',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
