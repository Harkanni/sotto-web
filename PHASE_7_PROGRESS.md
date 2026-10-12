# Phase 7 progress — Live notetaker

The running record for Phase 7, kept current at every checkpoint. A new session follows the
recovery steps in [`CLAUDE.md`](CLAUDE.md), then continues from **Next steps** below.

| Repo           | Branch           | Pull request                                                 |
| -------------- | ---------------- | ------------------------------------------------------------ |
| sotto-api      | `feat/p7-live`   | sotto-api (draft; merges first)                              |
| sotto-web      | `feat/p7-live`   | sotto-web (draft)                                            |
| sotto-platform | `docs/p7-status` | sotto-platform (draft; companion, based on `docs/p6-status`) |

## Project status

- **Current phase:** 7 — Live notetaker. Phase 6 is merged in sotto-api (`75b1ded`, after #7)
  and sotto-web (`9311455`, after #7). sotto-platform#8 (Phase 6 STATUS, ADRs 0023–0027) and
  sotto-platform#9 (Jenkins, ADR 0023) are still open, so `docs/p7-status` branches from
  `docs/p6-status`.
- **Overall:** started 2026-10-12.
- **Current milestone:** M0.

## Requirements

Sources: `sotto-platform/docs/PLAN.md` (Live notetaker; Swappable AI providers → Meeting bot;
Data model → Live notetaker; API → Live Listen, Calendar and bot; Milestones row 7; Open
decision 4, "build the Meet bot ourselves"), `BRIEF.md` §8–9 (UI rules), STATUS → Open decisions
("Meeting bot — default: build the Google Meet bot ourselves (Phase 7)").

**Done when** (PLAN): a live call is transcribed as it happens, and the bot joins a Meet call.

**Listen mode (in the app), built first**

- Tap Listen during any call. Sotto captures the microphone and, on desktop Chrome or Edge, the
  call's tab or system audio too.
- The transcript appears live; notes and action items refresh every few minutes.
- Ask questions mid-call against what's been said so far plus the library.
- Stopping turns it into a normal meeting file (player, transcript, insights, searchable).
- Works with Zoom, Meet, Teams, a phone on speaker or in person; needs no platform approval.
- A recording reminder before Listen starts (consent laws differ by country).

**Notetaker bot**

- Connect a Google or Microsoft calendar with the same sign-in as Phase 3; Sotto joins calls as a
  participant named "Sotto Notetaker", records and transcribes live, and posts the summary when
  the call ends.
- Behind `MeetingBotProvider` (`meetings.bot`): first adapter a self-hosted Google Meet bot (a
  headless browser; one Kubernetes Job per meeting once Phase 9's cluster exists). Zoom and
  Teams later (self-built or a paid hosted bot API: ask first).
- Consent: the bot's name is visible and it posts an announcement in the meeting chat; workspace
  admins can turn bots off.

**API (PLAN)**

- Live Listen (Member+): `POST /live-sessions` · `WS /live-sessions/:id/stream` (audio in, live
  transcript and notes out) · `POST /live-sessions/:id/ask` · `POST /live-sessions/:id/end`.
- Calendar and bot (Member+): `POST /calendar/connect/:provider` · `GET /calendar/events` ·
  `PUT /calendar/events/:id/bot` · `PATCH /calendar/settings` (auto-join) ·
  `POST /webhooks/meeting-bot` (signed callbacks).
- Data model: `LiveSession` (LISTEN | BOT; CONNECTING, LIVE, ENDED, FAILED), `CalendarConnection`
  (encrypted refresh token, scopes, auto-join), `BotAssignment` (event, meeting URL, platform
  MEET | ZOOM | TEAMS, status, provider reference, join time).

**Carried rules** — tenancy through the scoped client; access and sensitivity in SQL; audit for
settings; no content in logs; Restricted never reaches outside AI; no silent fallback; label every
mock; the UI held to `UI_DESIGN_SYSTEM.md` on iPhone and desktop, light and dark.

## Plan

How Listen works after Phase 7:

```
web  Listen sheet: consent → getUserMedia (mic) [+ getDisplayMedia tab audio, desktop Chromium]
     AudioWorklet mixes and downsamples to 16 kHz mono PCM16; one chunk every ~4 s, numbered
     POST /live-sessions                         → session + a meeting File (status LIVE-ish)
     POST /live-sessions/:id/audio?seq=n  (PCM)  → stored, transcribed in order, idempotent per n
     GET  /live-sessions/:id/events (SSE)        ← segments, notes, status (resumes by Last-Event-ID)
     POST /live-sessions/:id/ask                 → a normal Ask chat with the transcript so far
     POST /live-sessions/:id/end                 → chunks joined into one WAV → normal pipeline
api  each chunk → transcriber POST /v1/transcribe (in-cluster engine) → segments offset by time
     every few minutes → notes + action items from the transcript with the workspace's model,
     under the same privacy rules as Ask (a Restricted session only uses Private models)
```

**Deviation from PLAN, to record as an ADR:** audio goes up as numbered HTTP chunks and the
transcript comes down over SSE, not a WebSocket. Next's rewrites (local and the demo's same-origin
path) don't proxy WebSocket upgrades; the api has no WebSocket library and none can be added while
CI's `sync` job is blocked; and numbered chunks make a dropped connection a retry, not a lost
minute. Latency stays a few seconds, which is what the per-window transcriber gives anyway.

| #   | Milestone                                                                                                                      | Repo      | State       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------- | ----------- |
| M0  | Recovery; requirements and plan (this log); branches and draft PRs                                                             | all       | in progress |
| M1  | Schema + migration: LiveSession, CalendarConnection, BotAssignment, enums, `FileSource` LIVE and BOT; contracts                | sotto-api | todo        |
| M2  | Listen API: start, numbered audio chunks, transcription per window, SSE stream, end → meeting file; tests per role             | sotto-api | todo        |
| M3  | Live notes and action items on a timer (policy-aware); ask mid-call                                                            | sotto-api | todo        |
| M4  | Web: Listen entry, consent, mic + tab capture, PCM worklet, resilient uploader                                                 | sotto-web | todo        |
| M5  | Web: live screen (transcript, notes, ask), stop → meeting; stories, unit, e2e, smoothness, rendered checks                     | sotto-web | todo        |
| M6  | API: `MeetingBotProvider` + calendar providers (labelled stand-ins), calendar and bot routes, signed webhook, admin bot switch | sotto-api | todo        |
| M7  | Self-hosted Meet bot service (headless browser joins, announces, streams audio to a live session)                              | sotto-api | todo        |
| M8  | Web: calendar screen (upcoming calls, Send notetaker, auto-join), admin bot switch                                             | sotto-web | todo        |
| M9  | Compose and demo config; ADRs; STATUS; verification in the rendered app; PRs ready                                             | all       | todo        |

## Completed work

- **M0:** recovered from `docs/STATUS.md` (main still says Phase 5; the Phase 6 STATUS lives in
  the open sotto-platform#8) and `PHASE_6_PROGRESS.md`. Phase 6 merged in sotto-api#7 and
  sotto-web#7. Read CLAUDE.md (all repos), `UI_DESIGN_SYSTEM.md`, PLAN (Live notetaker, data
  model, API, milestones). Inspected what Phase 7 builds on: the transcriber (`POST
/v1/transcribe` direct endpoint, engine registry, fake engine labelled `isMock`), uploads
  (`File` created at start, `fileUploaded` queued on complete), `GET /events` (Redis fan-out,
  per-viewer filtering), the worker's insights, the web recorder sheet and meetings screens.

## Work in progress

M0: committing this log, pushing branches, opening draft PRs.

## Remaining work

M1–M9 above.

## Next steps

1. Push `feat/p7-live` (api, web) and `docs/p7-status` (platform); open draft PRs.
2. M1: schema in `packages/db/prisma/schema.prisma` (models from PLAN → Live notetaker, plus
   `FileSource` LIVE and BOT), migration `2026101210000_live_notetaker`, contracts.

## Decisions

- **One branch per repo** for the phase, as in Phases 4–6.
- **Chunks over HTTP + SSE instead of a WebSocket** (above; ADR to write in M9).
- **The live transcript is a preview.** On End the joined recording goes through the normal
  pipeline, so the saved meeting gets the full-quality transcript, peaks and insights; live
  chunks can cut a word at a boundary.
- **ADR numbers start at 0028.** sotto-platform#8 uses 0023–0027 and sotto-platform#9 also
  uses 0023 (Jenkins): the owner renumbers one of them when merging (STATUS says so).

## Missing specifications and outside dependencies

1. **GitHub Actions is still blocked by billing** (since 2026-10-10). No dependency can be added
   (the `sync` job publishes `node_modules` for this sandbox), so Phase 7 uses what's installed.
2. **Google and Microsoft OAuth apps** (Phase 3 blocker) are needed to connect a real calendar.
   Until they exist, calendar runs on a labelled stand-in.
3. **A Google account for the bot.** Meet lets a signed-out guest ask to join; hosts must admit
   it. A workspace account for "Sotto Notetaker" is the owner's choice.

## Known issues

- The sotto-api `dev-cache` snapshot for the current manifests doesn't exist (the last `sync`
  ran before `reindex` was added to `apps/worker/package.json`, a script-only change). Restored
  the previous snapshot, whose dependencies are identical.
- This sandbox has Node 22 (the repos ask for 24) and no npm registry.

## Tests and checks run

| When | Check | Result |
| ---- | ----- | ------ |
