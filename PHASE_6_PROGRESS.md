# Phase 6 progress — AI modes, providers and billing

The running record for Phase 6, kept current at every checkpoint. A new session follows the
recovery steps in [`CLAUDE.md`](CLAUDE.md), then continues from **Next steps** below.

| Repo           | Branch             | Pull request                        |
| -------------- | ------------------ | ----------------------------------- |
| sotto-api      | `feat/p6-ai-modes` | sotto-api#7 (draft; merges first)   |
| sotto-web      | `feat/p6-ai-modes` | sotto-web#7 (draft)                 |
| sotto-platform | `docs/p6-status`   | sotto-platform#8 (draft; companion) |

## Project status

- **Current phase:** 6 — AI modes, providers and billing. Phases 0–5 are merged (sotto-api
  `c678d0e`, sotto-web `fa5debb`, sotto-platform `c421969`, all "Merge pull request #… p5").
- **Overall:** in progress.
- **Current milestone:** M5 (metering, plans and quotas).

## Requirements

Sources: `sotto-platform/docs/PLAN.md` (Milestones row 6; Swappable AI providers; Data model →
AI and billing, Providers; API → AI settings, Usage and billing, AI providers), `BRIEF.md` (§3 AI
modes and privacy, §4 Workspace and admin, Billing; Phase 6 prompt), ADR 0002 (swappable
providers), ADR 0004 (Paystack first), ADR 0020 (no silent fallback) and Phase 5's carry-overs
(Switch model, "Switch to Private to include them", a chat model on the demo).

**AI modes (BRIEF §3)**

- Three modes: **Private** (models in Sotto's cluster), **BYOK** (the workspace's own Anthropic,
  OpenAI or Google key, or any OpenAI-compatible endpoint), **Managed** (Sotto's own provider
  accounts, metered against the plan).
- Each workspace allows one or more modes; admins set the default mode and model and the allowed
  models. Admins choose which modes may read Confidential content. Restricted is Private-only,
  in code, whatever the settings say.
- Transcription and embeddings stay in-house whatever the chat mode.
- When an outside model answers, Restricted (and disallowed Confidential) sources are excluded in
  the retrieval SQL and the UI says so, with "Switch to Private to include them" when Private is
  allowed.
- Every answer shows a data-route badge ("Private · Sotto-hosted model", "Claude · your API key",
  "Managed · …").
- No silent fallback: a failing mode is an error, never a quiet switch to another model.

**Keys (BRIEF §3)**

- BYOK keys are envelope-encrypted at rest (a per-key data key wrapped by a master key: AWS KMS
  in production, a local master key in development), write-only in the UI (last 4 characters
  shown), checked with Test connection on save, never logged and never sent to the browser.

**Swappable providers and the catalog (PLAN)**

- One registry; each adapter declares its capabilities and where data goes. Switching models is a
  setting. A model catalog admins pick from (`AiModel`: provider, capability, model id, data
  location, enabled).
- Embeddings switch with no downtime: a re-index builds a new index beside the live one, then
  swaps (`POST /ai/embeddings/reindex`, `GET /ai/embeddings/indexes`).

**Metering and billing (BRIEF §4 Billing; ADR 0004)**

- Plans Free (BYOK plus a small Private quota), Pro (Managed AI), Business (admin policies, audit
  export, more transcription minutes), Enterprise (self-hosted, SSO): placeholder prices and
  limits in one config shared by the app and, later, the pricing page.
- Metering: AI tokens (by route), transcription minutes, storage. Friendly limit and upgrade
  prompts. Usage charts for 7, 30 and 90 days.
- `PaymentProvider` with a Paystack test-mode adapter (Stripe later). Checkout, manage
  subscription, a signature-checked webhook.

**API (PLAN, Phase 6 rows)**

- AI settings: `GET/PUT /ai/policy` · `GET /ai/providers` · `POST /ai/providers` (key
  write-only) · `POST /ai/providers/:id/test` · `DELETE /ai/providers/:id` · `GET /ai/models`
  (Admin+; models Viewer+).
- AI providers: `GET /ai/catalog` · `PUT /ai/catalog/:id` · `POST /ai/embeddings/reindex` ·
  `GET /ai/embeddings/indexes` (Owner, Admin).
