'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call, isSignedOut, setCsrfToken, type Me, type Schemas } from './client';

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
function retryable(count: number, error: unknown): boolean {
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
  return useQuery({
    queryKey: apiKeys.me,
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: retryable,
  });
}

export function useSignInMethods() {
  return useQuery({
    queryKey: apiKeys.methods,
    queryFn: () => call(api.GET('/api/v1/sign-in-methods')),
    staleTime: 5 * 60_000,
    retry: retryable,
  });
}

export function useWorkspaces(enabled = true) {
  return useQuery({
    queryKey: apiKeys.workspaces,
    queryFn: () => call(api.GET('/api/v1/workspaces')),
    enabled,
    retry: retryable,
  });
}

/** Everything that depends on who is signed in or which workspace is active. */
export function resetSessionData(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ['api'] });
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
  return useQuery({
    queryKey: apiKeys.invite(id),
    queryFn: () => call(api.GET('/api/v1/invites/{id}', { params: { path: { id } } })),
    retry: retryable,
  });
}

export function useAcceptInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.POST('/api/v1/invites/{id}/accept', { params: { path: { id } } })),
    onSuccess: () => resetSessionData(client),
  });
}
