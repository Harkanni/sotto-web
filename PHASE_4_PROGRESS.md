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
- **Current milestone:** M4.

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
| M1  | Schema + migration (files, meetings, chunks, vectors, FTS, Next tables); storage module (S3, presigning); contracts for the new messages              | sotto-api | pending |
| M2  | Uploads and Files API (access by collection, trash, retry, download), `GET /events` SSE, audit entries, integration tests per role, `openapi.json`    | sotto-api | pending |
| M3  | Worker pipeline: checksum, extraction (PDF pages, DOCX, TXT, MD), chunking, embeddings (Ollama + labelled mock), transcript ingest, insights, retries | sotto-api | pending |
| M4  | Transcriber: ffmpeg normalisation, faster-whisper engine, duration and waveform peaks, queue consumer, progress                                       | sotto-api | pending |
| M5  | Meetings API (transcript search, insights, position, continue listening, document content); sample content as real files                              | sotto-api | pending |
| M6  | Web: upload manager (multipart, progress, pause/resume, retry), real + sheet and drop, recorder, live status, + hidden for viewers                    | sotto-web | pending |
| M7  | Web: Docs and document screen on real files (filters, move, rename, tags, pin, sensitivity, trash)                                                    | sotto-web | pending |
| M8  | Web: Meetings and meeting screen (player, Media Session, position, transcript follow-along and search, insights); Home widgets on real data           | sotto-web | pending |
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

## Work in progress

M4: the transcriber.

## Remaining work

Everything from M1 on (table above).

## Next steps

1. M4 in sotto-api `services/transcriber`: mirror the new contracts in `app/contracts.py`; a
   queue consumer (transcribe.requested → download from S3 → ffmpeg to 16 kHz mono → engine →
   transcript.json + peaks.json → transcribe.completed, with transcribe.progress); a
   faster-whisper engine; Dockerfile with ffmpeg and a model cache; tests with the fake engine.

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

- The sandbox reaches npm and PyPI (Phase 3's didn't), but not Docker registries or Hugging
  Face: no pgvector, RabbitMQ or Whisper weights here. Real vectors, the queue and real
  transcription are exercised in CI (pgvector service, the smoke stack, models downloaded
  there); locally the pipeline is tested through its transport-independent handlers.

## Tests and checks run

| When           | Check                                                        | Result |
| -------------- | ------------------------------------------------------------ | ------ |
| `5c4e4f0` (M0) | sotto-api build; unit tests (51; integration skipped, no DB) | Pass   |
