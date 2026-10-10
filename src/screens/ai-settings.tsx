'use client';

import { Cloud, KeyRound, Lock, Plus, RotateCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Screen } from '@/components/shell/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { List, ListRow, RowIcon } from '@/components/ui/list';
import { MenuPicker, type PickerChoice } from '@/components/ui/menu-picker';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { TextField } from '@/components/ui/text-field';
import { AsyncWidget } from '@/components/widgets/async-widget';
import {
  MODE_COPY,
  type AiKey,
  type AiKeys,
  type AiMode,
  type AiModel,
  type AiProviderId,
  type AiSettings,
  useAddAiKey,
  useAiCatalog,
  useAiKeys,
  useAiModels,
  useAiSettings,
  useRemoveAiKey,
  useTestAiKey,
  useToggleModel,
  useUpdateAiKey,
  useUpdateAiPolicy,
} from '@/lib/api/ai';
import { useActiveWorkspace } from '@/lib/api/hooks';
import { relativeTime } from '@/lib/format';
import { atLeast } from '@/lib/roles';
import { RowsSkeleton } from './parts/rows';

const MODES: AiMode[] = ['PRIVATE', 'BYOK', 'MANAGED'];
const OUTSIDE: AiMode[] = ['BYOK', 'MANAGED'];

const MODE_ICON = {
  PRIVATE: <RowIcon icon={ShieldCheck} tint="green" />,
  BYOK: <RowIcon icon={KeyRound} tint="orange" />,
  MANAGED: <RowIcon icon={Cloud} tint="blue" />,
} satisfies Record<AiMode, React.ReactNode>;

/** One short line under each mode; the section footer tells the whole story. */
const MODE_LINE: Record<AiMode, string> = {
  PRIVATE: 'Stays inside Sotto',
  BYOK: 'Your own AI account',
  MANAGED: 'Included in your plan',
};

const UNAVAILABLE: Record<string, string> = {
  no_model: 'No hosted model here yet',
  no_master_key: 'Can’t store keys here yet',
  not_configured: 'Not set up here yet',
};

const PROVIDER_SEGMENTS: { value: AiProviderId; label: string }[] = [
  { value: 'anthropic', label: 'Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Gemini' },
  { value: 'openai-compatible', label: 'Other' },
];

/** Short provider names for row subtitles. */
const PROVIDER_SHORT: Record<AiProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  'openai-compatible': 'Own server',
};

/** Who reads Confidential files, as the subject of a sentence. */
const MODE_NOUN: Record<AiMode, string> = {
  PRIVATE: 'Private models',
  BYOK: 'Models on your keys',
  MANAGED: 'Managed models',
};

const PROVIDER_NAME: Record<AiProviderId, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  google: 'Gemini',
  'openai-compatible': 'Team server',
};

/** Where a failed Test connection left a key, in a few words. */
const KEY_PROBLEM: Record<string, string> = {
  invalid_key: 'Key refused',
  no_access: 'No model access',
  not_found: 'Address not found',
  rate_limited: 'Rate-limited',
  provider_error: 'Provider error',
  unreachable: 'Unreachable',
  timeout: 'Timed out',
  no_models: 'No chat models',
};

function modelChoice(m: AiModel): PickerChoice<string> {
  return { value: m.ref, label: m.model, detail: m.routeLabel };
}

/** Models grouped by mode, for the default-model picker. */
function modelGroups(models: AiModel[]) {
  return MODES.map((mode) => ({
    heading: MODE_COPY[mode].title,
    choices: models.filter((m) => m.mode === mode).map(modelChoice),
  })).filter((g) => g.choices.length > 0);
}

// ── Where questions are answered ───────────────────────────────────────────────────────

