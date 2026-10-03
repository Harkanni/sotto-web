'use client';

import { useTheme } from 'next-themes';
import { createPortal } from 'react-dom';
import { Toaster as Sonner, toast } from 'sonner';
import { useIsClient } from '@/lib/prefs/stored';

/**
 * Toasts in thumb reach above the tab bar (and the + button), translucent like the bars. Delete
 * shows one with Undo instead of asking first (brief §9). Swipe down or sideways to dismiss.
 *
 * Portalled to <body> beside sheets and menus: inside the app shell (position: fixed, its own
 * stacking context) a toast could never rise above an open sheet. Client-only, since no toast
 * exists before hydration.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  const client = useIsClient();
  if (!client) return null;
  return createPortal(
    <Sonner
      // Without an explicit direction Sonner reads computed styles on every render, which
      // forces a full style recalculation in the middle of a navigation.
      dir="ltr"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-center"
      offset={{ bottom: 24 }}
      mobileOffset={{
        bottom: 'calc(var(--tabbar-space) + var(--strip-space) + 84px)',
        left: 12,
        right: 12,
      }}
      gap={8}
      visibleToasts={3}
      duration={5000}
      swipeDirections={['bottom', 'left', 'right']}
      containerAriaLabel="Notifications"
      // The documented stacking order (UI_DESIGN_SYSTEM §6): above sheets, under the palette.
      style={{ zIndex: 'var(--z-toast)' }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'material-thick surface-elevated flex w-full max-w-[420px] items-center gap-3 rounded-menu py-2 pr-2 pl-4 text-foreground shadow-menu select-none',
          content: 'min-w-0 flex-1 py-1.5',
          title: 'text-callout font-medium',
          description: 'text-subhead text-muted-foreground',
          icon: 'shrink-0 [&_svg]:size-5',
          actionButton:
            'h-11 shrink-0 rounded-button px-3 text-callout font-semibold text-primary-text hover:bg-primary-tint active:bg-primary-tint-strong',
          cancelButton: 'h-11 shrink-0 rounded-button px-3 text-callout text-muted-foreground',
        },
      }}
    />,
    document.body,
  );
}

/** "Deleted “Q4 roadmap memo”" with an Undo that puts it back. */
export function toastWithUndo(message: string, onUndo: () => void) {
  toast(message, {
    action: { label: 'Undo', onClick: onUndo },
  });
}

/** For Phase 2's labelled mocks: says what will happen, and when it arrives. */
export function toastPreview(message: string, description: string) {
  toast(message, { description });
}
