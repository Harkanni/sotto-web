'use client';

import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Soft two-stop gradients, picked by name so a person always gets the same one.
const GRADIENTS = [
  'from-[#8e8cf0] to-[#5856d6]',
  'from-[#7ac4ff] to-[#2f7fe0]',
  'from-[#6fdc8c] to-[#2a9d4b]',
  'from-[#ffb366] to-[#e5700b]',
  'from-[#ff8a9a] to-[#e0405a]',
  'from-[#b9b9c0] to-[#7c7c85]',
  'from-[#6fd3e0] to-[#1f97ab]',
  'from-[#d59cf0] to-[#9a4ac4]',
];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}

const SIZES = {
  24: 'size-6 text-[12px]',
  32: 'size-8 text-[13px]',
  40: 'size-10 text-[15px]',
  64: 'size-16 text-[24px]',
};

/** A person: photo when there is one, otherwise initials on a gradient. */
export function Avatar({
  name,
  src,
  size = 32,
  className,
  single = false,
}: {
  name: string;
  src?: string;
  size?: keyof typeof SIZES;
  className?: string;
  /** One initial: for small overlapping stacks, where two would be cut off. */
  single?: boolean;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden rounded-full select-none',
        SIZES[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        aria-hidden
        className={cn(
          'grid size-full place-items-center bg-linear-to-b font-semibold tracking-[0.02em] text-white',
          GRADIENTS[hash(name) % GRADIENTS.length],
        )}
      >
        {single ? initialsOf(name).slice(0, 1) : initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/** Overlapping avatars for a meeting's participants, with "+3" past `max`. */
export function AvatarStack({
  names,
  max = 3,
  size = 24,
  className,
}: {
  names: string[];
  max?: number;
  size?: 24 | 32;
  className?: string;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className={cn('flex items-center', className)} aria-label={names.join(', ')} role="img">
      {shown.map((name, i) => (
        <Avatar
          key={name}
          name={name}
          size={size}
          single={size === 24}
          className={cn('ring-2 ring-card', i > 0 && (size === 24 ? '-ml-1.5' : '-ml-2'))}
        />
      ))}
      {rest > 0 && (
        <span
          aria-hidden
          className={cn(
            'grid place-items-center rounded-full bg-fill-strong font-semibold text-muted-foreground ring-2 ring-card',
            size === 24 ? '-ml-1.5 size-6 text-[12px]' : '-ml-2 size-8 text-[12px]',
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
