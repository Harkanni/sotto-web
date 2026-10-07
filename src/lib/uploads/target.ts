'use client';

/**
 * Where a new file goes: into the collection on screen when you add it (inside Docs →
 * Product, uploads land in Product), otherwise unfiled. Read from the URL at the moment of
 * adding, so it follows the active tab's stack, wherever the + was pressed.
 */
export function currentCollectionId(
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): string | null {
  const match = /\/collection\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}
