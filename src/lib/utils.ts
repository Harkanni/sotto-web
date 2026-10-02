import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge has to know Sotto's scale names; otherwise it reads `text-body` as a colour
// and drops it when merged with `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'large-title',
        'title-1',
        'title-2',
        'title-3',
        'headline',
        'body',
        'callout',
        'subhead',
        'footnote',
        'caption',
      ],
      radius: ['xs', 'sm', 'button', 'input', 'card', 'menu', 'sheet'],
      shadow: ['fab', 'menu', 'sheet', 'card'],
      ease: ['standard', 'snappy', 'push'],
      animate: ['shimmer'],
    },
  },
});

/** Joins class names and resolves Tailwind conflicts (the last one wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
