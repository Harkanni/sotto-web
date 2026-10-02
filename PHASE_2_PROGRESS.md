# Phase 2 progress — design system and app shell

The running record for Phase 2, kept current at every checkpoint. A new session starts here:
read this file, check `git status` and `git log`, then do **the next task** below.

- Branch `feat/p2-design-system`, draft PR [Harkanni/sotto-web#2](https://github.com/Harkanni/sotto-web/pull/2)
  (its description carries the same checklist).
- Cross-repo status: `../sotto-platform/docs/STATUS.md` (updated in a companion PR before Phase 2
  is marked ready).
- Design rules: [`UI_DESIGN_SYSTEM.md`](UI_DESIGN_SYSTEM.md). Product brief: `../sotto-platform/docs/BRIEF.md` §8–9.

## Objectives

Done when every piece is in Storybook and the shell meets every rule in brief §9:

- A premium, native-feeling, buttery UI on phone, tablet and desktop, light and dark.
- Design tokens, type, components with every state, widget loading/empty/error states.
- The app shell: a navigation stack per tab, large titles, the + sheet, desktop panes, ⌘K,
  shortcuts, offline banner, installable PWA with the brand favicon.
- Smooth under load: pushes, pops, swipes and tab switches within one or two frames at 4× CPU
  throttle.
- Tests and CI green; the owner merges.

Constraints that still hold: AWS access keys (no OIDC) in every pipeline; no secrets in the repo;
sample data is labelled on screen; the web app never touches the database.

## Next task

1. Watch CI on PR #2 (check, stories, smoke, secrets); fix anything red.
2. Final rendered-UI review: every screen on phone, tablet and desktop in light and dark, plus
   the interactions (push/pop, swipe, long-press, sheet, palette, offline). Fix inconsistencies.
3. sotto-platform companion PR: STATUS.md (Phase 2 done, PR #2), ADR 0007 (CI uses IAM access
   keys, not OIDC), ADR 0008 (client-side stack navigation over pushState).
4. Mark PR #2 ready for review (the owner merges).

## Checklist

- [x] Dependencies, plus a `node_modules` snapshot for the agent sandbox (`scripts/agent-deps.sh`)
- [x] Brand: favicon (SVG + ICO), Apple touch icon, PWA icons, web manifest (`a009ae3`)
- [x] Tokens (light-dark), type scale, spring easings, self-hosted Inter, theme provider (`c5b4392`)
- [x] App shell: per-tab stacks, compositor push/pop, edge swipe, tab bar, sidebar, + button,
      wide-window panes (`2136d9f`)
- [x] Components, widget states, sheets, toasts, swipe rows, sample screens, first 4× throttle
      pass (`4b5c408`)
- [x] Long-press: the row sinks, lifts as a preview, slide-to-choose; swipe buttons ride the
      row edge; deletes fold the row away (`82e82f5`)
- [x] ⌘K palette, keyboard shortcuts + "?" sheet, drag-and-drop upload overlay (`60a92a5`)
- [x] Offline: service worker app shell, offline strip / "Back online", iOS launch screens (`4b7f2dd`)
- [x] Perf: tabs wake at idle and are laid out unseen, so a first visit is cheap (`bfb5a66`)
- [x] Back labels use the hidden title's room (`80d8846`)
- [x] Storybook setup + Button state matrix; `pressed:`/`hovered:` preview variants (`27acfda`)
- [x] `UI_DESIGN_SYSTEM.md`, this file, `scripts/smoothness.mjs` (`pnpm smoothness`)
- [x] Stories for every component and state: 46 stories (`689a5cc`)
- [x] Unit tests (routes, springs, format, token contrast + spring sync) and shell e2e (tabs,
      back/history, + sheet, palette, shortcuts, axe on every main screen, 44 px targets) (`689a5cc`)
- [x] Story tests: render + axe in light and dark, 92 pass; CI `stories` job (`9ad2250`)
- [ ] CI green on PR #2
- [ ] Final rendered-UI review; STATUS.md companion PR; PR ready for review

## What exists (files)

| Area                   | Files                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens and styles      | `src/styles/tokens.css`, `globals.css`, `shell.css`                                                                                                                                                       |
| Motion                 | `src/lib/motion/spring.ts` (springs → `linear()`), `driver.ts` (ProgressDriver, velocity)                                                                                                                 |
| Navigation             | `src/lib/nav/` (routes, store over pushState, hooks, link, titles)                                                                                                                                        |
| Shell                  | `src/components/shell/` (app-shell, tab-stack, screen, tab-bar, sidebar, fab, add-sheet, item-sheets, command-palette, shortcuts, drop-overlay, service-worker, system)                                   |
| Components             | `src/components/ui/` (button, list, row-actions, sheet, toaster, segmented-control, switch, search-field, badge, avatar, kbd, skeleton, spinner), `src/components/widgets/` (async-widget, illustrations) |
| Screens                | `src/screens/` (home, docs, doc, ask, meetings, profile, parts/)                                                                                                                                          |
| Sample data (labelled) | `src/lib/sample/` (data, api, queries, answer)                                                                                                                                                            |
| PWA                    | `public/sw.js`, `src/app/sw-manifest.js/route.ts`, `src/app/manifest.ts`, `public/icons`, `public/splash` (58 launch screens), `src/lib/pwa/`                                                             |
| Routes                 | `src/app/(app)/{home,docs,ask,meetings,profile}/[[...path]]`, `src/app/status` (old `/`), `/` → `/home`                                                                                                   |
| Tooling                | `.storybook/`, `scripts/generate-assets.mjs`, `scripts/smoothness.mjs`, `scripts/agent-deps.sh`                                                                                                           |

## Tests and checks run

| When         | Check                                                                                                                                                                                                                                                 | Result                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Every commit | `tsc --noEmit`, `eslint`, `prettier --check`, `next build`                                                                                                                                                                                            | Pass                             |
| 82e82f5      | Interaction script (iPhone 15 emulation): sheet drag-dismiss, swipe open/close, tap revealed button, long-press menu, slide-to-choose, full-swipe delete + Undo, menu delete + Undo, theme switch                                                     | All pass                         |
| 60a92a5      | Desktop: ⌘K open/arrows/search/↵, ⌘↵ ask, "?" sheet, G then M, J/K + ↵, A toggles Ask panel, file drop (2 ready, 1 skipped) — light and dark                                                                                                          | All pass                         |
| 4b7f2dd      | Offline: worker controls in ~40 ms, 21 assets precached; offline reload of a saved page; never-saved screen opens from its section's page with no hydration error; non-app page shows the offline notice; strip + "Back online"; + button lifts 32 px | All pass                         |
| bfb5a66      | `pnpm smoothness` (4× throttle): first switch to Home 67–83 ms → 33–50 ms worst frame                                                                                                                                                                 | Improved                         |
| 80d8846      | Contact sheets: 10 phone screens light + dark, tablet light, desktop dark                                                                                                                                                                             | Reviewed, back-label fix applied |
| 27acfda      | Storybook build (5.9 s), Button matrix screenshots light + dark                                                                                                                                                                                       | Pass                             |

## Known issues and notes

- Screenshots in the agent sandbox render backdrop blur without blurring text (a headless
  software-rendering quirk); real browsers blur normally.
- Push cost at 4× throttle: the tap handler renders the new screen synchronously (20–45 ms at
  4×, ~5–10 ms real). Possible next optimisation: start rendering the destination in a hidden
  `<Activity>` on pointer-down, so the click only reveals it.
- `pnpm smoothness` numbers vary ±1 frame between runs on the sandbox.
- Sample answers, uploads, recording and notes are labelled previews until Phases 4–5.
