# sotto-web

Next.js app for **Sotto**: the product (`(app)`) and, later, the marketing site (`(marketing)`).

> Where the build is, the plan and decisions: [sotto-platform](https://github.com/Harkanni/sotto-platform) → `docs/STATUS.md`.

Phase 1 ships a live **status page** (the always-on demo's home). It reads `/api/v1/status` from the API, and shows a calm "not reachable yet" when the API is down. Phase 2 replaces it with the app shell.

## Run it locally

Needs Node 24 and pnpm 10.

```bash
cp .env.example .env.local     # API_URL=http://localhost:4000
pnpm install
pnpm dev                       # http://localhost:3000
```

Start the API from `sotto-api` (`pnpm deps:up && pnpm dev`) to see live checks, or run everything at once from `sotto-platform` (`task up`).

## Scripts

| Command                                        | Does                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`       | Next.js                                                               |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | ESLint / Prettier / TypeScript                                        |
| `pnpm test`                                    | Vitest unit tests                                                     |
| `pnpm e2e`                                     | Playwright on iPhone and desktop viewports (needs `pnpm build` first) |
| `docker build -t sotto-web .`                  | Standalone image, non-root                                            |

## Rules

- No database access, ever. The browser and the server talk only to the API, at `/api/*` on the same origin.
- Phone first and one-handed: 44px tap targets, body text ≥ 16px, light and dark.
- Design tokens live in `src/styles/globals.css`; the full system arrives in Phase 2.
