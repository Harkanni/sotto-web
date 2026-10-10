'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call, isSignedOut, type Schemas } from './client';
import { useActiveWorkspace } from './hooks';
import { useHydrationSafe } from './hydration';

export type AiSettings = Schemas['AiSettings'];
export type AiPolicy = Schemas['AiPolicy'];
export type AiMode = Schemas['AiMode'];
export type AiModel = Schemas['AiCatalogEntry'];
export type AiKey = Schemas['AiKey'];
export type AiKeys = Schemas['AiKeys'];
export type AiProviderId = Schemas['AiProviderId'];

/** Keys under the workspace, so switching workspaces never shows the last one's settings. */
export const aiKeys = {
  all: (w: string) => ['api', 'w', w, 'ai'] as const,
  policy: (w: string) => ['api', 'w', w, 'ai', 'policy'] as const,
  models: (w: string) => ['api', 'w', w, 'ai', 'models'] as const,
  catalog: (w: string) => ['api', 'w', w, 'ai', 'catalog'] as const,
  keys: (w: string) => ['api', 'w', w, 'ai', 'keys'] as const,
};

function retryable(count: number, error: Error): boolean {
  if (isSignedOut(error)) return false;
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return count < 1;
}

/** After any AI change: the policy, the models people pick from, the catalog, the audit log. */
function afterAiChange(client: QueryClient, workspaceId: string | undefined) {
  if (!workspaceId) return;
  void client.invalidateQueries({ queryKey: aiKeys.all(workspaceId) });
  void client.invalidateQueries({ queryKey: ['api', 'w', workspaceId, 'audit'] });
}

/** The policy and which modes this server offers (admins and owners). */
export function useAiSettings(enabled = true) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: aiKeys.policy(workspace?.id ?? ''),
      queryFn: () => call(api.GET('/api/v1/ai/policy')),
      enabled: enabled && Boolean(workspace),
      retry: retryable,
    }),
  );
}

/** The models anyone in the workspace may pick in Ask, and the default. */
export function useAiModels(enabled = true) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: aiKeys.models(workspace?.id ?? ''),
      queryFn: () => call(api.GET('/api/v1/ai/models')),
      enabled: enabled && Boolean(workspace),
      staleTime: 60_000,
      retry: retryable,
    }),
  );
}

/** Every model this workspace could use, on or off (admins and owners). */
export function useAiCatalog(enabled = true) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: aiKeys.catalog(workspace?.id ?? ''),
      queryFn: () => call(api.GET('/api/v1/ai/catalog')),
      enabled: enabled && Boolean(workspace),
      retry: retryable,
    }),
  );
}

export function useAiKeys(enabled = true) {
  const workspace = useActiveWorkspace();
  return useHydrationSafe(
    useQuery({
      queryKey: aiKeys.keys(workspace?.id ?? ''),
      queryFn: () => call(api.GET('/api/v1/ai/providers')),
      enabled: enabled && Boolean(workspace),
      retry: retryable,
    }),
  );
}

export function useUpdateAiPolicy() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (body: Schemas['UpdateAiPolicy']) => call(api.PUT('/api/v1/ai/policy', { body })),
    onMutate: async (body) => {
      // Switches answer at once; the server's answer replaces this, or the error undoes it.
      if (!workspace) return undefined;
      const key = aiKeys.policy(workspace.id);
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<AiSettings>(key);
      if (before)
        client.setQueryData<AiSettings>(key, { ...before, policy: { ...before.policy, ...body } });
      return { before };
    },
    onError: (_error, _body, context) => {
      if (workspace && context?.before)
        client.setQueryData(aiKeys.policy(workspace.id), context.before);
    },
    onSuccess: (settings) => {
      if (workspace) client.setQueryData(aiKeys.policy(workspace.id), settings);
    },
    onSettled: () => afterAiChange(client, workspace?.id),
  });
}

export function useToggleModel() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: ({ ref, enabled }: { ref: string; enabled: boolean }) =>
      call(api.PUT('/api/v1/ai/catalog/{ref}', { params: { path: { ref } }, body: { enabled } })),
    onMutate: async ({ ref, enabled }) => {
      if (!workspace) return undefined;
      const key = aiKeys.catalog(workspace.id);
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<Schemas['AiModels']>(key);
      if (before) {
        client.setQueryData<Schemas['AiModels']>(key, {
          ...before,
          models: before.models.map((m) => (m.ref === ref ? { ...m, enabled } : m)),
        });
      }
      return { before };
    },
    onError: (_error, _vars, context) => {
      if (workspace && context?.before)
        client.setQueryData(aiKeys.catalog(workspace.id), context.before);
    },
    onSettled: () => afterAiChange(client, workspace?.id),
  });
}

export function useAddAiKey() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (body: Schemas['AddAiKey']) => call(api.POST('/api/v1/ai/providers', { body })),
    onSuccess: () => afterAiChange(client, workspace?.id),
  });
}

export function useUpdateAiKey() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas['UpdateAiKey'] & { id: string }) =>
      call(api.PATCH('/api/v1/ai/providers/{id}', { params: { path: { id } }, body })),
    onSuccess: () => afterAiChange(client, workspace?.id),
  });
}

export function useTestAiKey() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.POST('/api/v1/ai/providers/{id}/test', { params: { path: { id } } })),
    onSettled: () => afterAiChange(client, workspace?.id),
  });
}

export function useRemoveAiKey() {
  const client = useQueryClient();
  const workspace = useActiveWorkspace();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/ai/providers/{id}', { params: { path: { id } } })),
    onSuccess: () => afterAiChange(client, workspace?.id),
  });
}

/** Plain words for each mode, shown under its row (BRIEF §3: where the data goes). */
export const MODE_COPY: Record<AiMode, { title: string; line: string }> = {
  PRIVATE: {
    title: 'Private',
    line: 'Answered by models running in Sotto’s own cluster. Nothing goes to an outside AI company.',
  },
  BYOK: {
    title: 'Your API key',
    line: 'Answered by your own Anthropic, OpenAI or Google account. Only the passages for each question go to them, under their terms.',
  },
  MANAGED: {
    title: 'Managed',
    line: 'Answered by Sotto’s own account with an AI company, included in your plan. Only the passages for each question go to them.',
  },
};

/** Why a mode can't be turned on here, in plain words. */
export function unavailableReason(reason: string | undefined): string {
  switch (reason) {
    case 'no_model':
      return 'No Sotto-hosted model on this server yet. Ask answers with matching passages.';
    case 'no_master_key':
      return 'This server can’t store API keys yet. Ask whoever runs it to add a master key.';
    case 'not_configured':
      return 'Not set up on this server yet.';
    default:
      return 'Not available on this server.';
  }
}
