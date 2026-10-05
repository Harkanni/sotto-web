'use client';

import { useActiveWorkspace } from '@/lib/api/hooks';
import { atLeast } from '@/lib/roles';

/** Members and up add files; viewers read and ask (ADR 0012). The api checks again. */
export function useCanAdd(): boolean {
  return atLeast(useActiveWorkspace()?.role, 'member');
}
