# Sotto — working instructions (sotto-web)

Read this first, in every session. It is permanent: how this project is built and how to keep
building it, whatever the phase. The state of the current phase lives in `PHASE_<n>_PROGRESS.md`.

## What Sotto is

Private AI for a team's memos and meetings. Internal teams upload documents and recordings, ask
questions, get answers with sources, and control exactly where their data goes. The owner is
Akanni Emmanuel (GitHub `Harkanni`); he reviews and merges every pull request.

Three private repos, cloned side by side:

| Repo               | Holds                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `sotto-web` (here) | Next.js app: product `(app)`, sign-in `(auth)`, later marketing; design system; Storybook  |
| `sotto-api`        | NestJS api, Node worker, Python transcriber, Prisma schema (pnpm monorepo)                 |
| `sotto-platform`   | Docs hub (`docs/STATUS.md`, `PLAN.md`, `BRIEF.md`, ADRs), Compose, Terraform, demo deploys |

A missing sibling: `git clone https://github.com/Harkanni/<repo>.git ../<repo>`.

## Start of every session: recover, then continue

1. Read this file.
2. Read `UI_DESIGN_SYSTEM.md`. It binds every pixel and every animation.
3. Read the current phase's log, `PHASE_<n>_PROGRESS.md` (highest `n`, on the branch that
   `../sotto-platform/docs/STATUS.md` names), and the open PR checklists.
