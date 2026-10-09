# Phase 5 progress — Ask and search

The running record for Phase 5, kept current at every checkpoint. A new session follows the
recovery steps in [`CLAUDE.md`](CLAUDE.md), then continues from **Next steps** below.

| Repo           | Branch           | Pull request                                   |
| -------------- | ---------------- | ---------------------------------------------- |
| sotto-api      | `feat/p5-ask`    | (draft, opened at M0; merges first)            |
| sotto-web      | `feat/p5-ask`    | (draft, opened at M0)                          |
| sotto-platform | `docs/p5-status` | (draft, opened at M0; companion: STATUS, ADRs) |

## Project status

- **Current phase:** 5 — Ask and search. Phases 0–4 and the upload fixes (`fix/p4-uploads`) are
  merged (sotto-api `37040b3`, sotto-web `cfa7d98`, sotto-platform `8aa06a6`).
- **Overall:** in progress.
- **Current milestone:** M0 (recovery and plan).

## Requirements

Sources: `sotto-platform/docs/PLAN.md` (Milestones row 5, Data model → Chat, API → Notes, Ask,
Search; Swappable AI providers), `BRIEF.md` (§3 privacy model, §4 Ask and Search, §5 Answer
flow, §9 Mobile UX, Tests: the eval set, Phase 5 prompt) and Phase 4's carry-overs.

**Retrieval (BRIEF §5 Answer flow)**

- Hybrid retrieval: pgvector (the serving embedding model) and Postgres full-text search, fused
  by Reciprocal Rank Fusion.
- Workspace, permission and sensitivity filters inside the SQL, never applied afterwards. Nobody
  gets an answer or a search result from a file they can't open.
- Restricted content only ever reaches in-cluster models; Confidential follows the workspace
  rule (Phase 6 makes it a setting; Phase 5 keeps the default: not to third parties). When an
  outside model answers, the UI says how many sources were hidden.

**Ask (BRIEF §4)**

- Scope: the whole workspace, a collection, or specific files picked with @-mentions.
- Streaming answers with numbered inline citations; tapping a citation opens the source at the
  exact spot: the page with the passage highlighted, or the recording playing from that time.
- When the sources don't hold the answer, say so instead of guessing, and suggest follow-ups.
- Per-answer actions: copy, regenerate, switch model, save as note, thumbs up or down.
- Searchable chat history. Every answer shows a data-route badge.

**Search (BRIEF §4)**

- Hybrid keyword and semantic search returning files, passages and meeting moments: the ⌘K
  palette on desktop, a search field under the large title on phones.

**Notes (PLAN, Phase 5 API)**

- `POST /notes`, `PATCH /notes/:id`: New note (the + sheet) and "save answer as note". Notes are
  files of kind NOTE, searchable and citable like any document.

**API (PLAN, Phase 5 rows)**

- Notes: `POST /notes` · `PATCH /notes/:id` (Member+).
- Ask: `POST /conversations` · `GET /conversations?q` · `GET /conversations/:id` ·
  `POST /conversations/:id/messages` (SSE: tokens, citations, route badge, hidden-restricted
  count) · `POST /messages/:id/regenerate` · `POST /messages/:id/feedback` (Viewer+).
- Search: `GET /search?q&scope` (files, passages, meeting moments; hybrid RRF) (Viewer+).
- Data model: Conversation, Message, Citation, Note (PLAN → Chat, Operations).

**Eval set (BRIEF, Tests)**

- About 20 fictional question-and-answer pairs, scored on every change to the AI pipeline.

**Done when** a Viewer can't retrieve from a collection they can't open and the eval set passes,
with the UI held to `UI_DESIGN_SYSTEM.md` on iPhone and desktop.

## Plan

The answer flow, end to end:

```
browser ──POST /conversations/:id/messages {content}──▶ api   (SSE response)
api: scope + viewer → visible collection ids (visibleTo, as in GET /events)
api: question ──embed (serving model)──▶ vector top 40 ┐
api: question ──websearch_to_tsquery──▶ keyword top 40 ┴─ RRF (k = 60) → top 8 passages
     (one SQL statement: workspace, READY, not trashed, visibility, scope, sensitivity allowed
      for the chat's data location; a second counts what the route hid, never reads its text)
api ──event: sources (numbered, route badge, hidden count)──▶ browser
api: grounded prompt (numbered sources) ──ChatProvider.stream──▶ tokens
api ──event: token …──▶ browser       (follow-ups after a sentinel are held back, sent at done)
api: message saved (content renumbered by first citation, citations, tokens, route)
api ──event: done (follow-ups, not-found, usage)──▶ browser
```

No chat model configured (the demo today): no model is called; the answer is the best-matching
passages, labelled "Passages only — no AI model on this server". Never a silent fallback to an
outside model.

