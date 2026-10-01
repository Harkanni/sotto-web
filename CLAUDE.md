# Sotto — agent context (sotto-web)

Next.js app for **Sotto**: the product (`(app)`) and, later, the marketing site (`(marketing)`).

This repo is one of three, cloned side by side under one folder:
`sotto-platform/` (docs hub, infra), `sotto-api/`, `sotto-web/`.

## Read first

1. `../sotto-platform/docs/STATUS.md` — where the build is and the exact next step. **Start here.**
2. `../sotto-platform/docs/PLAN.md` — the approved plan (wins over the brief where they differ).
3. `../sotto-platform/docs/BRIEF.md` — product, design system, UX rules, quality bar.
4. `../sotto-platform/CLAUDE.md` — working rules shared by all three repos.

If `../sotto-platform` isn't there, clone it: `git clone https://github.com/Harkanni/sotto-platform.git ../sotto-platform`.

## Layout

| Path                    | Holds                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| `src/app/(app)`         | Product shell: Home, Docs, Ask, Meetings, Profile — one navigation stack per tab |
| `src/app/(marketing)`   | Landing, pricing, security (Phase 8)                                             |
| `src/components/ui`     | shadcn components restyled to the Sotto design system                            |
| `src/styles/tokens.css` | Colour, type, radius and material tokens (light + dark)                          |
| `src/lib/api`           | Generated OpenAPI client + TanStack Query hooks                                  |

## Rules for this repo

- No database access, ever. The web app talks only to the API through `/api/*` (same origin, no CORS).
- Phone first, one-handed: 44px tap targets, primary actions in the bottom 40%, body text ≥ 16px.
- Every data widget has loading, empty and error states; every screen works in light and dark.
- Never ship SF Pro, SF Symbols or Apple device images. Font stack: -apple-system, BlinkMacSystemFont, Inter, system-ui.
- `main` only changes through PRs with green CI; the owner merges.
- Every PR also updates `sotto-platform/docs/STATUS.md` (companion PR or note).
- Only `.env.example` is committed. Never secrets.
