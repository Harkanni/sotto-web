# sotto-web

Next.js app for **Sotto**: the product (`(app)`) and, later, the marketing site (`(marketing)`).

> Where the build is, the plan and decisions: [sotto-platform](https://github.com/Harkanni/sotto-platform) → `docs/STATUS.md`.

The app shell (Home, Docs, Ask, Meetings, Profile) with sign-in, onboarding, invites, workspaces, members, collections with access, and the audit log, all on the API. Documents, meetings and chats are a labelled sample layer until Phases 4–5. `CLAUDE.md` has the working instructions, `UI_DESIGN_SYSTEM.md` the design rules, `PHASE_3_PROGRESS.md` where the build is.

## Run it locally

Needs Node 24 and pnpm 10.

```bash
cp .env.example .env.local     # API_URL=http://localhost:4000
pnpm install
pnpm dev                       # http://localhost:3000
```

Start the API from `sotto-api` (`pnpm deps:up && pnpm dev`), then sign in at <http://localhost:3000>: the sign-in link lands in Mailpit (<http://localhost:8025>). Or run everything at once from `sotto-platform` (`task up`).

## Scripts

| Command                                                         | Does                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`                        | Next.js (`start` serves the standalone build, as the image does)                |
| `pnpm lint` / `pnpm format` / `pnpm typecheck`                  | ESLint / Prettier / TypeScript                                                  |
| `pnpm test`                                                     | Vitest unit tests                                                               |
| `pnpm e2e`                                                      | Playwright on iPhone and desktop viewports (needs `pnpm build` first)           |
| `ACCOUNTS_E2E=1 pnpm exec playwright test e2e/accounts.spec.ts` | The sign-up → invite → restricted-access flow against a running API and Mailpit |
| `pnpm build-storybook && pnpm test:stories`                     | Every story renders and passes axe, light and dark                              |
| `pnpm storybook`                                                | The design system's components in every state                                   |
| `pnpm api:sync`                                                 | Regenerates the typed API client from `../sotto-api/openapi.json`               |
| `docker build -t sotto-web .`                                   | Standalone image, non-root                                                      |

## Rules

- No database access, ever. The browser and the server talk only to the API, at `/api/*` on the same origin.
- Phone first and one-handed: 44px tap targets, body text ≥ 16px, light and dark.
- Design tokens live in `src/styles/tokens.css`; the rules in `UI_DESIGN_SYSTEM.md`.
