# Phase 3 progress — accounts and workspaces

The running record for Phase 3, kept current at every checkpoint. A new session follows the
recovery steps in [`CLAUDE.md`](CLAUDE.md), then continues from **Next steps** below.

| Repo           | Branch             | Pull request                                                                                                          |
| -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| sotto-api      | `feat/p3-accounts` | [Harkanni/sotto-api#3](https://github.com/Harkanni/sotto-api/pull/3) (merges first)                                   |
| sotto-web      | `feat/p3-accounts` | [Harkanni/sotto-web#3](https://github.com/Harkanni/sotto-web/pull/3)                                                  |
| sotto-platform | `docs/p3-status`   | [Harkanni/sotto-platform#3](https://github.com/Harkanni/sotto-platform/pull/3) (companion: STATUS, ADRs, demo config) |

## Project status

- **Current phase:** 3 — accounts and workspaces. Phases 0–2 are merged (sotto-web `4b1d6b3`,
  sotto-platform `16d2a6c`).
- **Overall:** ready for review. Code, tests and docs are done; the `accounts` CI job waits on
  the owner's `terraform apply` and merging sotto-api#3 (see Next steps).
- **Current milestone:** M7 done locally; merging in order (owner).

## Requirements

Sources: `sotto-platform/docs/PLAN.md` (Milestones row 3, Data model, API) and `BRIEF.md` (§4
Workspace and admin, §11 Security baseline, Phase 3 prompt).

- Sign-in with email magic link, passkeys, Google and Microsoft; sign-out.
- Workspaces (Better Auth's organization plugin, renamed Workspace and Membership), invites,
  roles Owner, Admin, Member, Viewer.
- Collection permissions: restricted collections, per-person and per-role access (View, Edit,
  Manage), enforced inside SQL.
- Audit log with filters and CSV export.
- Onboarding: create a workspace → (choose an AI mode: Phase 6) → load sample content or start
  empty → (ask a first question: Phase 5).
- API: `/api/auth/*`, `GET/PATCH /me`, `POST/GET /workspaces`, `POST /workspaces/:id/activate`,
  `PATCH /workspace`, `GET /members`, `PATCH/DELETE /members/:id`, `POST /invites`,
  `DELETE /invites/:id`, `POST /invites/:token/accept`, `GET/POST /collections`,
  `PATCH/DELETE /collections/:id`, `PUT /collections/:id/permissions`, `GET /audit`,
  `GET /audit.csv`, `POST /onboarding/sample-content`.
- Writes need the session cookie plus a CSRF token; the workspace comes from the session, never
  the URL; a tenant-scoped Prisma client adds `workspaceId` to every query; Redis rate limits,
  stricter on auth routes.
- **Done when** E2E covers sign-up → create workspace → invite → role-restricted access, on
  iPhone and desktop, with the UI held to `UI_DESIGN_SYSTEM.md`.

## Milestones

| #   | Milestone                                                                                                                  | Repo      | State |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------- | ----- |
| M0  | Recovery; permanent `CLAUDE.md` (all repos); this log; dependency snapshots for the sandbox                                | all       | done  |
| M1  | Accounts schema + migration; Better Auth at `/api/auth/*`; mailer; session + CSRF guards; tenant client; `/me`; tests      | sotto-api | done  |
| M2  | Workspaces, members, invites, roles; audit entries for each                                                                | sotto-api | done  |
| M3  | Collections + permissions; audit log + CSV; onboarding sample content; `openapi.json`                                      | sotto-api | done  |
| M4  | Typed API client + auth client; session handling and route guard; sign-in (magic link, passkey autofill, Google/Microsoft) | sotto-web | done  |
| M5  | Onboarding (name, workspace, invites, sample content) and invite acceptance                                                | sotto-web | done  |
| M6  | Profile: account, passkeys, workspace + switcher, members and invites, audit log; collections and access sheet in Docs     | sotto-web | done  |
| M7  | E2E for the done-when flow; stories; axe; smoothness; screenshots; demo config; STATUS; ADRs; PRs ready                    | all       | done  |

## Completed work

- Verified the starting point: all three repos clean on `main`, Phase 2 merged, no uncommitted
  work. Nothing from Phase 2 is being rewritten.
- sotto-api `feat/p3-accounts` (`99dc4ac`): Better Auth 1.7.7, the passkey plugin and
  nodemailer added; CI's `sync` job now publishes a `node_modules` snapshot
  (`scripts/agent-deps.sh`), so the sandbox can build and run integration tests.
- sotto-web `feat/p3-accounts` (`633e9ab`): Better Auth client, `openapi-fetch`,
  `openapi-typescript` added.
- `CLAUDE.md` rewritten as the permanent instructions (recovery, architecture, UI rules,
  conventions, tests, git, documentation duties).
- Permanent `CLAUDE.md` in sotto-api (`90917f6`) and sotto-platform (`09a2c44`, draft PR #3 with
  STATUS for Phase 3). M0 done.
- **M1 (sotto-api `3ea2376`, `5659ae3`):** accounts schema + migration; tenant client
  (`forWorkspace`); Better Auth at `/api/auth/*` (magic link over SMTP with hashed tokens,
  passkeys, renamed organization plugin, Google/Microsoft when configured, Redis rate limits,
  organization HTTP routes closed); one global guard (session → workspace/role → CSRF → minimum
  role); `GET/PATCH /me`, `GET /sign-in-methods`; request ids; error format; CI Postgres
  service; README and `.env.example`.
- **M2 (sotto-api `1d257c8`):** `/workspaces`, `/workspace`, `/members`, `/invites` (+ public
  preview and accept), each change audited; removing a member drops their grants and sessions'
  workspace.
- **M3 (sotto-api `274ed84`):** collections (SQL-side visibility, per-person access),
  `GET/PUT /collections/:id/permissions`, `GET /audit` (filters, cursor) + `GET /audit.csv`,
  `POST /onboarding/sample-content`, `tenantTransaction()`. CI green on M1 and M2 (integration
  tests on the pgvector service container, smoke, gitleaks).
- **API follow-up (`8a0d4d0`):** `/me.workspace.sample` names the sample collections' ids.
- **M4 + M5 (sotto-web `43b2bb6`):** typed client (`src/lib/api`, generated from
  `openapi.json`), Better Auth client, `src/proxy.ts` (no session cookie → `/sign-in?next=`),
  session gate, `/sign-in` (email link, passkey autofill + button, providers when enabled,
  "check your email" that continues by itself), `/welcome` (name → workspace or pick one →
  invites → sample or empty), `/invite/:id` (every state). New: TextField, SottoMark,
  mail/team/key illustrations, AuthScreen. Verified in a phone browser end to end against the
  local API + Mailpit (screens reviewed light; flow had no console errors).
- **M6, Profile part (sotto-web `df7b306`):** Profile root on `/me` (account card, workspace rows
  by role, real sign out that clears saved pages and the cache); Account (name, email, passkeys
  add/rename/remove); Workspace (rename for admins, switch, create, sample content for owners;
  switching resets the other tabs to their roots); Members (people, open invites, role sheet,
  remove, resend, copy link, withdraw, invite sheet); Audit log (kind/period/person filters, day
  groups, entry sheet, paging, CSV); sidebar workspace switcher. New: `ConfirmAction`,
  `WorkspaceTile`, `ListRow plain`, `src/lib/roles.ts`, date helpers. Real-API queries read as
  pending during hydration (`useHydrationSafe`), because tabs hydrate in their own `<Activity>`
  after `/me` is cached. Typed client resynced (audit query parameters). Checked in a phone
  browser against the local API: onboarding → Profile, Account, Workspace, Members, Audit.
- **M6, Docs part (sotto-web `4e2ba91`, `fab1243`, `f7a0bbd`):** collections from the API
  (Restricted badge, New collection card and sheet, collection screen with your access and a
  menu by permission: Who has access, Rename, Delete with Undo); the Who has access sheet
  (restricted switch, member/viewer access, people with View/Edit/Manage, add a person,
  mirroring sotto-api's `collectionAccess`). Sample layer scoped to the workspace: nothing
  without sample content, and only documents in collections you can open (`src/lib/sample/
scope.ts`, resolved inside each sample query); Home's notice only then. Stale "sample
  workspace" labels reworded. Storybook seeded with a stand-in account (`src/stories/
fixtures.ts`); new stories. Shell e2e answers `/me`, `/collections`, `/workspaces`.
- **Bugs found and fixed in M6:** (1) accepting an invite always failed with "This page is out
  of date": `/invite/:id` never loads `/me`, so the POST had no CSRF token; the client now
  fetches the token before any write that lacks one (`csrfTokenForWrite`, unit-tested).
  (2) Toasts were hidden behind open sheets (the Toaster lived inside the fixed app shell's
  stacking context); it now portals to `<body>` at `--z-toast`. (3) Tabs hydrating after `/me`
  was cached caused hydration mismatches; queries are pending during their hydration render.
- **Verified in a phone browser against the local API (Mailpit for email):** owner sign-up →
  onboarding with invites + sample; invitee accepts through the emailed link; role change
  (toast over the sheet), invite sheet, remove confirmation, Who has access (grant a viewer by
  name), passkey added with a virtual authenticator then opened, delete with Undo (collection
  kept); the viewer sees the restricted collection only through the grant, read-only, and no
  Members or Audit log. Screenshots iPhone + desktop, light + dark, reviewed.
- **M7 (sotto-web `7798246`, `cda2b09`; sotto-platform `d0655d7`, `369e381`):**
  `e2e/accounts.spec.ts`, the done-when flow (owner signs up by emailed link → workspace with
  sample content → invite → colleague accepts by email → restricted collection hidden and
  unreachable → owner grants it → colleague sees it read-only → audit log), iPhone + desktop,
  axe on Members, Who has access and Audit log. Passes locally against the API in development
  and production mode. CI `accounts` job: the API's image from ECR + Postgres, Redis, Mailpit
  (ADR 0014); start-up failures surface as annotations. Smoothness harness given a stand-in
  session. sotto-platform: ADRs 0009–0015, demo config (AUTH_SECRET and mailbox password in
  SSM, APP_URL, Mailpit at `/mail/` behind basic auth: ADR 0015, proposed), local full stack
  sign-in settings, STATUS with the merge order.
- Sandbox: both `node_modules` snapshots restored; `pnpm -r build` and the 28 existing sotto-api
  tests pass locally (pnpm needs `npm_config_manage_package_manager_versions=false`). Local
  Postgres 16 (+ stub `vector`) and Redis run for integration tests.

## Work in progress

Nothing in progress. Phase 3 waits on the owner (Next steps).

## Remaining work

- The `accounts` CI job hasn't passed in CI yet: ECR has no `sotto/api` repository (it
  answered "repository not found"), and `sotto/api:main` must be the Phase 3 API. Both clear
  with the owner's steps below; locally the spec passes (14/14, twice).
- Screen-level stories (Members, Account, Audit) aren't written: screens need the shell's
  stack context and Account needs a passkeys stand-in. They're covered by the E2E, the manual
  pass and the component stories.
  Follow-ups noted, not in Phase 3's scope: the + button still shows for viewers (its actions are
  Phase 4 previews; hide it for viewers when uploads become real).

## Next steps

1. Owner: review ADR 0015, merge sotto-platform#3, `terraform apply` in `terraform/dev`
   (demo SSM parameters; the missing ECR repositories `sotto/api` and `sotto/worker`).
2. Owner: merge sotto-api#3 (CI green); its `images` workflow publishes `sotto/api:main`.
3. Re-run sotto-web#3's CI; when the `accounts` job is green, the owner merges it.
4. Then Phase 4 (ingestion and meetings) starts from `PLAN.md`: a new `PHASE_4_PROGRESS.md`.
   Carry over: reuse `visibleTo` for files and chunks (ADR 0012), replace the sample layer's
   documents with real files (ADR 0013), hide the + button for viewers once uploads are real.

Supporting endpoints added beyond PLAN's list (recorded for the owner):
`GET /sign-in-methods`, `GET /invites/:id` (preview), `GET /collections/:id/permissions`.

Decisions taken (ADRs 0009–0014 in sotto-platform; 0015 proposed):

- **Better Auth without a Nest bridge.** Its handler is mounted on the Express instance at
  `/api/auth/*`; a small guard calls `auth.api.getSession()`. Avoids depending on a community
  bridge that may lag NestJS 12. The organization plugin's own HTTP routes are disabled: the
  `/api/v1` controllers call `auth.api.*` so every change is audited and CSRF-checked in one
  place.
- **CSRF:** Nest 12's built-in cross-origin protection (`Sec-Fetch-Site`/`Origin`) plus a
  per-session token (an HMAC of the session id) returned by `GET /me` and sent as
  `X-CSRF-Token` on every write.
- **Sign-up is email-first** (magic link) or Google/Microsoft; passkeys are added after sign-in
  and then used to sign in (with browser autofill). No passkey-only accounts: invitations are
  matched to verified email addresses.
- **Roles:** Owner and Admin have Manage on every collection; Members can create collections and
  edit open ones; Viewers only view, whatever a grant says. Restricted collections are visible
  only through a grant (person or role). Admin+ manage members, invites, permissions and read
  the audit log (as PLAN's API table says).
- **Invite statuses** follow Better Auth's stored values (`pending`, `accepted`, `rejected`,
  `canceled`); the API reports `revoked` for canceled and `expired` once past `expiresAt`.
- **Integration tests** use a real Postgres from `TEST_DATABASE_URL` (a service container in
  CI, `pnpm deps:up` locally) rather than Testcontainers.

## Missing specifications and outside dependencies

Identified, not invented around:

1. **Google and Microsoft OAuth credentials.** The owner creates the two OAuth apps (PLAN
   decision 4: steps given once the domain exists). The code supports both and hides the buttons
   until the API has credentials.
2. **Email delivery for the demo.** SES needs a verified domain (`sotto.ai` isn't bought).
   Written up as ADR 0015 (proposed) with the config in sotto-platform#3: Mailpit on the demo
   behind a password; SES once the domain exists. Needs the owner's approval and
   `terraform apply`.
3. **Onboarding steps from later phases.** "Choose an AI mode" needs Phase 6, "upload a file"
   Phase 4 and "ask a first question" Phase 5. Phase 3 onboarding covers workspace, invites and
   sample content; the other steps join when their phases land.
4. **Sample content.** PLAN places `POST /onboarding/sample-content` (fictional files) in Phase 3,
   but files arrive in Phase 4. Phase 3 creates the sample collections as real rows (so
   permissions apply) and records them on the workspace; the fictional documents stay in the
   web's labelled sample layer until Phase 4 makes them real files.
5. **Invite preview.** The accept screen must show the workspace and inviter before accepting;
   PLAN lists only `POST /invites/:token/accept`. Adding `GET /invites/:token` (token holder
   only, no other workspace data).
6. **Installed app (iOS) and email links.** Links open in the browser, which on iOS doesn't
   share cookies with a Home Screen app, so signing in by link inside the installed app lands
   in Safari. Passkeys work inside the app once added. A typed one-time code (Better Auth's
   email OTP) would fix it; that changes PLAN's sign-in method, so it waits for the owner.
7. **Passkeys and the domain.** WebAuthn credentials are bound to the host name. Passkeys made
   on the sslip.io demo won't work after the move to the real domain.
8. **Cross-repo E2E in CI.** Decided (ADR 0014): sotto-web's CI pulls `sotto/api` from ECR
   (no new secret; arm64 runner).

## Known issues

- The sandbox has no Docker daemon and can't reach npm, PyPI or apt. Local Postgres 16 and Redis
  binaries exist; pgvector isn't installed, so local test databases use a stub `vector` extension
  (sandbox only; Phase 3 uses no vectors). CI runs the real `pgvector/pgvector:pg18`.
- From Phase 2: headless screenshots render backdrop blur without blurring text (a software
  rendering quirk); push cost at 4× throttle is 20–45 ms in the tap handler.
- Outside this phase: sotto-api's `images` workflow failed on `main` because the ECR repository
  `sotto/worker` didn't exist (fix: `terraform apply` in `terraform/dev`, then re-run).

## Tests and checks run

| When           | Check                                                                                                                                           | Result |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `5659ae3` (M1) | sotto-api lint, format, typecheck, build; 60 tests (api 32, incl. 9 integration on local Postgres 16)                                           | Pass   |
| `5659ae3` (M1) | Manual: API booted against local Postgres + Mailpit; magic link sent, verified (302 → `/welcome`, 30-day HttpOnly cookie), `/me`, CSRF refusals | Pass   |
| `1d257c8` (M2) | sotto-api lint, format, typecheck, build; api 46 tests (incl. 14 workspace/member/invite integration tests)                                     | Pass   |
| `df7b306` (M6) | sotto-web lint (1 old warning), format, typecheck, unit tests (54)                                                                              | Pass   |
| `df7b306` (M6) | Manual, phone browser vs local API + Mailpit: sign up → onboarding with invites + sample → Profile screens, no console errors                   | Pass   |
| `f7a0bbd` (M6) | sotto-web lint (1 old warning), format, typecheck, unit tests (57), production build                                                            | Pass   |
| `f7a0bbd` (M6) | `pnpm e2e` (iPhone + desktop, axe, 44 px): 21 pass, 6 skipped; 1 flaky in the sandbox only (its build forwards /api to the local API)           | Pass   |
| `f7a0bbd` (M6) | `pnpm build-storybook && pnpm test:stories`: every story, light and dark, renders and passes axe                                                | Pass   |
| `f7a0bbd` (M6) | Manual interaction pass (two accounts, iPhone + desktop, light + dark): see Completed work                                                      | Pass   |
| `9bbae5b` (M6) | CI: check, stories, smoke, secrets, sync                                                                                                        | Pass   |
| `7798246` (M7) | `ACCOUNTS_E2E=1` accounts spec vs local API (development, then production mode), iPhone + desktop: 14/14, twice                                 | Pass   |
| `7798246` (M7) | `pnpm smoothness` (4x throttle): every step ≤ 2 frames (worst 33 ms on back-during-push), no network                                            | Pass   |
| `cda2b09` (M7) | CI `accounts` job: ECR has no `sotto/api` repository (owner's `terraform apply`); other jobs pass                                               | Waits  |
