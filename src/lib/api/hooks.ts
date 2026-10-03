'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  ApiError,
  OfflineError,
  api,
  call,
  isSignedOut,
  setCsrfToken,
  type Me,
  type Schemas,
} from './client';
import { useHydrationSafe } from './hydration';

/**
 * TanStack Query hooks over the real API. Keys under a workspace include its id, so switching
 * workspaces never shows the last one's data for a frame.
 */
export const apiKeys = {
  me: ['api', 'me'] as const,
  methods: ['api', 'sign-in-methods'] as const,
  workspaces: ['api', 'workspaces'] as const,
  invite: (id: string) => ['api', 'invite', id] as const,
  workspace: (workspaceId: string) => ['api', 'w', workspaceId] as const,
  members: (workspaceId: string) => ['api', 'w', workspaceId, 'members'] as const,
  collections: (workspaceId: string) => ['api', 'w', workspaceId, 'collections'] as const,
  permissions: (workspaceId: string, id: string) =>
    ['api', 'w', workspaceId, 'collections', id, 'permissions'] as const,
  audit: (workspaceId: string, filters: object) =>
    ['api', 'w', workspaceId, 'audit', filters] as const,
};

/** Doesn't retry what retrying can't fix: being signed out or refused. */
function retryable(count: number, error: Error): boolean {
  if (isSignedOut(error)) return false;
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return count < 1;
}

export async function fetchMe(): Promise<Me> {
  const me = await call(api.GET('/api/v1/me'));
  setCsrfToken(me.csrfToken);
  return me;
}

/** The signed-in person and their active workspace. The session gate keeps this loaded. */
export function useMe() {
  return useHydrationSafe(
    useQuery({
      queryKey: apiKeys.me,
      queryFn: fetchMe,
      staleTime: 60_000,
      retry: retryable,
    }),
  );
}

export function useSignInMethods() {
  return useHydrationSafe(
    useQuery({
      queryKey: apiKeys.methods,
      queryFn: () => call(api.GET('/api/v1/sign-in-methods')),
      staleTime: 5 * 60_000,
      retry: retryable,
    }),
  );
}

export function useWorkspaces(enabled = true) {
  return useHydrationSafe(
    useQuery({
      queryKey: apiKeys.workspaces,
      queryFn: () => call(api.GET('/api/v1/workspaces')),
      enabled,
      retry: retryable,
    }),
  );
}

/**
 * Everything that depends on who is signed in or which workspace is active, including the
 * labelled sample layer, whose visibility follows the workspace's collections.
 */
export function resetSessionData(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['api'] }),
    client.invalidateQueries({ queryKey: ['sample'] }),
  ]);
}

export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['UpdateMe']) => call(api.PATCH('/api/v1/me', { body })),
    onSuccess: (me) => {
      setCsrfToken(me.csrfToken);
      client.setQueryData(apiKeys.me, me);
    },
  });
}

export function useCreateWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => call(api.POST('/api/v1/workspaces', { body: { name } })),
    onSuccess: () => resetSessionData(client),
  });
}

export function useActivateWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.POST('/api/v1/workspaces/{id}/activate', { params: { path: { id } } })),
    onSuccess: () => resetSessionData(client),
  });
}

export function useLoadSampleContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.POST('/api/v1/onboarding/sample-content')),
    onSuccess: () => resetSessionData(client),
  });
}

export function useInvitePreview(id: string) {
  return useHydrationSafe(
    useQuery({
      queryKey: apiKeys.invite(id),
      queryFn: () => call(api.GET('/api/v1/invites/{id}', { params: { path: { id } } })),
      retry: retryable,
    }),
  );
}

export function useAcceptInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.POST('/api/v1/invites/{id}/accept', { params: { path: { id } } })),
    onSuccess: () => resetSessionData(client),
  });
}

// ── The active workspace ──────────────────────────────────────────────────────────────

/** The active workspace from /me (name, your role, sample content), or null while loading. */
export function useActiveWorkspace(): Me['workspace'] {
  return useMe().data?.workspace ?? null;
}

export function useRenameWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => call(api.PATCH('/api/v1/workspace', { body: { name } })),
    onSuccess: (workspace) => {
      client.setQueryData<Me>(apiKeys.me, (me) =>
        me?.workspace ? { ...me, workspace: { ...me.workspace, name: workspace.name } } : me,
      );
      void client.invalidateQueries({ queryKey: apiKeys.workspaces });
    },
  });
}

// ── Members and invites (admins and owners) ───────────────────────────────────────────

export function useMembers(enabled = true) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: apiKeys.members(workspace?.id ?? ''),
      queryFn: () => call(api.GET('/api/v1/members')),
      enabled: enabled && Boolean(workspace),
      retry: retryable,
    }),
  );
}

/** After a change to people: the list, the counts on the workspace switcher, the audit log. */
function afterPeopleChange(client: QueryClient, workspaceId: string | undefined) {
  if (!workspaceId) return;
  void client.invalidateQueries({ queryKey: apiKeys.members(workspaceId) });
  void client.invalidateQueries({ queryKey: apiKeys.workspaces });
  void client.invalidateQueries({ queryKey: ['api', 'w', workspaceId, 'audit'] });
}