- Usage and billing: `GET /usage?range=7d|30d|90d` · `GET /billing` · `POST /billing/checkout` ·
  `POST /billing/portal` · `POST /webhooks/paystack` (signature-checked, no session) (Owner;
  PLAN's `/webhooks/stripe` becomes Paystack per ADR 0004).

**Web (BRIEF §4, §9; Profile → AI settings, Usage and billing)**

- AI settings: modes, default mode and model, keys (add, test, remove), sensitivity rules, the
  model catalog. Plain-language privacy explanation for each mode.
- Ask: Switch model per answer; the hidden-sources notice offers Switch to Private.
- Usage and billing: charts (7/30/90 days), plan and limits, upgrade through Paystack checkout,
  limit prompts where a limit is hit.
- Onboarding: choose an AI mode (BRIEF §4 onboarding; `welcome.tsx` says it joins in Phase 6).

**Done when** switching models is a setting, and Restricted never reaches outside AI (proved by
integration tests on every route), with the UI explaining why — held to `UI_DESIGN_SYSTEM.md` on
iPhone and desktop.

## Plan

How a question picks its model after Phase 6:

```
POST /conversations/:id/messages {content, model?}
api: policy = WorkspaceAiPolicy (defaults: Private allowed + default; Confidential Private-only)
api: choice = model? (must be enabled + its mode allowed) : policy.defaultModel
api: resolve → ChatProvider + data location + route + badge
       PRIVATE  → platform in-cluster chat (AI_PRIVATE_CHAT / AI_ASK_CHAT)
       BYOK     → AiProviderConfig: decrypt key (vault) → adapter (anthropic | openai | google |
                  openai-compatible), THIRD_PARTY
       MANAGED  → platform's own account (AI_MANAGED_*), THIRD_PARTY, quota-checked
api: allowed sensitivities = Restricted only IN_CLUSTER; Confidential if route ∈ confidentialModes
api: retrieval SQL with those sensitivities (unchanged mechanism, ADR 0019) + hidden counts
api: canSend() re-checks every passage before the call (second line of defence)
api: stream → UsageEvent (input/output tokens, route, model) → quota counters
```

| #   | Milestone                                                                                                                                                     | Repo      | State       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| M0  | Recovery; requirements and plan (this log); branches and draft PRs                                                                                            | all       | done        |
| M1  | Schema + migration (AiProviderConfig, WorkspaceAiPolicy, AiModel, UsageEvent, Subscription); key vault (envelope encryption, local master key, KMS interface) | sotto-api | done        |
| M2  | `packages/ai`: Anthropic adapter (native Messages API), OpenAI / Google / any OpenAI-compatible as BYOK; provider catalog with data location; test connection | sotto-api | done        |
| M3  | AI settings API: policy, providers (write-only keys, test, delete), models, catalog; audit; integration tests per role                                        | sotto-api | done        |
| M4  | AI gateway in Ask: per-workspace mode and model, per-answer model (switch/regenerate), Confidential rule, route badges, Restricted proofs on every route      | sotto-api | done        |
| M5  | Metering and plans: shared plans config, UsageEvent (tokens, transcription, storage), quotas with friendly errors, `GET /usage`                               | sotto-api | in progress |
| M6  | Billing: `PaymentProvider`, Paystack test-mode adapter, `GET /billing`, checkout, portal, webhook; embedding re-index endpoints                               | sotto-api | pending     |
| M7  | Web: AI settings (modes, default model, keys sheet with Test connection, sensitivity rules, catalog); onboarding AI mode step                                 | sotto-web | pending     |
| M8  | Web: Switch model on answers, Switch to Private on the hidden notice, route badges for BYOK/Managed                                                           | sotto-web | pending     |
| M9  | Web: Usage and billing (charts, plan, upgrade, limit prompts); stories, unit tests, e2e, axe, smoothness                                                      | sotto-web | pending     |
| M10 | Compose and demo config; ADRs; STATUS; verification in the rendered app (iPhone + desktop, light + dark); PRs ready                                           | all       | pending     |

## Completed work

- **M0:** recovered from `docs/STATUS.md`. Phase 5's three PRs are merged (the `main` heads
  above), so Phase 6 starts from `main`. Read CLAUDE.md (all repos), `UI_DESIGN_SYSTEM.md`, the
  Phase 5 log, PLAN (AI providers, data model, API, milestones), BRIEF §3–4, ADRs 0004 and 0020. Inspected what Phase 6 builds on: `packages/ai` (types, `canSend`/`partitionSources`,
  registry, `askChatFrom`, the OpenAI-compatible adapter), `apps/api/src/ask/ai.service.ts`
  (one platform chat; `allowedFor` returns Internal only for third parties; `routeOf` maps
  THIRD_PARTY to MANAGED), the schema (only `AiRoute` and `EmbeddingIndex` exist from the AI and
  billing group), and on the web the Profile rows "AI settings" and "Usage and billing" (routes
  `ai` and `usage`, both `LaterScreen`) and the Switch model action labelled for Phase 6.

