# Phase 5 progress — Ask and search

The running record for Phase 5, kept current at every checkpoint. A new session follows the
recovery steps in [`CLAUDE.md`](CLAUDE.md), then continues from **Next steps** below.

| Repo           | Branch           | Pull request                                                                                      |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| sotto-api      | `feat/p5-ask`    | [Harkanni/sotto-api#6](https://github.com/Harkanni/sotto-api/pull/6) (draft; merges first)        |
| sotto-web      | `feat/p5-ask`    | [Harkanni/sotto-web#6](https://github.com/Harkanni/sotto-web/pull/6) (draft)                      |
| sotto-platform | `docs/p5-status` | [Harkanni/sotto-platform#7](https://github.com/Harkanni/sotto-platform/pull/7) (draft; companion) |

## Project status

- **Current phase:** 5 — Ask and search. Phases 0–4 and the upload fixes (`fix/p4-uploads`) are
  merged (sotto-api `37040b3`, sotto-web `cfa7d98`, sotto-platform `8aa06a6`).
- **Overall:** in progress.
- **Current milestone:** M5 (web Ask) mostly done; M4's CI `evals` job being made to start.

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
| M1  | Schema + migration (Conversation, Message, Citation, Note); retrieval core (hybrid SQL, visibility, scope, sensitivity, hidden count) on real pgvector     | sotto-api | done    |
| M2  | `GET /search` (files, passages, moments, highlights); notes API (`POST/PATCH /notes`, notes through the pipeline); integration tests per role              | sotto-api | done    |
| M3  | Ask API: conversations (create, list + search, get, delete), SSE answers (prompt, citations, follow-ups, not-found), regenerate, stop, feedback, audit     | sotto-api | done    |
| M4  | Eval set (~20 fictional pairs + unanswerable + access cases) and runner; CI `evals` job with real embeddings; the Viewer check                             | sotto-api | done*   |
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

- **M1 (sotto-api `4f807c6`):** migration `20261009150000_ask_and_search` (conversations,
  messages with status, route, hidden counts, follow-ups and feedback; citations keeping the
  passage and title as they were; notes; trigram indexes for chat history and file titles;
  CHECKs), checked by building a fresh database from every migration and diffing it against
  the schema. `apps/api/src/ask/`: `RetrievalService` (one SQL statement: keyword half on the
  generated `tsv` with OR-ed light-stemmed prefixes, vector half on the serving model with
  exact distances inside the eligible set, RRF k = 60; workspace, READY, not trashed,
  `visibleTo` collections or unfiled, scope, allowed sensitivities in its WHERE; a second pass
  over the excluded sensitivities counts relevant files without selecting text); relevance
  floor (a shared word, or cosine ≥ 0.5 on a real model); per-file cap. `AiService` (query
  vector for the serving model, keyword-only when it can't, the Ask chat and its badge).
  `AI_ASK_CHAT` setting (`askChatFrom`).

- **M2 (sotto-api `73ccc4f`):** `GET /search` (files by title — best title match first, ties
  broken by content rank — then by content; passages with `[start, end)` highlight offsets
  from the same stems the keyword search used; meeting moments with times; scope by
  collection or kind). Notes: `POST /notes`, `GET/PATCH /notes/:id` (file id): a NOTE file
  with source `WRITTEN` (new enum value) whose Markdown body is stored as its original and
  queued as `file.uploaded`, so the worker extracts, chunks and embeds it like a document;
  editing the text re-indexes, a title alone doesn't; members write, viewers read, unfiled
  notes are edited by their writer and admins (ADR 0016). Audit actions `note.created`,
  `note.edited`, `ask.asked` (never content). Worker: a note edited while its job runs is
  left to the newer job (no stale Ready). Shared test fixture `test/integration/kestrel.ts`.

- **M3 (sotto-api `8e4a3a5`):** `apps/api/src/ask/`: `answer.ts` (search query for short
  follow-ups = previous question + this one; grounded prompt with rules, last 3 turns,
  numbered sources in inert `<source>` tags; `FollowUpSplitter` holding back a partial
  sentinel; `CitationStream` renumbering by first use as tokens arrive, holding back split
  markers and trailing spaces, dropping numbers that aren't sources), `ask.service.ts`
  (question + empty answer saved in one transaction, audit `ask.asked`, retrieval with the
  chat's allowed sensitivities, no model call when nothing is relevant, passages only when no
  model is configured, content saved every 1.5 s, stop via the saved status checked every
  second so it works from any api instance, failures saved with a code and never retried on
  another model, a "streaming" answer older than 3 minutes shown as interrupted, citations
  re-checked for access on read), `conversations.controller.ts` (create with a scope the
  person can open, list + `q` + keyset cursor, get, rename/rescope, delete, SSE ask,
  regenerate in place, stop, feedback). Rate limit `ASK_RATE_PER_MINUTE` (Redis, as auth).
  `.env.example`: `AI_ASK_CHAT`, `ASK_RATE_PER_MINUTE`.

- **M4 (sotto-api `795a38b`, `a9f8ee4`):** `evals/kestrel.ts` (24 questions worded as people ask,
  with the files that answer them, meeting moments, key answer words, 2 only in the restricted
  Board and finance collection; 3 unanswerable), `evals/score.ts` (recall@1/3/5 and MRR over
  `/search`'s fused ranking — search results now carry `rank` —, meeting moments, answers,
  unanswerable declined, a viewer never reaching the board; gates per search mode),
  `apps/api/test/integration/evals.spec.ts` (in-process on every run: real worker handlers,
  pgvector, keyword search with mock embeddings, passages-only answers; measured recall@5
  100%, MRR 0.66, moments 88%, 3/3 declined, 0 leaks), `scripts/eval.ts` + CI job `evals`
  (built images + Ollama `nomic-embed-text`). Mock embeddings now report `keyword` mode.
  \*The `evals` job hasn't run green yet: Ollama failed to start twice (exit 125, then a
  `docker run` error); now it uses `compose.deps.yaml`'s `ai` profile and reports setup errors
  as annotations (this sandbox can't download job logs; annotations can be read through the
  API). Thresholds for hybrid mode get calibrated from its first real run.
- **M5 (sotto-web `458e1c4`, `ab82482`, `1a0685f`):** `lib/api/ask.ts` (chats, SSE reader,
  `live` store so tokens re-render only the answer being written, optimistic question and a
  "thinking" answer, search, notes); `components/ask/answer.tsx` (smooth reveal paced per frame,
  light Markdown with citation chips, sources opening at the page or moment, data-route badge,
  hidden-sources notice); `components/ask/actions.tsx` (copy, answer again, save as note,
  helpful/not, switch model labelled for Phase 6; follow-ups); composer (scope chips incl.
  collections, @-mention picker with keyboard, Stop); `screens/ask.tsx` (chats with search and
  swipe-delete + Undo, chat screen with every answer state, follows a streaming answer until
  the question reaches the top, one 720 px reading column; Ask panel scoped to its file; phone
  Ask button opens `/ask?about=<file>` with the file picked).
- **Rendered and checked** (sandbox rig: real api + worker on local Postgres 16 + pgvector,
  Redis, RabbitMQ 3.12, moto S3, an SMTP sink, a stand-in OpenAI-compatible model on :5080 —
  Node's fetch refuses port 5060): sign up → sample content → 11 files Ready → Ask → @ picker
  → stream → answer with sources, actions, follow-ups → citation opens the document. iPhone
  and desktop, light and dark, no console errors. Fixed from what the screenshots showed:
  caret on its own line, chips showing through the @ picker, a two-line placeholder, the start
  of a long answer scrolled away, Markdown in chat previews, an over-wide reading column.

## Work in progress

M6.

## Remaining work

- M4: get the CI `evals` job green with real embeddings; calibrate hybrid thresholds.
- M5: still uses `lib/sample` threads on Home (Recent chats) and in the palette (→ M6).
- M6–M8 (table above).

## Next steps

1. M3: Ask API in `apps/api/src/ask/`: `answer.ts` (grounded prompt, follow-up sentinel
   splitter, citation renumbering by first use), `conversations.controller.ts` (create, list
   with `?q`, get with citations re-checked for access, delete; `POST
/conversations/:id/messages` as an SSE response; regenerate, stop, feedback), passages-only
   answers when no chat model is configured. Tests per role with the fake chat.

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
| `4f807c6` (M1) | Fresh database from all migrations = schema (only hand-written indexes differ, as in Phase 4)                     | Pass   |
| `4f807c6` (M1) | sotto-api lint, format, typecheck, build; 183 tests (api 109: retrieval 10 on real pgvector, keywords 5)          | Pass   |