function ModesSection({ settings }: { settings: AiSettings }) {
  const update = useUpdateAiPolicy();
  const { policy } = settings;

  const toggle = (mode: AiMode, on: boolean) => {
    if (!on && policy.allowedModes.length === 1) {
      // The switch stays on (it's controlled): questions need somewhere to go.
      toast('Keep at least one way to answer questions', {
        description: 'Turn another mode on first.',
      });
      return;
    }
    const allowedModes = on
      ? MODES.filter((m) => m === mode || policy.allowedModes.includes(m))
      : policy.allowedModes.filter((m) => m !== mode);
    // Turning off the default mode hands the default to the first mode still on.
    const moveDefault = !on && policy.defaultMode === mode;
    update.mutate(
      {
        allowedModes,
        confidentialModes: policy.confidentialModes.filter((m) => allowedModes.includes(m)),
        ...(moveDefault ? { defaultMode: allowedModes[0]!, defaultModel: null } : {}),
      },
      {
        onSuccess: () => toast(`${MODE_COPY[mode].title} ${on ? 'turned on' : 'turned off'}`),
        onError: (e) => toast(messageOf(e)),
      },
    );
  };

  return (
    <List
      header="Where questions are answered"
      footer="Only the passages a question needs ever reach an outside AI; whole files never do, and transcription and search stay in Sotto. Every answer says where it was made."
    >
      {settings.modes.map(({ mode, availability }) => {
        const on = policy.allowedModes.includes(mode);
        const reason = availability.available
          ? null
          : (UNAVAILABLE[availability.reason ?? ''] ?? 'Not available');
        return (
          <ListRow
            key={mode}
            leading={MODE_ICON[mode]}
            title={MODE_COPY[mode].title}
            subtitle={reason && !on ? reason : MODE_LINE[mode]}
            trailing={
              <Switch
                aria-label={`Allow ${MODE_COPY[mode].title}`}
                checked={on}
                disabled={!on && !availability.available && mode !== 'PRIVATE'}
                onCheckedChange={(next) => toggle(mode, next)}
              />
            }
          />
        );
      })}
    </List>
  );
}

function DefaultSection({ settings }: { settings: AiSettings }) {
  const update = useUpdateAiPolicy();
  const models = useAiModels();
  const usable = models.data?.models ?? [];
  const current = usable.find((m) => m.ref === settings.effectiveDefault);
  return (
    <List
      header="Default"
      footer={
        current
          ? 'Ask uses this unless someone picks another model for a question.'
          : 'With no model to use, Ask answers with the passages that match, labelled as such.'
      }
    >
      <ListRow
        leading={<RowIcon icon={Sparkles} tint="purple" />}
        title="Default model"
        trailing={
          models.isPending ? (
            <Spinner size={18} className="text-muted-foreground" />
          ) : usable.length === 0 ? (
            <span className="text-body text-muted-foreground">Passages only</span>
          ) : (
            <MenuPicker
              label="Default model"
              value={settings.effectiveDefault}
              groups={modelGroups(usable)}
              className="max-w-[55vw] md:max-w-[240px]"
              onChange={(ref) => {
                const model = usable.find((m) => m.ref === ref);
                if (!model) return;
                update.mutate(
                  { defaultMode: model.mode, defaultModel: ref },
                  {
                    onSuccess: () => toast('Default model changed', { description: model.model }),
                    onError: (e) => toast(messageOf(e)),
                  },
                );
              }}
            />
          )
        }
      />
    </List>
  );
}

function SensitivitySection({ settings }: { settings: AiSettings }) {
  const update = useUpdateAiPolicy();
  const { policy } = settings;
  const outside = OUTSIDE.filter((m) => policy.allowedModes.includes(m));
  return (
    <List
      header="Confidential files"
      footer="Restricted files are only ever read by Private models, whatever is set here. Internal files go to any mode you allow."
    >
      {outside.length === 0 ? (
        <ListRow
          leading={<RowIcon icon={Lock} tint="gray" />}
          title="Stay Private"
          subtitle="Only Private is on, so everything does"
        />
      ) : (
        outside.map((mode) => {
          const on = policy.confidentialModes.includes(mode);
          return (
            <ListRow
              key={mode}
              leading={<RowIcon icon={Lock} tint={on ? 'orange' : 'gray'} />}
              title={`${MODE_NOUN[mode]} read them`}
              subtitle={on ? 'Their passages may go out' : 'Hidden, and answers say so'}
              trailing={
                <Switch
                  aria-label={`${MODE_NOUN[mode]} read Confidential files`}
                  checked={on}
                  onCheckedChange={(next) =>
                    update.mutate(
                      {
                        confidentialModes: next
                          ? [...policy.confidentialModes, mode]
                          : policy.confidentialModes.filter((m) => m !== mode),
                      },
                      {
                        onSuccess: () =>
                          toast(
                            next
                              ? `${MODE_NOUN[mode]} can read Confidential files`
                              : `Confidential files hidden from ${MODE_NOUN[mode].toLowerCase()}`,
                          ),
                        onError: (e) => toast(messageOf(e)),
                      },
                    )
                  }
                />
              }
            />
          );
        })
      )}
    </List>
  );
}

// ── Keys ───────────────────────────────────────────────────────────────────────────────