export function useChangeRole() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Schemas['Role'] }) =>
      call(api.PATCH('/api/v1/members/{id}', { params: { path: { id } }, body: { role } })),
    onSuccess: (member) => {
      afterPeopleChange(client, workspace?.id);
      // Your own role changed: what the app offers you changes with it.
      if (member.you) void client.invalidateQueries({ queryKey: apiKeys.me });
    },
  });
}

export function useRemoveMember() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/members/{id}', { params: { path: { id } } })),
    onSuccess: () => afterPeopleChange(client, workspace?.id),
  });
}

export function useSendInvite() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (body: Schemas['CreateInvite']) => call(api.POST('/api/v1/invites', { body })),
    onSuccess: () => afterPeopleChange(client, workspace?.id),
  });
}

export function useRevokeInvite() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/invites/{id}', { params: { path: { id } } })),
    onSuccess: () => afterPeopleChange(client, workspace?.id),
  });
}

/** The link an invite email carries, for copying by hand. */
export function inviteLink(id: string): string {
  return `${window.location.origin}/invite/${encodeURIComponent(id)}`;
}

// ── Collections and access ────────────────────────────────────────────────────────────

export type Collection = Schemas['Collection'];

export function fetchCollections() {
  return call(api.GET('/api/v1/collections'));
}

/** The collections you can see, with what you can do in each (filtered by the API, in SQL). */
export function useWorkspaceCollections() {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: apiKeys.collections(workspace?.id ?? ''),
      queryFn: fetchCollections,
      enabled: Boolean(workspace),
      retry: retryable,
    }),
  );
}

/** One collection from the list (the API has no single-collection read; the list is small). */
export function useWorkspaceCollection(id: string) {
  const list = useWorkspaceCollections();
  return { ...list, collection: list.data?.find((c) => c.id === id) ?? null };
}

/** Collections decide what the sample layer shows, so a change refreshes both. */
function afterCollectionChange(client: QueryClient, workspaceId: string | undefined) {
  if (!workspaceId) return;
  void client.invalidateQueries({ queryKey: apiKeys.collections(workspaceId) });
  void client.invalidateQueries({ queryKey: ['sample'] });
  void client.invalidateQueries({ queryKey: ['api', 'w', workspaceId, 'audit'] });
}

export function useCreateCollection() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (body: Schemas['CreateCollection']) =>
      call(api.POST('/api/v1/collections', { body })),
    onSuccess: () => afterCollectionChange(client, workspace?.id),
  });
}

export function useRenameCollection() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      call(api.PATCH('/api/v1/collections/{id}', { params: { path: { id } }, body: { name } })),
    onSuccess: () => afterCollectionChange(client, workspace?.id),
  });
}

export function useDeleteCollection() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/collections/{id}', { params: { path: { id } } })),
    onSettled: () => afterCollectionChange(client, workspace?.id),
  });
}

export function usePermissions(id: string, enabled = true) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: apiKeys.permissions(workspace?.id ?? '', id),
      queryFn: () =>
        call(api.GET('/api/v1/collections/{id}/permissions', { params: { path: { id } } })),
      enabled: enabled && Boolean(workspace),
      retry: retryable,
    }),
  );
}

export function useSetPermissions() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Schemas['PutPermissions'] }) =>
      call(api.PUT('/api/v1/collections/{id}/permissions', { params: { path: { id } }, body })),
    onSuccess: (permissions, { id }) => {
      if (workspace) client.setQueryData(apiKeys.permissions(workspace.id, id), permissions);
      afterCollectionChange(client, workspace?.id);
    },
  });
}

// ── Audit log (admins and owners) ─────────────────────────────────────────────────────

export type AuditFilters = { from?: string; actor?: string; action?: string };
export type AuditEntry = Schemas['AuditEntry'];

export function useAuditLog(filters: AuditFilters) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useInfiniteQuery({
      queryKey: apiKeys.audit(workspace?.id ?? '', filters),
      queryFn: ({ pageParam }) =>
        call(
          api.GET('/api/v1/audit', {
            params: { query: { ...filters, cursor: pageParam ?? undefined, limit: 50 } },
          }),
        ),
      initialPageParam: null as string | null,
      getNextPageParam: (page) => page.nextCursor,
      enabled: Boolean(workspace),
      retry: retryable,
      // Changing a filter keeps the last results on screen until the new ones arrive.
      placeholderData: keepPreviousData,
    }),
  );
}

/**
 * Downloads the filtered audit log as CSV. A plain fetch (not the typed client) because the
 * body is a file, saved through a temporary link so the browser's own download UI handles it.
 */
export async function downloadAuditCsv(filters: AuditFilters): Promise<void> {
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  let response: Response;
  try {
    response = await fetch(`/api/v1/audit.csv?${query}`, {
      credentials: 'same-origin',
      headers: { accept: 'text/csv' },
    });
  } catch {
    throw new OfflineError();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string; requestId?: string };
    } | null;
    throw new ApiError(
      body?.error?.message ?? 'The audit log couldn’t be downloaded. Try again.',
      response.status,
      body?.error?.code ?? 'ERROR',
      body?.error?.requestId,
    );
  }
  const name =
    /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
    `sotto-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start reading the file before it's released.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