- **M1 (sotto-api `417c6e2`):** migration `20261010100000_ai_modes_and_billing`:
  `AiProviderConfig` (BYOK; `encryptedKey`, `wrappedDek`, `keyWrapper`, `keyLast4`, `baseUrl`,
  `models`, `verifiedAt`, `lastError`), `WorkspaceAiPolicy` (allowed/default modes, default
  model, confidential modes, disabled models; no row = Private only), `UsageEvent`
  (`UsageKind`), `Subscription` (`Plan`, `SubscriptionStatus`; no row = Free), `BillingEvent`
  (webhook idempotency, not a tenant table). CHECKs: a key is stored whole or not at all; usage
  never zero (only storage negative); default and confidential modes must be allowed. Four new
  tenant models in `TENANT_MODELS`. `packages/ai/src/vault.ts`: `KeyVault` + `LocalKeyWrapper`
  (AES-256-GCM, fresh DEK and IV per key, workspace id as AAD, `rewrap` for rotation; refuses to
  store keys with no master key). Settings `AI_KEYS_MASTER`, `AI_KEYS_MASTER_PREVIOUS`.
- **Deviation from PLAN (recorded):** no global `AiModel` table. The catalog is computed from
  the installed adapters, the platform config (Private and Managed models) and the workspace's
  BYOK keys; a workspace's on/off choices live in `WorkspaceAiPolicy.disabledModels`. A global
  table would need a platform-operator UI that doesn't exist, and toggling it from one
  workspace would change every tenant.