function keyStatus(key: AiKey): React.ReactNode {
  if (key.lastError) {
    return (
      <span className="text-warning-text">{KEY_PROBLEM[key.lastError] ?? 'Check failed'}</span>
    );
  }
  return key.verifiedAt ? 'Working' : undefined;
}

/** Add a key, or replace one: tested before anything is saved. */
function KeySheet({
  open,
  onOpenChange,
  info,
  replacing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: AiKeys;
  replacing: AiKey | null;
}) {
  const add = useAddAiKey();
  const update = useUpdateAiKey();
  const [provider, setProvider] = useState<AiProviderId>('anthropic');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState<{ field: 'key' | 'url' | 'label'; text: string } | null>(null);
  const meta = info.providers.find((p) => p.id === (replacing?.provider ?? provider));
  const pending = add.isPending || update.isPending;

  const reset = () => {
    setLabel('');
    setApiKey('');
    setBaseUrl('');
    setError(null);
  };

  const fieldOf = (code: string | undefined): 'key' | 'url' | 'label' =>
    code?.startsWith('URL_') || code === 'BASE_URL_REQUIRED' || code === 'KEY_NOT_FOUND'
      ? 'url'
      : 'key';

  const submit = () => {
    const key = apiKey.trim();
    if (meta?.keyRequired && !key) return setError({ field: 'key', text: 'Paste the API key.' });
    if (key && key.length < 8) return setError({ field: 'key', text: 'That key looks too short.' });
    if (replacing) {
      update.mutate(
        { id: replacing.id, apiKey: key },
        {
          onSuccess: (saved) => {
            onOpenChange(false);
            reset();
            toast('Key replaced', { description: `${saved.models.length} models available` });
          },
          onError: (e) => setError({ field: 'key', text: messageOf(e) }),
        },
      );
      return;
    }
    if (meta?.needsBaseUrl && !baseUrl.trim()) {
      return setError({ field: 'url', text: 'Add the server’s address.' });
    }
    add.mutate(
      {
        provider,
        label: label.trim() || `${PROVIDER_NAME[provider]} key`,
        ...(key ? { apiKey: key } : {}),
        ...(meta?.needsBaseUrl ? { baseUrl: baseUrl.trim() } : {}),
      },
      {
        onSuccess: (saved) => {
          onOpenChange(false);
          reset();
          toast('Key saved', {
            description: `${saved.models.length} ${saved.models.length === 1 ? 'model' : 'models'} available`,
          });
        },
        onError: (e) =>
          setError({ field: fieldOf((e as { code?: string }).code), text: messageOf(e) }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
      // Large: the address field comes and goes with the provider, and errors run long.
      detents={['large']}
      title={replacing ? `Replace ${replacing.label}` : 'Add an API key'}
      description="Sotto tests the key first and stores it encrypted. It is never shown again, only its last four characters."
      footer={
        <Button className="w-full" loading={pending} onClick={submit}>
          {replacing ? 'Test and replace' : 'Test and save'}
        </Button>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4 px-[var(--gutter)] pt-1 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!replacing && (
          <SegmentedControl<AiProviderId>
            aria-label="Provider"
            value={provider}
            onValueChange={(p) => {
              setProvider(p);
              setError(null);
            }}
            segments={PROVIDER_SEGMENTS}
          />
        )}
        {!replacing && (
          <TextField
            label="Name"
            placeholder={`${PROVIDER_NAME[provider]} key`}
            autoComplete="off"
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}
        {meta?.needsBaseUrl && !replacing && (
          <TextField
            label="Server address"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://llm.example.com/v1"
            value={baseUrl}
            hint="An OpenAI-compatible server, such as vLLM or LM Studio, reachable over https."
            error={error?.field === 'url' ? error.text : null}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setError(null);
            }}
          />
        )}
        <TextField
          label={meta?.keyRequired === false ? 'API key (optional)' : 'API key'}
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={meta?.keyHint ?? ''}
          value={apiKey}
          error={error && error.field !== 'url' ? error.text : null}
          hint="Only the passages each question needs go to this provider, under its terms."
          onChange={(e) => {
            setApiKey(e.target.value);
            setError(null);
          }}
        />
      </form>
    </Sheet>
  );
}

/** One saved key: test it again, replace it, remove it. */
function KeyDetailSheet({
  apiKey,
  open,
  onOpenChange,
  onReplace,
}: {
  apiKey: AiKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplace: (key: AiKey) => void;
}) {
  const test = useTestAiKey();
  const remove = useRemoveAiKey();
  const nested =
    'surface-elevated overflow-hidden rounded-card bg-card-nested [--surface:var(--card-nested)]';
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={apiKey?.label ?? 'Key'}
      description={
        apiKey ? `${apiKey.providerLabel} · ending ${apiKey.keyLast4 ?? '—'}` : undefined
      }
    >
      {apiKey && (
        <div className="flex flex-col gap-6 pt-1 pb-2">
          <ul className={`${nested} mx-[var(--gutter)]`}>
            <ListRow plain title="Models" detail={String(apiKey.models.length)} />
            <ListRow
              plain
              title="Last checked"
              detail={
                apiKey.lastError
                  ? (KEY_PROBLEM[apiKey.lastError] ?? 'Check failed')
                  : apiKey.verifiedAt
                    ? relativeTime(new Date(apiKey.verifiedAt).getTime())
                    : 'Never'
              }
            />
            {apiKey.baseUrl && <ListRow plain title="Address" detail={apiKey.baseUrl} />}
          </ul>
          <ul className={`${nested} mx-[var(--gutter)]`}>
            <ListRow
              leading={<RowIcon icon={RotateCw} tint="indigo" />}
              title="Test connection"
              trailing={
                test.isPending ? <Spinner size={18} className="text-muted-foreground" /> : undefined
              }
              rowProps={{ 'aria-busy': test.isPending || undefined }}
              onClick={() => {
                if (test.isPending) return;
                test.mutate(apiKey.id, {
                  onSuccess: (k) =>
                    toast('Connection works', {
                      description: `${k.models.length} models available`,
                    }),
                  onError: (e) => toast(messageOf(e)),
                });
              }}
            />
            <ListRow
              leading={<RowIcon icon={KeyRound} tint="orange" />}
              title="Replace key"
              onClick={() => onReplace(apiKey)}
            />
          </ul>
          <ConfirmAction
            surface="sheet"
            label="Remove key"
            confirmLabel={`Remove ${apiKey.label}`}
            note="Its models leave the list at once. Answers it already gave keep their sources."
            loading={remove.isPending}
            onConfirm={() =>
              remove.mutate(apiKey.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  toast('Key removed', { description: apiKey.label });
                },
                onError: (e) => toast(messageOf(e)),
              })
            }
          />
        </div>
      )}
    </Sheet>
  );
}

