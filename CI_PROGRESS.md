# CI progress log: the Accounts flow stage (Jenkins)

Handoff log for fixing `sotto-web`'s Jenkins pipeline. A new session reads this, then continues
from **Next steps**. One entry per checkpoint; newest state at the top of each section.

**Branch:** `fix/accounts-flow-rabbitmq` (sotto-web) · **Started:** 2026-10-15

## The failure (build of `main` at 7f29f2f, 2026-10-15 08:11 UTC, slot 2)

Every stage passed except **Accounts flow**: both projects (iPhone, desktop) failed the first
test, _someone signs up and creates a workspace with sample content_, at
`expect(owner).toHaveURL(/\/home$/)` after 30 s (the page stayed on `/welcome`), and the other
12 tests didn't run.

What the log actually shows:

1. **RabbitMQ never became ready.** The stage's wait loop ran
   `pg_isready && rabbitmq-diagnostics -q ping && <S3 answers> && break` 60 times. In every try
   the ping ran and failed (the S3 `curl` in the third clause never appears in the trace), and
   after the 60th try the loop simply ended: **no error**, the stage carried on.
2. The bucket, migrations and api started fine (Postgres, SeaweedFS, Redis, Mailpit were up).
   Sign-up worked (the magic-link email arrived).
3. "Explore with sample content" calls `POST /api/v1/onboarding/sample-content`. The api log
   has it 4 times (2 projects × 1 retry): `→ 500 (Error ECONNREFUSED)` from
   `TCPConnectWrap.afterConnect`.
   - It is the **queue**, not storage: the handler writes each sample to S3 first (works), then
     publishes the job to RabbitMQ (`QueueService.publish`, amqplib → `localhost:$AMQP_PORT`).
     A storage failure would have been a 503 `STORAGE_UNAVAILABLE` (the SDK's errors carry
     `$metadata`; `apps/api/src/common/errors.ts`), not a 500.
4. The web shows the error toast and stays on `/welcome`; the test times out. The previous fix
   (sotto-web#17: 5 s → 30 s) treated this as slowness; it never was.

**Why RabbitMQ didn't come up is not in the log**: the stage never printed the container's
state or logs. Candidates: the container exited at boot (image or resource problem: an OOM kill,
or Erlang reserving memory for a huge open-files limit), or it was still booting after > 3 min
on a host shared by parallel builds. Note the same host runs sotto-api's pipeline green with
`rabbitmq:4-management-alpine` under `docker compose up --wait` (healthchecked).

## What changed (this branch)

- `e2e/accounts.compose.yaml` (new): the accounts flow's services as a Compose project with a
  healthcheck each. RabbitMQ is now `rabbitmq:4-management-alpine` (the image sotto-api's
  pipeline already runs on that host), `ulimits.nofile` 65536, and its healthcheck is
  `rabbitmq-diagnostics -q check_port_connectivity` (AMQP accepts connections, not just "node
  runs"). Postgres is checked over TCP (`-h 127.0.0.1`), so the init-time socket-only server
  doesn't count as ready. Mailpit's own slow healthcheck is disabled; SeaweedFS has none (the
  bucket step and `/readyz` cover it). Usable locally:
  `docker compose -f e2e/accounts.compose.yaml up -d --wait`.
- `Jenkinsfile`, Accounts flow:
  1. `docker compose up -d --wait --wait-timeout 240`: a service that exits or never turns
     healthy stops the stage right there.
  2. The bucket is created with retries until HTTP 200/409, and the stage fails if it can't be.
     (`code=$(curl … || true)`: under `sh -e` a refused connection would otherwise end the
     script instead of retrying.)
  3. Migrations and the api as before.
  4. The stage waits for the api's **`/readyz`** (database, Redis, storage, queue) instead of
     `/healthz`, prints the readiness JSON, and stops early if the api container exits.
  5. On failure, `accountsDiagnostics()` prints every service's state (running, exit code,
     OOM-killed, health), the last 60 lines of each service, 150 of the api, `/readyz`,
     `free -m`, `df -h /` and `docker system df`.
- `stopAccountsStack()`: `docker compose down -v --remove-orphans`, then `docker rm -f -v` for
  the old container names. The old `docker rm -f` left Postgres', RabbitMQ's and SeaweedFS'
  anonymous volumes behind on every build (3 per build): a slow disk leak on the Jenkins host.
- `useSlot()`: `COMPOSE_PROJECT_NAME` = the slot's `CI_NAME` (`sotto-ci-web-<n>`; sotto-api uses
  `sotto-ci-<n>`, so they never collide).