- **M2 (sotto-api `9cce338`):** `adapters/anthropic.ts` (Messages API over fetch: system field,
  alternating turns, typed SSE, usage from `message_start` + `message_delta`, stream errors by
  type); `catalog.ts`: `BYOK_PROVIDERS` (anthropic, openai, google via its OpenAI-compatible
  endpoint, any openai-compatible server; all THIRD_PARTY), `byokChatProvider`, `listModels`
  (from the provider's `GET /models`, non-chat models dropped: **no model names hard-coded**),
  `testConnection` (codes: invalid_key, no_access, not_found, rate_limited, provider_error,
  unreachable, timeout, no_models), `checkEndpointUrl` (HTTPS and public addresses only, so an
  admin's base URL can't reach the cluster or cloud metadata; `AI_BYOK_ALLOW_PRIVATE_URLS` for
  dev). Managed settings: `AI_MANAGED_CHAT` (one provider, comma-separated models),
  `AI_MANAGED_KEY`, `AI_MANAGED_BASE_URL` → `managedChatFrom`.

- **M3 (sotto-api `474f394`, `4557219`):** `apps/api/src/ai/`: `models.ts` (references
  `private:`/`managed:`/`byok:`), `ai-settings.service.ts` (policy with defaults; availability per
  mode: Private needs a platform model, BYOK a master key, Managed `AI_MANAGED_CHAT`; catalog;
  usable models and the effective default; `resolve(ref)` opening the key just for the call;
  keys: URL check → Test connection → seal → store; replace keeps the old key if the new one
  fails; remove clears the default and disabled entries naming it), `ai.controller.ts` (the nine
  routes; `readsConfidential`/`readsRestricted` on every model). Audit `ai.policy_changed`,
  `ai.model_toggled`, `ai.key_added`, `ai.key_replaced`, `ai.key_renamed`, `ai.key_removed`
  with sentences in `describe.ts`. A Phase 5 platform chat on a third party (`AI_ASK_CHAT` on a
  hosted API) is listed as Managed, never Private. `openapi.json` regenerated.
  `test/integration/stand-in-llm.ts` (an OpenAI-style provider on localhost that records every
  request) and `ai-settings.spec.ts` (13 tests).

- **M4 (sotto-api `2d5d820`, `4758cfd`):** Ask asks `AskService.chooseChat(viewer, model?)`
  before the stream opens: the picked model (Switch model) or the workspace default, resolved
  by `AiSettingsService.resolve` (an unusable model is a 409 `MODEL_UNAVAILABLE`, never a swap),
  or none → passages only. `sensitivitiesFor(chat, policy)` feeds the retrieval SQL: in-cluster
  reads all; outside reads Internal, plus Confidential where `confidentialModes` has the route;
  Restricted never. `partitionSources` re-checks every passage before the provider call (a slip
  is dropped and logged). `AskBody.model`, `RegenerateBody.model` (optional body).
  `Message.model` now stores the full reference (`private:…`, `byok:…`). New failure codes
  `key_rejected` (401/403) and `provider_limited` (429). `AiService` keeps embeddings only;
  platform chats live in `AiSettingsService.usePlatformChats` (startup and tests).
  **Done-when proofs** (`ask-routes.spec.ts`, 8 tests): two recording stand-ins (Private
  inside, BYOK outside); Restricted text never reaches the outside one — default model, scoped
  to the restricted collection, @-mentioned, switched per question, answered again with
  another model, Confidential allowed for BYOK — while Private reads it; a fully hidden
  question calls no model; a disallowed model is refused before any call; a refused key fails
  with no fallback.

## Work in progress

- M5: metering, plans and quotas.

## Remaining work

M1–M10 above.

## Next steps

1. M5 in sotto-api: `packages/contracts/src/plans.ts` (Free, Pro, Business, Enterprise:
   placeholder monthly NGN amounts in kobo and USD for display, labelled placeholders; limits:
   Private and Managed AI tokens per month, transcription minutes, storage bytes, members; which
   modes each plan allows: Managed needs Pro+). `apps/api/src/billing/usage.service.ts`:
   `record(kind, quantity, route, model)` (fire-and-forget, never content); `periodUsage`;
   `checkQuota(workspaceId, kind)` → 402 `QUOTA_EXCEEDED` with a friendly message naming the
   plan to upgrade to. Record: Ask tokens (after `done`, by route; BYOK is recorded but never
   counted against a quota: the workspace pays its provider), transcription seconds (the worker,
   on `transcribe.completed`), storage (+ on upload complete, − on permanent delete). Quota check
   before Ask (Private/Managed), before upload. `GET /usage?range=7d|30d|90d` (Owner): daily
   series per kind + the period totals against the plan's limits. Integration tests.
2. Local rig: Postgres 16 + pgvector 0.6 installed from Ubuntu's archive (`apt-get install
postgresql-16-pgvector`), `pg_ctlcluster 16 main start`, password `postgres`, databases
   `sotto_shadow` and `sotto_test`.

## Decisions

Recorded as they're taken; the ones a later session must not undo become ADRs (0023 on).

- **One branch per repo** for the phase (`feat/p6-ai-modes`, `docs/p6-status`), like Phases 4–5.
- **Payments:** Paystack test mode (ADR 0004); the webhook is `POST /webhooks/paystack`.
- **Envelope encryption:** each key gets its own random data key (AES-256-GCM); the data key is
  wrapped by a `KeyWrapper`. Development and the demo use a local master key from config; an AWS
  KMS wrapper is the production adapter (Phase 11 creates the key — a paid AWS resource, so the
  owner decides when).
- **Google** is reached through its OpenAI-compatible endpoint, OpenAI through its own API, both
  by the existing OpenAI-compatible adapter declared THIRD_PARTY; Anthropic gets a native adapter
  (its Messages API streams differently). No vendor SDKs, as before.

## Missing specifications and outside dependencies

Identified, not invented around:

1. **Paystack test keys.** The owner creates a Paystack account and adds its test secret key
   (GitHub secret / SSM). Until then billing runs on a labelled stand-in provider ("Test
   checkout · no payment provider").
2. **Managed mode's own account** = STATUS → Open decisions "Demo chat provider key". Until a
   platform key exists, Managed is shown as unavailable, never faked.
3. **Prices.** BRIEF asks for placeholder prices and limits; Paystack charges in NGN (kobo). The
   config holds placeholder amounts, labelled as placeholders, for the owner to set.
4. **Demo master key.** The demo needs `AI_KEYS_MASTER` in SSM (`/sotto/demo/AI_KEYS_MASTER`):
   a Terraform change the owner applies (live infrastructure: ask first).

## Known issues

- This sandbox has Node 22 (the repos ask for 24) and no npm registry; `node_modules` comes from
  CI's `dev-cache` snapshot.

## Tests and checks run

| When               | Check                                                                                                                                                                                                                                                 | Result |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `417c6e2` (M1)     | Fresh database from every migration diffed against the schema: no drift (only the hand-written indexes, as in Phases 4–5)                                                                                                                             | Pass   |
| `4758cfd` (M4)     | `ask-routes.spec` 8 + `ask.spec` 14 (Phase 5, moved to the new seam) + `ai-settings.spec` 13; full api suite 145 pass, 1 fail (`collections.spec` sample content: no S3 here; unrelated); eslint, prettier, typecheck; openapi regenerated            | Pass   |
| `2d5d820` (M4, CI) | `node` job failed on an unused variable in `ask.spec.ts` (fixed in `4758cfd`)                                                                                                                                                                         | Fail   |
| `4557219` (M3)     | `ai-settings.spec.ts` 13 tests on Postgres 16 + pgvector; full api suite 137 pass, 1 fail (`collections.spec` sample content: 503, no S3 in this sandbox; unrelated, CI has storage); eslint, prettier, typecheck; `openapi.json` has the 7 new paths | Pass   |
| `9cce338` (M2)     | `packages/ai` 29 tests (9 new: Anthropic stream/usage/errors, catalog, models, Test connection codes, SSRF guard, Managed settings); api + worker typecheck; eslint                                                                                   | Pass   |
| `417c6e2` (M1)     | `packages/ai` typecheck + 20 tests (6 new vault tests); `packages/db` 17 tests; eslint + prettier on both                                                                                                                                             | Pass   |
