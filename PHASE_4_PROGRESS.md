# Phase 4 progress — ingestion and meetings

The running record for Phase 4, kept current at every checkpoint. A new session follows the
recovery steps in [`CLAUDE.md`](CLAUDE.md), then continues from **Next steps** below.

| Repo           | Branch              | Pull request                                                                                                            |
| -------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| sotto-api      | `feat/p4-ingestion` | [Harkanni/sotto-api#4](https://github.com/Harkanni/sotto-api/pull/4) (merges first)                                     |
| sotto-web      | `feat/p4-ingestion` | [Harkanni/sotto-web#4](https://github.com/Harkanni/sotto-web/pull/4)                                                    |
| sotto-platform | `docs/p4-status`    | [Harkanni/sotto-platform#4](https://github.com/Harkanni/sotto-platform/pull/4) (companion: STATUS, ADRs, Compose, demo) |

## Project status

- **Current phase:** 4 — ingestion and meetings. Phases 0–3 are merged (sotto-api `5c4e4f0`,
  sotto-web `fbc5321`, sotto-platform `2f0ffd9`).
- **Overall:** in progress.
- **Current milestone:** M9 (verification, CI, config, docs).

## Requirements

Sources: `sotto-platform/docs/PLAN.md` (Milestones row 4, Data model, API, Swappable AI
providers), `BRIEF.md` (§4 Library and ingestion, Meetings; §9 Mobile UX; Phase 4 prompt) and
Phase 3's carry-overs (ADRs 0012, 0013).

**Library and ingestion**

- Upload PDF (keeping page numbers), DOCX, TXT, MD and audio (MP3, M4A, WAV, WebM) by
  drag-and-drop or the file picker.
- Direct-to-storage presigned multipart uploads with progress, pause and resume, and retry
  (recordings are often over 100 MB).
- In-app recording (MediaRecorder): live waveform, pause and resume, a consent reminder before
  it starts.
- ffmpeg normalises all audio before transcription (MP4/AAC from iOS Safari, WebM/Opus from
  Chrome).
- Live status per file: Uploaded → Transcribing → Indexing → Ready, or Failed with Retry
  (`GET /events`, SSE).
- Collections hold docs and meetings; tags, pin, rename, move, a 30-day trash. Permanent delete
  removes the file, transcript, chunks and embeddings.
- The queue: the API publishes `file.uploaded`; the worker extracts or requests transcription,
  then chunks and embeds; the transcriber consumes `transcribe.requested` and publishes
  `transcribe.completed`. Message shapes are Zod schemas in `packages/contracts`.
- Providers stay swappable (ADR 0002): embeddings (`EmbeddingProvider`, Ollama
  `nomic-embed-text` by default), transcription (faster-whisper, chosen by
  `TRANSCRIBER_ENGINE`). Every vector records its model; one index per model. No silent fallback.

**Meetings**

- Transcript with speaker labels (diarization is Off by default, PLAN) and timestamps,
  follow-along highlighting, tap a line to seek, search within the transcript.
- Player: 0.75–2× speed, 15-second skips, lock-screen controls (Media Session), remembered
  position for Continue listening.
- Insights: summary, decisions, action items (owner and due date when mentioned), open
  questions, chapters with timestamps.

**API (PLAN, Phase 4 rows)**

- Uploads: `POST /uploads`, `POST /uploads/:id/parts`, `POST /uploads/:id/complete`,
  `DELETE /uploads/:id`.
- Files: `GET /files?collection&kind&status&q&cursor`, `GET/PATCH /files/:id`,
  `DELETE /files/:id`, `POST /files/:id/restore`, `DELETE /files/:id/permanent`,
  `POST /files/:id/retry`, `GET /files/:id/download`.
- Live status: `GET /events` (SSE). Meetings: `GET /files/:id/transcript?q`,
  `GET /files/:id/insights`, `PUT /files/:id/position`, `GET /continue-listening`.
- Data model: File, Transcript, TranscriptSegment, MeetingInsights, PlaybackPosition, Chunk,
  ChunkEmbedding, EmbeddingIndex; the **Next** tables added empty (`File.source`,
  Integration, RetentionPolicy, LegalHold).

**Carried over from Phase 3**

- Files and chunks reuse `visibleTo` (ADR 0012): permissions inside SQL, 404 for what you can't
  open.
- Sample documents become real files in the same collections; the sample layer is deleted piece
  by piece, the query hooks keep their names (ADR 0013).
- Hide the + button for viewers once uploads are real.

**Done when** a PDF and a 30-minute recording both reach Ready with correct pages and
timestamps, with the UI held to `UI_DESIGN_SYSTEM.md` on iPhone and desktop.

## Plan

The pipeline, end to end:

```
browser ──POST /uploads──▶ api (File UPLOADING, S3 multipart, presigned part URLs)
browser ──PUT parts──────▶ S3 / MinIO (direct; the api never proxies bytes)
browser ──complete───────▶ api (File UPLOADED) ──file.uploaded──▶ worker
worker: checksum → DOCUMENT: extract pages → chunk → embed → READY
                 → AUDIO: TRANSCRIBING ──transcribe.requested──▶ transcriber
transcriber: ffmpeg normalise → engine → transcript.json + peaks.json to S3
             ──transcribe.progress / transcribe.completed──▶ worker
worker: transcript rows → time-window chunks → embed → insights (ChatProvider) → READY
worker ──Redis pub/sub──▶ api ──GET /events (SSE)──▶ browser (patches its caches)
```

| #   | Milestone                                                                                                                                             | Repo      | State   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------- |
| M0  | Recovery; requirements and plan (this log); branches and draft PRs                                                                                    | all       | done    |
| M1  | Schema + migration (files, meetings, chunks, vectors, FTS, Next tables); storage module (S3, presigning); contracts for the new messages              | sotto-api | done    |
| M2  | Uploads and Files API (access by collection, trash, retry, download), `GET /events` SSE, audit entries, integration tests per role, `openapi.json`    | sotto-api | done    |
| M3  | Worker pipeline: checksum, extraction (PDF pages, DOCX, TXT, MD), chunking, embeddings (Ollama + labelled mock), transcript ingest, insights, retries | sotto-api | done    |
| M4  | Transcriber: ffmpeg normalisation, faster-whisper engine, duration and waveform peaks, queue consumer, progress                                       | sotto-api | done    |
| M5  | Meetings API (transcript search, insights, position, continue listening, document content); sample content as real files                              | sotto-api | done    |
| M6  | Web: upload manager (multipart, progress, pause/resume, retry), real + sheet and drop, recorder, live status, + hidden for viewers                    | sotto-web | done    |
| M7  | Web: Docs and document screen on real files (filters, move, rename, tags, pin, sensitivity, trash)                                                    | sotto-web | done    |
| M8  | Web: Meetings and meeting screen (player, Media Session, position, transcript follow-along and search, insights); Home widgets on real data           | sotto-web | done    |
| M9  | Done-when E2E (PDF + 30-minute recording) in CI; Compose and demo config; ADRs; STATUS; stories, axe, smoothness, screenshots; PRs ready              | all       | pending |

## Completed work

- **M0:** verified the starting point: all three repos clean on `main` with Phase 3 merged
  (sotto-api#3, sotto-web#3, sotto-platform#3). Read CLAUDE.md (all repos),
  `UI_DESIGN_SYSTEM.md`, STATUS, PLAN, BRIEF, ADRs 0012–0013 and the Phase 3 log. Inspected the
  code Phase 4 builds on: the provider registry and fakes (`packages/ai`), the contracts, the
  worker's Phase 1 consumer, the transcriber's fake engine, collections and `visibleTo`, and on
  the web the sample layer, Docs, Doc, Meetings, the + sheet and the drop target. Baseline on
  `main`: sotto-api builds and its 51 unit tests pass.

- **M1 (sotto-api `c8bccdb`):** migration `20261003210000_files_and_meetings` (files,
  transcripts, segments, insights, playback positions, chunks with a generated `tsvector` + GIN,
  `chunk_embeddings` one row per model, `embedding_indexes`, the empty Next tables, a trigram
  index for transcript search, CHECK constraints). `@sotto/db` `vectors.ts`: per-model partial
  HNSW (cast to the model's size) and batched upserts, checked on real pgvector (PGlite): the
  planner uses the partial index. New package `@sotto/storage` (presigned multipart, ListParts
  resume, presigned reads, JSON docs, one-file prefix delete) checked against an S3 server
  (moto). Contracts: `transcribe.progress`, richer requested/completed, stored transcript,
  pages and peaks documents, insights, file events (filter fields stripped for browsers).
  `AiModel` stays in Phase 6 with the catalog it serves.

- **M2 (sotto-api `9779b76`, CI green):** uploads (start, resume via ListParts, more part URLs,
  complete with a part and size check, abort); files (list with filters, title search, keyset
  cursors; get; rename, move, tags, pin, relabel; trash, restore, delete for good; retry;
  short-lived download links, audited when saved, not when played). Access in SQL
  (`fileVisibleTo` reusing `visibleTo`), unfiled like an open collection, only admins lower a
  file from Restricted, chunks follow moves and labels. Deleting a collection trashes its files,
  unfiled, visible only to owners and admins. `GET /events` (SSE) relays Redis events filtered per
  viewer. CI's test job now has Redis and SeaweedFS.
- **M3 (sotto-api `158b8c0`):** worker handlers (extract → pages.json → chunk → embed → READY;
  audio → checksum → transcription request; progress; transcript rows → time-window chunks →
  embed → notes → READY), retries with backoff, permanent failures with codes, dead-letter queue,
  hourly trash purge. OpenAI-compatible embedding and chat adapters (Ollama, vLLM, TEI) built
  from `provider:model` settings. Notes: the private chat model when configured, else labelled
  basic notes; Restricted only reaches in-cluster models.

- **M4 (sotto-api `d1cbb86`, `1e15db7`, `8b0275f`, `5aa7fd1`):** transcriber consumes
  `transcribe.requested` (aio-pika; the job runs in a thread so heartbeats continue), downloads
  the original, ffmpeg → 16 kHz mono WAV, engine, writes `transcript.json` and `peaks.json`,
  publishes progress and completion; bounded retries; problems with the recording come back as
  codes. Engines: faster-whisper (int8, VAD, `WHISPER_MODEL`, `/models` cache) fed 20-minute
  sample windows (CI's real-speech test caught faster-whisper 1.2.1's PyAV call breaking on
  PyAV 19; the engine no longer uses PyAV) and the labelled mock. Restricted recordings refused
  by engines outside the cluster. Waveform peaks scale to the 95th percentile (one click no
  longer flattens the waveform; found in the rendered player). Image: ffmpeg, `/models`.
- **M5 (sotto-api `606a7db`, `118eca1`):** `GET /files/:id/content`, `/transcript` (+ `q`:
  matching lines), `/insights`, `/peaks`; `PUT /files/:id/position`; `GET /continue-listening`;
  `GET /action-items` (recent meetings you can open, yours marked by first name or email name).
  Sample content is now real files (ADR 0013): memos through the pipeline; meetings with a
  transcript and hand-written sample notes, no audio (download says `NO_AUDIO`). Phase 3
  workspaces get the files on the next load.
- **M6–M8 (sotto-web `bfd3a92`, `bc795e0`, `24ee672`):** upload manager (`src/lib/uploads`):
  presigned multipart, 4 parts in flight, per-part retries with fresh URLs, pause/resume and
  resume on reconnect, cancel, 2 files at a time; ring on the + and New. + sheet, drag-and-drop
  and the palette upload into the collection on screen; viewers can't add (+ hidden). Recorder
  sheet (consent, live waveform, pause/resume, name, wake lock). Live status over `GET /events`
  patches every list; Ready/Failed toasts replace the Uploading toast. Docs, collections,
  document screen (page markers), Recently deleted (restore, confirmed delete for good); move,
  rename, label, tags, pin, download, retry sheets. Meetings and the meeting screen: waveform
  scrubber driven per frame on the compositor, speeds, skips, Media Session, remembered
  position, transcript follow-along / tap to seek / server search with match stepping, notes
  labelled honestly (sample, basic notes, model). Home widgets on real data. Stand-in file
  library for the shell E2E and Storybook.
- **Verified in the rendered app** (sandbox rig: the real api, worker handlers and Python
  transcription job on local Postgres 16, Redis and an S3 server; RabbitMQ replaced by an
  in-process dispatcher; mock transcription engine): sign up → onboarding with sample content
  (12 files through the pipeline); PDF uploaded from the + sheet straight to storage in parts →
  Ready toast → 4 pages shown with correct page numbers; a 95-second WebM recording imported →
  "Transcribing, 10%" live → Ready → plays from storage with the clock and waveform tracking,
  transcript tinting the playing line; leaving mid-play → Home's Continue listening shows the
  position. iPhone light and dark, desktop three panes. Found and fixed: transcript crash
  (shared cache key), stacked toasts, flat waveform, empty speaker slot.

## Work in progress

M9.

## Remaining work

- Done-when, measured: a 30-minute recording through the real stack (CI: RabbitMQ, the worker,
  the transcriber with faster-whisper, pgvector). The pieces are each tested (pipeline test:
  30-minute transcript → READY with correct times; real Whisper test: words at the right
  second), not yet the whole chain in one CI job.
- Compose (`sotto-platform/local`): S3 CORS for browser uploads, worker storage and AI settings,
  transcriber on the queue with a model volume, Ollama for embeddings. Demo config (default:
  labelled mock engines there until the owner decides capacity).
- ADRs 0016 (file access) and 0017 (pipeline and providers); UI_DESIGN_SYSTEM additions
  (progress ring, transfer row, waveform scrubber, time-gutter transcript); `pnpm smoothness`;
  stories for the new components; STATUS; PRs out of draft.

## Next steps

1. M9, sotto-platform `local/compose.yaml`: S3 CORS (SeaweedFS `-s3.allowedOrigins`, ETag
   exposed), `S3_PUBLIC_ENDPOINT`, worker `DATABASE_URL` + storage + `AI_EMBEDDINGS`, transcriber
   `RABBITMQ_URL` + storage + `/models` volume, an `ollama` service; Caddy route for `/s3/`.
2. M9, sotto-api CI: an `ingestion` job (Compose deps + RabbitMQ + worker + transcriber with
   faster-whisper tiny) uploading a PDF and a 30-minute recording through the API and waiting
   for READY with page and time checks.
3. M9 docs: ADRs 0016–0017, UI_DESIGN_SYSTEM, stories for TransferRow / ProgressRing /
   WaveformScrubber, smoothness run, STATUS, PRs ready.

## Decisions

Recorded as they're taken; the ones a later session must not undo become ADRs (0016 on).

- **File access (ADR 0016, to write):** a file follows its collection; unfiled files are visible
  to everyone, editable by their owner and admins; trashed unfiled files only by their owner and
  admins; deleting a collection trashes its files unfiled. Lowering from Restricted is admin-only.
  Permanent delete needs Manage, or ownership with Edit.
- **Queues keep their Phase 1 declarations** (durable, no arguments): redeclaring a live queue
  with new arguments fails, so dead-lettering is done by the worker (it parks messages in
  `sotto.dead`) rather than by queue arguments.
- **Vectors:** `chunk_embeddings` is model-agnostic; each model gets a partial HNSW index cast to
  its size, created the first time it's used. The first model ever used serves searches.
- **Chunks** never cross a page or a 90-second window, ~1,200 characters, one-sentence or
  one-line overlap. Non-PDF formats have no page numbers (citations show none).
- **Notes without a model** are rule-based and labelled ("basic notes"), never presented as AI.
- **Live events carry no titles**; the API filters them per viewer and strips the filter fields.
- **faster-whisper reads sample arrays**, 20-minute windows, never file paths (its PyAV
  dependency broke); the first window's language is kept.
- **Action items' "yours"** is a first-name / email-name match only, never a guess; ticks are
  kept on the device until action items are stored (labelled on Home).
- **Sample meetings have no audio**; the player says so and download answers `NO_AUDIO`.

## Missing specifications and outside dependencies

Identified, not invented around:

1. **Where an upload lands.** PLAN gives files an optional collection. Default taken: a file
   uploaded from inside a collection goes there; anywhere else it's unfiled. Unfiled files act
   like an open collection (everyone sees them; members edit their own, admins all). Move is
   always one swipe away.
2. **Document content.** The document screen needs the extracted text by page; PLAN lists no
   endpoint for it. Adding `GET /files/:id/content` (same access as the file).
3. **Insights need a chat model.** The demo server (t4g.medium, 4 GB) can't run a local LLM
   next to everything else. Insights use the Private chat provider when one is configured;
   without one they're a labelled mock ("Sample notes: no private model on this server").
   Phase 6 decides the demo's chat provider (open decision in STATUS).
4. **Demo capacity.** faster-whisper (`base`, int8) and Ollama embeddings add ~1 GB to a 4 GB
   server already using ~2.8 GB of limits. Needs the owner's decision before the demo runs real
   transcription: larger instance, or the labelled mock engine there.
5. **Browser uploads to S3** need a CORS rule on the bucket (Terraform; the owner applies it).
6. **Notes.** "New note" (+ sheet) has its API in Phase 5 (PLAN). It stays labelled.
7. **Speaker labels.** Diarization is Off by default (PLAN); transcripts show one voice until a
   `DiarizationProvider` is installed.

## Known issues

- The `accounts` CI job in sotto-web still fails: ECR has no `sotto/api` (owner's
  `terraform apply`, carried from Phase 3).
- The sandbox reaches npm and PyPI (Phase 3's didn't), but not Docker registries or Hugging
  Face: no pgvector, RabbitMQ or Whisper weights here. Real vectors, the queue and real
  transcription are exercised in CI (pgvector service, the smoke stack, models downloaded
  there); locally the pipeline is tested through its transport-independent handlers.

## Tests and checks run

| When                      | Check                                                                                                                                                                                     | Result |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `5c4e4f0` (M0)            | sotto-api build; unit tests (51; integration skipped, no DB)                                                                                                                              | Pass   |
| `c8bccdb` (M1)            | All three migrations on PGlite with real pgvector, pg_trgm, citext; vector helpers end to end (partial HNSW used, upsert, refusals)                                                       | Pass   |
| `c8bccdb` (M1)            | sotto-api lint, format, typecheck, build; db 17, storage 7 (multipart vs moto S3), contracts 8, api 59 (integration on local Postgres 16)                                                 | Pass   |
| `9779b76` (M2)            | api 82 tests (files: access matrix, formats, cursors; integration per role vs Postgres + moto S3 + Redis, incl. SSE filtering); lint; openapi                                             | Pass   |
| `9779b76` (M2)            | CI: node (with Redis + SeaweedFS), smoke, python, secrets, sync                                                                                                                           | Pass   |
| `158b8c0` (M3)            | worker 22 tests (real PDF pages + Word; chunking; notes; pipeline vs Postgres + S3: PDF → READY pages 1–3, 30-minute transcript → READY with correct times, failures, trash purge); ai 14 | Pass   |
| `1e15db7`–`5aa7fd1` (M4)  | transcriber 16 tests (every browser format through ffmpeg, peaks, jobs vs in-process S3, windowing); CI python job with real faster-whisper (tiny) on synthetic speech                    | Pass   |
| `606a7db`, `118eca1` (M5) | api 89 tests (meetings, content, sample files, action items, per role); worker 23                                                                                                         | Pass   |
| `5aa7fd1`                 | sotto-api CI: node, python (real Whisper), smoke, secrets, sync                                                                                                                           | Pass   |
| `bc795e0` (M6–M8)         | sotto-web lint, format, typecheck, 65 unit tests (upload engine with a fake transport, cache keys), production build                                                                      | Pass   |
| `24ee672`                 | `pnpm e2e` shell spec (iPhone + desktop): 8 passed, 6 layout-skipped; `pnpm test:stories`: 124 passed, light + dark, axe                                                                  | Pass   |
| `24ee672`                 | Rendered walkthrough vs the sandbox rig (see Completed work), iPhone light/dark and desktop                                                                                               | Pass   |