- The other log issues (second commit):
  - Browser tests (`pnpm e2e`, the accounts flow) and `pnpm start` serve the **standalone**
    build through `scripts/serve-standalone.sh` (copies `.next/static` and `public` beside
    `server.js`, as the image's runtime stage does), instead of `next start`, which warned it
    doesn't work with `output: 'standalone'`.
  - Story tests: 60 s per test on CI (the first story per worker starts a cold browser and loads
    ~2 MB of scripts; three of them timed out at 30 s and passed on retry), and the static
    server's per-request log is no longer printed (`stderr: 'ignore'`).
  - Storybook build: `.storybook/main.ts` drops Rolldown's `MODULE_LEVEL_DIRECTIVE` ("use
    client") and `PLUGIN_TIMINGS` logs and raises the chunk-size warning to 4 MB (the preview
    bundle is a test fixture, never shipped).
  - Secrets scan pinned to `ghcr.io/gitleaks/gitleaks:v8.30.1` (what `latest` is today).
  - `web.out` removed and `*.out` ignored.

## Checks run (sandbox)

- `docker compose -f e2e/accounts.compose.yaml config` with slot 2's ports: valid.
- Every `sh '''…'''` block of the Jenkinsfile through `dash -n`: no syntax errors.
- The Accounts flow script under `dash -e` with stubbed `docker`/`curl`: the bucket retries
  through two refused connections and succeeds; the readiness loop waits, then passes; with an
  exited api container it stops after one check and fails with the message.
- Second commit: `pnpm lint` (0 errors; the one warning, `postcss.config.mjs`, predates this
  branch), `pnpm format:check`, `pnpm typecheck`, `pnpm test` (80/80) all pass.
- `CI=true pnpm e2e` against the standalone server: 26 passed, 20 skipped (as on Jenkins).
- `pnpm build-storybook`: exit 0, **205 log lines** (was 1,973; 0 `"use client"` warnings, was
  120). `CI=true pnpm test:stories`: **170/170 passed** first time, 15 lines of output.
- `scripts/serve-standalone.sh 3777`: `/sign-in` 200, its hashed CSS 200, `/sw.js` 200.
- Not possible here: running the real images (the sandbox can't reach Docker Hub). **The real
  proof is the next Jenkins build of this branch.**

## Next steps

1. Owner: let Jenkins build `fix/accounts-flow-rabbitmq` (or its PR). Expected: Accounts flow
   green. If it fails, the failure output now says which service and why: read the
   `===== accounts stack` block first (look for `oom-killed=true` or `health=unhealthy` on
   `-mq`), then that service's logs.
2. If RabbitMQ is OOM-killed or the host is short of memory/disk: lower parallelism (Jenkins
   node executors 3 → 2) or move Jenkins to a bigger instance; clear leaked volumes once with
   `docker volume prune -f` on the Jenkins host (safe: only unused volumes; sotto-api's Ollama
   model volume is in use only during its builds, re-downloads 275 MB if pruned).
3. The sotto-api image's OpenSSL warning: its own PR (see "Other issues").

## Other issues in the same log

| Issue                                                                                                                    | Status |
| ------------------------------------------------------------------------------------------------------------------------ | ------ |
| Wait loop falls through silently when a service never comes up                                                           | Fixed  |
| Anonymous volumes leak on every build (`docker rm -f` without `-v`)                                                      | Fixed  |
| 3 flaky story tests (first stories time out waiting for `#storybook-root` while 8 workers start on a cold server)        | Fixed  |
| `next start` with `output: standalone` warns (e2e and accounts web server); should run `.next/standalone/server.js`      | Fixed  |
| Log noise: Python `http.server` prints every request (thousands of lines), Vite's `"use client"` warnings (hundreds)     | Fixed  |
| `gitleaks:latest` is unpinned (a new release can break or change the scan without a commit)                              | Fixed  |
| `web.out`, a stray `next start` log, is committed                                                                        | Fixed  |
| sotto-api image: Prisma warns it can't detect OpenSSL (`node:24-bookworm-slim` has none); migrations still ran           | Next   |
| Docker stores the ECR login unencrypted in `~jenkins/.docker/config.json` (host setting: `amazon-ecr-credential-helper`) | Note   |