4. In all three repos: `git fetch`, `git status`, `git log --oneline -15`.
5. Compare the log with the code. Where they disagree, investigate and correct the log first.
6. Find the last completed milestone and the first unfinished task (the log's **Next steps**).
7. Continue from there. Never restart a phase, repeat finished work, or replace working code
   without a clear technical reason. An interrupted task gets finished, not redone: inspect the
   files it touched and see what is left.

Where the sources disagree: the code is what exists; `PLAN.md` wins over `BRIEF.md`; ADRs
record decisions a later session must not silently undo.

## Architecture

- Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS 4, Radix, TanStack Query,
  sonner, cmdk. `output: "standalone"` for a small non-root image.
- The web app talks only to the API, through same-origin `/api/*` (Next rewrites it locally; a
  gateway does it in deployments). No database access, ever, and no CORS.
- The shell renders every screen client-side from the URL: one navigation stack per tab, pushed
  over `history.pushState` with compositor animations (ADR 0008). The route files under
  `src/app/(app)` exist so deep links load.
- Data goes through `src/lib/api` (typed client generated from sotto-api's `openapi.json`, plus
  TanStack Query hooks). `src/lib/sample` is the labelled Phase 2 sample layer, replaced piece by
  piece as the API grows.
- PWA: service worker app shell (`public/sw.js` + a per-build manifest), offline strip, launch
  screens, icons.

| Path                            | Holds                                                                |
| ------------------------------- | -------------------------------------------------------------------- |
| `src/app/(app)`                 | Product routes (Home, Docs, Ask, Meetings, Profile)                  |
| `src/app/(auth)`                | Sign-in, onboarding and invite screens (outside the shell)           |
| `src/components/ui`             | Primitives restyled to the design system, each with stories          |
| `src/components/shell`          | App chrome: stacks, bars, sidebar, sheets, palette, shortcuts        |
| `src/components/widgets`        | `AsyncWidget` (loading, empty, error) and illustrations              |
| `src/screens`                   | Screen bodies rendered by the shell                                  |
| `src/lib/nav`, `src/lib/motion` | Navigation store and routes; springs and the compositor driver       |
| `src/lib/api`, `src/lib/auth`   | API client and hooks; the auth client                                |
| `src/styles`                    | `tokens.css` (values), `globals.css` (Tailwind mapping), `shell.css` |

## UI and UX come first

The interface is the product. It must feel premium, native and buttery on a phone held in one
hand, and just as considered on a desktop. Functionality that feels ordinary isn't done.

- **Preserve the identity.** New screens are natural extensions of what exists: the same tokens,
  type scale, spacing, radii, materials, springs and components. Don't introduce a new style,
  change the palette, type or spacing, or redesign a working component out of preference.
  Improve without breaking what the owner already approved.
- **Look before building.** Open the closest existing screens and components and reuse them
  (`Screen`, `List`/`ListRow`/`ActionRow`, `Button`, `Sheet`, `AsyncWidget`, `SegmentedControl`,
  `SearchField`, `Badge`, `Avatar`, toasts). Build something new only when nothing fits, and
  then document it in `UI_DESIGN_SYSTEM.md`.
- **The rules** (brief §8–9 and the design system): 44 px targets with 8 px between; primary
  actions in the bottom 40% on phones; body and input text at least 16 px; light and dark;
  loading, empty and error states for every data widget; safe areas; AA contrast; visible focus.
- **Motion** follows the finger, is interruptible, animates only `transform`/`opacity`, uses the
  shared springs, and turns into crossfades under reduced motion. No decorative entrances.
- **Verify in the rendered app.** Screenshots on iPhone and desktop sizes in light and dark;
  scripted interactions for gestures; `pnpm smoothness` after shell or motion changes. Never call
  UI finished without looking at it.

## Conventions

- TypeScript strict; avoid `any` (comment the reason at typed boundaries). Small modules, named
  exports, comments that explain why.
- Styling uses tokens and Tailwind utilities only: no raw colours, no Tailwind palette, `cn()` to
  merge. Tailwind 4 animates `translate`/`scale` as their own properties, so list them in
  transitions. Theme overrides on `:root[...]` stay unlayered in `tokens.css`. No `:has()`.
- Copy is plain, active and sentence case. A button says what it does and the toast echoes it
  ("Send invite" → "Invite sent"). Errors say what happened and what to do; no apologies.
- Label every mock on screen ("Sample", "Arrives in Phase n"). Never stub a feature silently.
- Never ship SF Pro, SF Symbols or Apple device images. Fonts: -apple-system, BlinkMacSystemFont,
  Inter (self-hosted), system-ui.
- Writes to the API send the CSRF token from `GET /me`; the active workspace comes from the
  session, never from a URL.

## Tests: run before every commit

| Command                                            | Covers                                                |
| -------------------------------------------------- | ----------------------------------------------------- |
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | Code health                                           |
| `pnpm test`                                        | Unit tests (routes, springs, tokens' contrast, logic) |
| `pnpm build`                                       | The production build                                  |
| `pnpm e2e`                                         | Playwright on iPhone and desktop, axe, 44 px targets  |
| `pnpm build-storybook && pnpm test:stories`        | Every story renders and passes axe, light and dark    |

New components get stories, new logic gets unit tests, new flows get e2e coverage. Never claim a
check ran unless it did; record what ran (and the result) in the progress log.

Agent sandbox (no npm registry): `GH_TOKEN=$GH_TOKEN scripts/agent-deps.sh` restores
`node_modules` from CI's `dev-cache` release. After changing dependencies, push and wait for the
`sync` job, then rerun it. Playwright and `pnpm smoothness` use the preinstalled browser:
`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Git and checkpoints

- `main` changes only through pull requests with green CI. The owner merges; never merge your
  own PR, force-push or rewrite history.
- Branches `feat/p<phase>-<slice>`, `fix/…`, `chore/…`, `docs/…`. Conventional Commits.
- Work in progress always lives on a pushed branch with a draft PR whose description is a
  checklist.
- Checkpoint after every logically complete task: run the checks, update the progress log,
  commit, push. Don't start a large task while the last one is unrecorded.
- If the session may end (a usage warning, a long task ahead): save, write the exact next step
  into the log (task, files, approach), commit and push before anything else.
- Before each commit, read the diff for accidental changes and secrets. Only `.env.example` is
  committed.
- **CI/CD runs on Jenkins** (ADR 0023): `Jenkinsfile` runs the checks on every branch and PR and,
  on `main`, builds the arm64 image, pushes it to ECR and deploys the demo. GitHub Actions'
  `ci.yml` keeps the heavy checks (Playwright, Storybook, accounts); `images.yml` stays only as a
  fallback. Change the pipeline in `Jenkinsfile`. AWS access uses IAM access keys (ADR 0007);
  don't reintroduce OIDC or rewrite the working pipeline.
- A change spanning the API and the web is a pair of PRs; the API one merges first. Every PR has
  a companion `../sotto-platform/docs/STATUS.md` update.

## Documentation duties

| File                               | Update when                                                  |
| ---------------------------------- | ------------------------------------------------------------ |
| `PHASE_<n>_PROGRESS.md`            | Every milestone; before a large task if state isn't recorded |
| `UI_DESIGN_SYSTEM.md`              | A new reusable pattern, token, state or motion               |
| `../sotto-platform/docs/STATUS.md` | Every PR (companion PR)                                      |
| `../sotto-platform/docs/adr/`      | A decision a later session must not undo                     |
| `README.md`                        | Setup or scripts change                                      |

A phase is complete only when its requirements are verified, tests and the production build pass,
the important flows were inspected in the rendered app, the design system still holds, the docs
are current and everything is committed. Anything unfinished is listed, not hidden.

## Ask the owner first

Adding a paid service; anything irreversible (deleting data, changing live infrastructure); and
changing the look of anything he already approved.