function KeysSection() {
  const keys = useAiKeys();
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<AiKey | null>(null);
  const [detail, setDetail] = useState<AiKey | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <AsyncWidget
      query={keys}
      label="API keys"
      errorTitle="Couldn’t load the keys"
      isEmpty={() => false}
      empty={{ illustration: 'tasks', title: 'Nothing here yet' }}
      skeleton={
        <div className="px-[var(--gutter)]">
          <RowsSkeleton rows={2} />
        </div>
      }
    >
      {(info) => (
        <>
          <List
            header="Your API keys"
            footer={
              info.canStoreKeys
                ? 'Keys are encrypted at rest and never leave Sotto’s servers, except to call their provider.'
                : 'This server can’t store keys yet: it has no master key. Ask whoever runs Sotto.'
            }
          >
            {info.keys.map((k) => (
              <ListRow
                key={k.id}
                plain
                chevron
                leading={<RowIcon icon={KeyRound} tint="orange" />}
                title={k.label}
                subtitle={
                  k.keyLast4
                    ? `${PROVIDER_SHORT[k.provider]} · ••••${k.keyLast4}`
                    : PROVIDER_SHORT[k.provider]
                }
                detail={keyStatus(k)}
                onClick={() => {
                  setDetail(k);
                  setDetailOpen(true);
                }}
              />
            ))}
            <ListRow
              leading={<RowIcon icon={Plus} tint="indigo" />}
              title="Add a key"
              onClick={info.canStoreKeys ? () => setAdding(true) : undefined}
              rowProps={info.canStoreKeys ? undefined : { 'aria-disabled': 'true' }}
              className={info.canStoreKeys ? undefined : 'opacity-40'}
            />
          </List>
          <KeySheet
            key={replacing?.id ?? 'new'}
            open={adding || replacing !== null}
            onOpenChange={(next) => {
              if (!next) {
                setAdding(false);
                setReplacing(null);
              }
            }}
            info={info}
            replacing={replacing}
          />
          <KeyDetailSheet
            apiKey={info.keys.find((k) => k.id === detail?.id) ?? detail}
            open={detailOpen}
            onOpenChange={setDetailOpen}
            onReplace={(k) => {
              setDetailOpen(false);
              setReplacing(k);
            }}
          />
        </>
      )}
    </AsyncWidget>
  );
}