| #   | Milestone                                                                                                                                                  | Repo      | State   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------- |
| M0  | Recovery; requirements and plan (this log); branches and draft PRs                                                                                         | all       | done    |
| M1  | Schema + migration (Conversation, Message, Citation, Note); retrieval core (hybrid SQL, visibility, scope, sensitivity, hidden count) on real pgvector     | sotto-api | pending |
| M2  | `GET /search` (files, passages, moments, highlights); notes API (`POST/PATCH /notes`, notes through the pipeline); integration tests per role              | sotto-api | pending |
| M3  | Ask API: conversations (create, list + search, get, delete), SSE answers (prompt, citations, follow-ups, not-found), regenerate, stop, feedback, audit     | sotto-api | pending |
| M4  | Eval set (~20 fictional pairs + unanswerable + access cases) and runner; CI `evals` job with real embeddings; the Viewer check                             | sotto-api | pending |
| M5  | Web: API client (ask, search, notes); Ask and chat screens on the API: streaming, citations, actions, follow-ups, scope chips, @-mentions; sample chats go | sotto-web | pending |
| M6  | Web: citations open the exact spot (page highlight, timestamp); Ask panel; ⌘K hybrid search; phone search under the large title; Home recent chats         | sotto-web | pending |
| M7  | Web: notes (New note, save answer as note, edit); stories, unit tests, e2e (ask → citation opens the source), axe, smoothness                              | sotto-web | pending |
| M8  | Compose and demo config; ADRs; STATUS; verification in the rendered app (iPhone + desktop, light + dark); PRs ready                                        | all       | pending |

## Completed work

- **M0:** recovered from `docs/STATUS.md` (Phase 4 and its upload fixes merged; no open PRs).
  Read CLAUDE.md (all repos), `UI_DESIGN_SYSTEM.md`, PLAN, BRIEF §3–5, §9 and the Phase 4 log.
  Inspected what Phase 5 builds on: `packages/ai` (registry, `ChatProvider.stream`, the
  `canSend`/`partitionSources` route policy, settings), the chunk/embedding schema (generated
  `tsv` with `simple` config + GIN; per-model partial HNSW), `visibleTo`/`fileVisibleTo`, the
  SSE hub, the sample content (Kestrel Labs: 8 memos, 3 meetings); on the web the sample Ask
  layer (`lib/sample/answer.ts`, threads), the composer and chips, the palette (title search),
  the Ask panel, deep links (`?t=` works on meetings; `?page=` isn't read by the document
  screen yet). Baseline on `main`: sotto-api builds; 168 tests pass, integration included,
  against local Postgres 16 with real pgvector 0.6, Redis and an S3 stand-in (moto).

## Work in progress

M1.

## Remaining work

M1–M8 (table above).

## Next steps

1. M1: in sotto-api, add the Phase 5 models to `schema.prisma` and write migration
   `20261009150000_ask_and_search`; then `apps/api/src/ask/retrieval.ts` (hybrid SQL) with
   integration tests against real pgvector.

## Decisions

Recorded as they're taken; the ones a later session must not undo become ADRs (0019 on).

- **One branch per repo** for the phase (`feat/p5-ask`, `docs/p5-status`), like Phase 4.
- **Which chat answers in Phase 5:** the platform's configured chat model (`AI_PRIVATE_CHAT`, or
  a new `AI_ASK_CHAT`), its data location deciding the route and the sensitivity filter.
  Workspace modes, BYOK and Managed keys stay in Phase 6.
- **No model, no pretending:** without a chat model the answer is the matching passages,
  labelled on screen; nothing is generated and nothing leaves the server.

## Missing specifications and outside dependencies

Identified, not invented around:

1. **Demo chat model.** The demo server can't run a chat model and the hosted-model key is a
   Phase 6 decision (STATUS → Open decisions). Until then the demo answers with labelled
   passages only.
2. **Switch model** (a per-answer action) needs the model catalog (Phase 6). Phase 5 shows the
   model that answered and labels switching as arriving in Phase 6.
3. **"Switch to Private to include them"** (hidden restricted sources) needs workspace modes
   (Phase 6). Phase 5 shows the count and the reason.

## Known issues

- This sandbox has Node 22 (the repos ask for 24) and can't reach `binaries.prisma.sh`;
  `node_modules` comes from CI's `dev-cache` snapshot (through the GitHub API), which carries
  Prisma's engines. Local pgvector is 0.6 (CI's image is newer).

## Tests and checks run

| When           | Check                                                                                                             | Result |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| `37040b3` (M0) | sotto-api build; 168 tests (config 2, ai 14, contracts 8, db 17, storage 10, worker 23, api 94) incl. integration | Pass   |