// ── Models ─────────────────────────────────────────────────────────────────────────────

function ModelsSection({ settings }: { settings: AiSettings }) {
  const catalog = useAiCatalog();
  const toggle = useToggleModel();
  return (
    <AsyncWidget
      query={catalog}
      label="Models"
      errorTitle="Couldn’t load the models"
      isEmpty={(d) => d.models.length === 0}
      empty={{
        illustration: 'chats',
        title: 'No models yet',
        description: 'Add an API key, or ask whoever runs Sotto to add a hosted model.',
      }}
      skeleton={
        <div className="px-[var(--gutter)]">
          <RowsSkeleton rows={3} />
        </div>
      }
    >
      {({ models }) => (
        <List
          header="Models people can choose"
          footer="Turned-off models leave the Switch model menu. The default model stays on."
        >
          {models.map((m) => {
            const isDefault = m.ref === settings.effectiveDefault;
            return (
              <ListRow
                key={m.ref}
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{m.model}</span>
                    {m.isMock && <Badge>Mock</Badge>}
                    {isDefault && <Badge tone="accent">Default</Badge>}
                  </span>
                }
                subtitle={
                  m.allowed
                    ? `${MODE_COPY[m.mode].title} · ${m.keyLabel ?? m.providerLabel}`
                    : `Turn on ${MODE_COPY[m.mode].title} to offer it`
                }
                // Nothing to switch for the default (it stays on) or a mode that's off.
                trailing={
                  isDefault || !m.allowed ? undefined : (
                    <Switch
                      aria-label={`Offer ${m.model}`}
                      checked={m.enabled}
                      onCheckedChange={(enabled) =>
                        toggle.mutate(
                          { ref: m.ref, enabled },
                          { onError: (e) => toast(messageOf(e)) },
                        )
                      }
                    />
                  )
                }
              />
            );
          })}
        </List>
      )}
    </AsyncWidget>
  );
}

// ── Everyone else: where their questions go ────────────────────────────────────────────

function ReadOnlyAi() {
  const models = useAiModels();
  return (
    <AsyncWidget
      query={models}
      label="Models"
      errorTitle="Couldn’t load the models"
      isEmpty={() => false}
      empty={{ illustration: 'tasks', title: 'Nothing here yet' }}
      skeleton={
        <div className="px-[var(--gutter)]">
          <RowsSkeleton rows={2} />
        </div>
      }
    >
      {({ models: usable, defaultRef }) => (
        <List
          header="Where your questions go"
          footer="Admins choose these. Restricted files are only ever read by Private models, and every answer says where it was made."
        >
          {usable.length === 0 ? (
            <ListRow
              plain
              title="Passages only"
              subtitle="No model on this server: Ask shows the matching passages"
            />
          ) : (
            usable.map((m) => (
              <ListRow
                key={m.ref}
                plain
                leading={MODE_ICON[m.mode]}
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{m.model}</span>
                    {m.ref === defaultRef && <Badge tone="accent">Default</Badge>}
                  </span>
                }
                subtitle={m.routeLabel}
              />
            ))
          )}
        </List>
      )}
    </AsyncWidget>
  );
}

/** Profile → AI settings: modes, the default model, Confidential rule, keys and models. */
export function AiSettingsScreen() {
  const workspace = useActiveWorkspace();
  const admin = atLeast(workspace?.role, 'admin');
  const settings = useAiSettings(admin);

  if (workspace && !admin) {
    return (
      <Screen title="AI settings" largeTitle={false}>
        <div className="flex flex-col gap-7 pt-4">
          <ReadOnlyAi />
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="AI settings" largeTitle={false}>
      <div className="flex flex-col gap-7 pt-4 pb-8">
        <AsyncWidget
          query={settings}
          label="AI settings"
          errorTitle="Couldn’t load the AI settings"
          isEmpty={() => false}
          empty={{ illustration: 'tasks', title: 'Nothing here yet' }}
          skeleton={
            <div className="flex flex-col gap-7 px-[var(--gutter)]">
              <RowsSkeleton rows={3} />
              <RowsSkeleton rows={1} />
            </div>
          }
        >
          {(s) => (
            <div className="flex flex-col gap-7">
              <ModesSection settings={s} />
              <DefaultSection settings={s} />
              <SensitivitySection settings={s} />
              <KeysSection />
              <ModelsSection settings={s} />
            </div>
          )}
        </AsyncWidget>
      </div>
    </Screen>
  );
}
