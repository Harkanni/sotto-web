# Phase 7 progress — Live notetaker

The running record for Phase 7, kept current at every checkpoint. A new session follows the
recovery steps in [`CLAUDE.md`](CLAUDE.md), then continues from **Next steps** below.

The first half of the phase (M1–M5 part 1) is merged: sotto-api#10 and sotto-web#12 (branch
`feat/p7-live`), sotto-platform#10 (`docs/p7-status`), all on 2026-10-17. The rest of the phase
goes in one branch and PR per slice. From M6 on, this log is kept on `feat/p7-calendar` (the
web branch for M8, stacked on M5 part 2), so the PR in review doesn't change under the owner:

| Slice          | Repo           | Branch                            | Pull request              | State       |
| -------------- | -------------- | --------------------------------- | ------------------------- | ----------- |
| M5 part 2      | sotto-web      | `feat/p7-live-now`                | sotto-web#21              | in review   |
| M5 part 2      | sotto-platform | `docs/p7-live-now-status`         | sotto-platform#24         | in review   |
| M6             | sotto-api      | `feat/p7-notetaker`               | sotto-api#17 (draft)      | in progress |
| M7             | sotto-api      | `feat/p7-meet-bot` (later, on M6) | —                         | todo        |
| M8 and the log | sotto-web      | `feat/p7-calendar` (on M5 part 2) | sotto-web (draft)         | log only    |
| M6–M9          | sotto-platform | `feat/p7-bot` (on #24)            | sotto-platform#25 (draft) | ADR 0035    |

## Project status

- **Current phase:** 7 — Live notetaker. Phase 6 is merged in all three repos (sotto-api#7 and
  sotto-web#7 on 2026-10-10, sotto-platform#8 on 2026-10-12).
- **Overall:** started 2026-10-12. M1–M5 part 1 merged on 2026-10-17; CI/CD is back on GitHub
  Actions (ADR 0034) and all three repos are public.
- **Current milestone:** M6 (api: calendar connections, sending the bot, the signed webhook;
  sotto-api#17). M5 part 2 is in review (sotto-web#21).

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

**Deviation from PLAN, recorded as ADR 0028:** audio goes up as numbered HTTP chunks and the
transcript comes down over SSE, not a WebSocket. Next's rewrites (local and the demo's same-origin
path) don't proxy WebSocket upgrades; the api has no WebSocket library and none could be added at
the time (CI's `sync` job was blocked); and numbered chunks make a dropped connection a retry, not
a lost minute. Latency stays a few seconds, which is what the per-window transcriber gives anyway.

| #   | Milestone                                                                                                                      | Repo      | State                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------- | ----------------------- |
| M0  | Recovery; requirements and plan (this log); branches and draft PRs                                                             | all       | done                    |
| M1  | Schema + migration: LiveSession, CalendarConnection, BotAssignment, enums, `FileSource` LIVE and BOT; contracts                | sotto-api | done                    |
| M2  | Listen API: start, numbered audio chunks, transcription per window, SSE stream, end → meeting file; tests per role             | sotto-api | done                    |
| M3  | Live notes and action items on a timer (policy-aware); ask mid-call                                                            | sotto-api | done                    |
| M4  | Web: Listen entry, consent, mic + tab capture, PCM worklet, resilient uploader                                                 | sotto-web | done                    |
| M5  | Web: live screen (transcript, notes, ask), stop → meeting; stories, unit, e2e, smoothness, rendered checks                     | sotto-web | done (part 2 in review) |
| M6  | API: `MeetingBotProvider` + calendar providers (labelled stand-ins), calendar and bot routes, signed webhook, admin bot switch | sotto-api | todo                    |
| M7  | Self-hosted Meet bot service (headless browser joins, announces, streams audio to a live session)                              | sotto-api | todo                    |
| M8  | Web: calendar screen (upcoming calls, Send notetaker, auto-join), admin bot switch                                             | sotto-web | todo                    |
| M9  | Compose and demo config; ADRs; STATUS; verification in the rendered app; PRs ready                                             | all       | todo                    |

## Completed work

- **M0:** recovered from `docs/STATUS.md` (main still says Phase 5; the Phase 6 STATUS lives in
  the open sotto-platform#8) and `PHASE_6_PROGRESS.md`. Phase 6 merged in sotto-api#7 and
  sotto-web#7. Read CLAUDE.md (all repos), `UI_DESIGN_SYSTEM.md`, PLAN (Live notetaker, data
  model, API, milestones). Inspected what Phase 7 builds on: the transcriber (`POST
/v1/transcribe` direct endpoint, engine registry, fake engine labelled `isMock`), uploads
  (`File` created at start, `fileUploaded` queued on complete), `GET /events` (Redis fan-out,
  per-viewer filtering), the worker's insights, the web recorder sheet and meetings screens.

- **M1 (sotto-api `1bf87e1`):** `LiveSession` (source, status, `inputs`, `nextSeq` for numbered
  chunks, `durationMs`, rolling `notes` with `notesAt`/`notesModel`, `error`), `LiveSegment`
  (live transcript per chunk: `seq`, `idx`, times, text, speaker), `CalendarConnection`
  (provider incl. `sample` for the stand-in, refresh token envelope-encrypted like BYOK keys,
  scopes, `autoJoin`), `BotAssignment` (`BotStatus` SCHEDULED → JOINING → IN_CALL → DONE,
  SKIPPED, FAILED; one per event per connection; `liveSessionId`), `MeetPlatform`,
  `FileSource` LIVE and BOT, `Workspace.meetingBots`. Migration
  `20261012100000_live_notetaker` with CHECKs. Four new tenant models. openapi: file source
  `live`, `bot`. Draft PRs: sotto-api#10, sotto-web#12, sotto-platform#10 (STATUS says Phase 7
  is in progress and flags the ADR 0023 clash).

- **M2 (sotto-api `adfc383`, `ad3b1d8`, `d6bfbb9`):** storage `keys.liveChunk` and
  `putFromPieces` (streamed multipart join). `apps/api/src/live/`: `audio.ts` (16 kHz mono
  PCM16, 32 bytes/ms, WAV header, limits: 15 s chunks, 2 min ahead of real time, 10 min idle
  end, 6 h max), `transcriber.ts` (`LiveTranscriber` → transcriber `POST /v1/transcribe`,
  `GET /v1/engines` cached a minute except for Restricted), `live.hub.ts` (Redis
  `sotto:live:<id>`, snapshot-then-live with no gaps or repeats), `live.service.ts`,
  `live.controller.ts` (routes below), `schemas.ts`. `TRANSCRIBER_URL` setting. Routes:
  `POST /live-sessions`, `GET /live-sessions`, `GET /live-sessions/:id`,
  `POST /live-sessions/:id/audio?seq=n` (application/octet-stream),
  `GET /live-sessions/:id/events` (SSE: `session`, `segment` id `seq.idx`, `notes`, `ping`),
  `POST /live-sessions/:id/end` → `{discarded, session}`. End audits `file.recorded` with
  `live: true`. Transcriber: `in_cluster_only` form field → 409 on an outside engine.
- **Decision (from the tests): a live capture is private to the person listening until it's
  saved.** Its file is UPLOADING, and ADR 0016 makes an arriving file its sender's alone (admins
  included). That's the right default for a call being recorded; once saved it's an ordinary
  meeting with the usual access. Watching from another screen (phone + laptop) works.
- **Fixed (found by the tests):** a Restricted chunk could reach a transcriber engine moved
  outside the cluster within the minute the engine info was cached.

- **M3 (sotto-api `00061de`, `5008c97`, `e94d627`):** `live/notes.ts` + `LiveNotesService`:
  running notes `{summary, points, actions}` after the first minute of transcript, then every
  two minutes when something new was said (or `POST /live-sessions/:id/notes`, the person
  listening), with the workspace's default model under Ask's privacy rules; a reason in
  `notesError` (`no_model`, `model_unavailable`, `restricted_private_only`,
  `confidential_not_allowed`, `quota`, `unreadable`, `failed`) instead of another model.
  Notes carry `routeLabel`, `isMock`, `private`. `live_sessions.notes_error` edited into the
  unmerged migration. Ask: scope `liveSessionId` (the transcript so far as ~45 s stretches,
  cited by moment, chunk id null, the meeting's sensitivity applies); `POST
/live-sessions/:id/ask` → `{conversationId}`; questions use `POST
/conversations/:id/messages`.

- **M4 (sotto-web `eb3449c`, `5806e9f`, `41925a0`):** API client synced.
  `src/lib/live/pcm-worklet.ts` (AudioWorklet source: mono mix, 16 kHz by window averaging,
  ~4 s PCM16 chunks, level, pause/resume/flush), `uploader.ts` (`ChunkUploader`: order,
  backoff, offline wait, gap re-sync and renumbering, end/fatal, ~32 min offline cap),
  `capture.ts` (mic + desktop-Chromium tab audio through a muted gain), `store.ts` (one capture
  per device outside any screen; permissions before the session; pause/resume clock; wake
  lock; leave-page guard; Stop drains then ends). `src/lib/api/live.ts` (queries,
  `useLiveStream` SSE into the cache, `sendLiveChunk`, sentences for `notesError` and session
  errors). UI: Add to Sotto's full-width Listen tile, `components/live/listen-sheet.tsx`,
  `live-parts.tsx` (level canvas, clock, status dot), `screens/live.tsx` (route kind `live`,
  `/meetings/live/<id>`), the listening strip in the offline strip's slot
  (`components/shell/system.tsx`). Unit tests `test/live.test.ts` (11).

- **M5, part 1 — rendered and checked** (rig: Postgres, Redis, RabbitMQ, moto S3, SMTP sink,
  the real transcriber with the mock engine, a stand-in model, api + worker from `dist`, web
  from `next build`, Chromium's fake microphone): iPhone light and dark, desktop light. Add
  sheet → Listen sheet → Start → live screen (transcript arriving every ~4 s, Mock labelled) →
  notes after a minute (Private route badge) → the listening strip on Home → Ask about this
  call → an answer citing the call at 0:00 → Pause → Stop → the saved meeting, Ready with
  player, transcript and notes within seconds. **PLAN's first "done when" (a live call is
  transcribed as it happens) holds in the rendered app.** Fixed from the screenshots: the +
  button covering the controls and chat composers (now hidden on chats and the live screen),
  captions out of line, doubled gutters in two sheets, a wrapping header, a truncated tile
  hint, the title style (now the meeting heading's), a dim live dot and low-contrast pills in
  dark mode.

- **M5, part 2 (sotto-web#21, `feat/p7-live-now`; companion sotto-platform#24):**

  - Done: the log brought up to date with `main`; draft PRs sotto-web#21 and sotto-platform#24.
  - Done (code and unit tests; not yet looked at in the rendered app): **Live now**.
    `src/lib/live/now.ts` (`liveNowItems`: the api's open calls plus the one this device is
    capturing before the list catches up; `useLiveNow`, which refetches when this device starts or
    stops), `src/screens/parts/live-now.tsx` (`LiveNowList`/`LiveNowRow`: the recording icon, the
    title, and `LiveStatus`: "Listening 12:34" ticking for this device's call, "Live, started
    08:35" for a call elsewhere, "Notetaker in the call" for a bot), on top of Meetings (footnote
    label like the day groups; the empty state stays away while a call is live) and first on
    Home (a `Section`, shown only while something is live). `useFileEvents` refreshes the list on
    file events that start or end an arrival (`startsOrEndsArriving`) and on reconnect. A list
    row whose link switches tab is no longer left highlighted (Home's row opens the call on
    Meetings; only a pop cleared the highlight). Unit tests: `test/live.test.ts` (+8).
  - Done: **stories**. `Components/Live` (`src/components/live/live.stories.tsx`: status in every
    phase, the level bars, the Listen sheet, Live now rows, notes in three states, every notice,
    another screen) and `Screens/Live` (`src/screens/live.stories.tsx`, phone: listening, first
    seconds, paused, notes, another screen, Ask during the call), composed from the live screen's
    own parts (now exported) inside the real `Screen`, because the story tests fail on any 4xx
    and the screen's event stream would 404 in Storybook. Stand-in data:
    `src/stories/live-fixtures.ts` (plain data; also answers `GET /live-sessions` with nothing
    live for the shell e2e and Storybook) and `src/stories/live-levels.ts` (deterministic
    speech-like levels). `LiveLevel` takes a level source and `LiveHeading` an optional clock.
    **Fixed (found by the story tests):** the transcript's Mock label failed AA in light mode (a
    fill pill on the page background); it's the shared `Badge` now, like "Sample".
  - Done: **e2e** `e2e/listen.spec.ts` (iPhone and desktop): Chromium's fake microphone feeds the
    real capture; Add → Listen → consent → Start → the live screen → the first line → axe → on a
    phone Home's Live now row and the strip lead back, on a desktop the row is selected beside the
    call → a second piece → Stop → the saved meeting; the api saw every piece once, in order, all
    before End. The stand-in api (`e2e/live-api.ts`) is the page's **front door**: it answers the
    Listen routes and passes everything else to the app's server, because Playwright can't
    stream a stubbed response and `route.continue` can't send a request to another host (tried:
    "Failed to fetch"). The shell's stand-in helpers moved to `e2e/stand-in.ts` (`open` takes
    extra routes and a base address). **Fixed (found by the e2e):** `useChildKey` listed the item
    kinds by hand without `live`, so the open call's row was never selected on desktop; it's
    `childKey()` in `routes.ts` now, from `ITEM_KINDS`, with unit tests.
  - Done: a Live now row **loads its call on intent** (pointer-down, hover, focus:
    `usePrefetchLiveSession`, sharing `useLiveSession`'s query), so the live screen is pushed onto
    its content. `pnpm smoothness` now has a call live (`standInLiveRoute(url, { live: true })`)
    and measures switching to Meetings with it, pushing the live screen from its row, going back,
    and Home with Live now; a live call and its event stream count as the screen's body.
  - Done: **rendered checks** (the built app, Chromium's fake microphone, the e2e's front door;
    iPhone and desktop, light and dark): the Listen sheet, the live screen (Mock badge, level,
    controls in reach, no + button), Meetings with Live now on top and the listening strip,
    Home with Live now first, the desktop list pane's row selected beside the call.
  - Done: **`pnpm smoothness`** (4×, iPhone): the new steps (switch to Meetings with a call live,
    push the live call, back, Home with Live now) 33 ms worst frame each, no network; the push
    loads the call and its stream as body. The Docs steps sit within `main`'s spread measured
    on the same sandbox the same hour (`main`: 7 steps over two frames, worst 133 ms; this
    branch: 5, worst 83 ms; ±2 frames between runs, as in Phase 4).
  - Done: **`UI_DESIGN_SYSTEM.md`**: the Listen section (tile, sheet, status, level, live screen,
    transcript, notes, notices, strip, Live now, Ask during the call), motion rows (live dot,
    level, new lines), the + button stepping aside, the transcript as a polite live region.

## Work in progress

M6 on `feat/p7-notetaker` (sotto-api#17, draft; companion sotto-platform#25 with ADR 0035):

- Done: the design, as ADR 0035 (proposed; Decisions below has the short version).
- Done: `BotJob`, the bot's job contract in `packages/ai` (`MeetingBotProvider.join(job)`:
  assignment, meeting link, the bot's name and chat announcement, where to report and send
  audio, the token, leave by); `apps/api/src/notetaker/signing.ts` (bot tokens
  `<assignment>.<expires>.<sig>`; webhook signatures over `<timestamp>.<raw body>`, five minutes
  either way; separate prefixes so neither passes for the other); unit tests
  `apps/api/test/notetaker.spec.ts` (5).
- Next: calendar providers (`apps/api/src/notetaker/calendars.ts`: `google`, `microsoft`,
  `sample`, with `fetch` injected so unit tests stub Google and Microsoft), then the calendar
  service and routes (Next steps → 1).

## Remaining work

M6–M9 (the milestone table above).

## Next steps

1. M6 (sotto-api, new branch `feat/p7-notetaker` from `main`, draft PR, STATUS companion):
   read PLAN (Swappable AI providers → Meeting bot; API → Calendar and bot; Data model) and the
   M1 schema (`CalendarConnection`, `BotAssignment`, `Workspace.meetingBots`). Build
   `MeetingBotProvider` and `CalendarProvider` in `packages/ai` with labelled stand-ins
   (`sample`), the routes (`POST /calendar/connect/:provider`, `GET /calendar/events`,
   `PUT /calendar/events/:id/bot`, `PATCH /calendar/settings`, `POST /webhooks/meeting-bot`
   signed), the admin bot switch (audited), integration tests per role, `pnpm openapi`.
2. M7: the self-hosted Meet bot (headless browser joins as "Sotto Notetaker", announces in the
   chat, streams audio into a live session); ADR 0035.
3. M8 (sotto-web): the calendar screen, Send notetaker, auto-join, the admin switch.
4. M9: Compose and demo config, STATUS, verification in the rendered app, PRs ready.
5. The rendered-check rig from M5 part 1 (the real api) is gone; rebuild it from its parts
   (Completed work → M5) on top of the integration services (Tests and checks run) before M8's
   rendered checks.

## Decisions

- **One branch per repo** for the phase, as in Phases 4–6.
- **Chunks over HTTP + SSE instead of a WebSocket** (above; ADR 0028).
- **The live transcript is a preview.** On End the joined recording goes through the normal
  pipeline, so the saved meeting gets the full-quality transcript, peaks and insights; live
  chunks can cut a word at a boundary.
- **ADRs:** 0028 (live audio over HTTP chunks + SSE) and 0029 (a live capture is private until
  saved) are merged. `main` now runs to 0034 (GitHub Actions CI/CD, 2026-10-17), so the bot's
  ADR takes 0035.
- **One branch and PR per slice for the rest of the phase** (2026-10-17): the phase branches
  merged with M1–M5 part 1, so each remaining slice starts from `main` (table at the top).
- **Live now has no empty state** (M5 part 2): it's news, shown only while a call is live, like
  the sample notice; nothing live means nothing on Home, and Meetings starts with its day
  groups. If it can't load it stays away too: the listening strip still leads back to a call
  this device is capturing.
- **The live screen always lives on Meetings' stack**, whichever tab opened it (the strip, Home's
  Live now row, the Listen sheet): pushing it on Home would leave Home remembering a call that
  ended, which then bounces to the meeting whenever Home is opened.
- **The notetaker (ADR 0035, proposed; M6–M7).** Calendars are read through the sign-in apps'
  OAuth (read-only calendar scope, offline), run by the api itself with a single-use state bound
  to the person; refresh tokens are sealed with the BYOK vault. A `sample` calendar (labelled)
  stands in until the owner's OAuth apps exist. The bot is sent per event or by auto-join; a
  scheduler claims due assignments atomically and calls `MeetingBotProvider.join` a minute
  early. **One ingest path:** once let in, the bot reports `in_call` on the signed webhook, the
  api starts a BOT live session for the sender, and the bot sends audio to the same
  `POST /live-sessions/:id/audio` as Listen with `Authorization: Bot <token>` (that session only,
  acting as its sender, no CSRF). `left`/`failed` end the session and save the meeting.
  Providers: `sample` (in the api, labelled, sends made-up audio through the real path) and
  `meet` (M7, its own service at `MEET_BOT_URL`); `MEETING_BOT` picks, unset = unavailable.
  Admins' `meetingBots` off stops joins and asks bots in calls to leave.
- **The Listen e2e's stand-in api is the page's front door** (`e2e/live-api.ts`), not a
  `page.route` stub: the event stream must stream, and a route can't. Other e2e stay on
  `page.route`.

## Missing specifications and outside dependencies

1. ~~GitHub Actions blocked by billing~~ No longer applies: CI runs on GitHub Actions again,
   free now that the repos are public (ADR 0034), and the sandbox reaches npm, so a dependency
   can be added with `pnpm install` and its lockfile change.
2. **Google and Microsoft OAuth apps** (Phase 3 blocker) are needed to connect a real calendar.
   Until they exist, calendar runs on a labelled stand-in.
3. **A Google account for the bot.** Meet lets a signed-out guest ask to join; hosts must admit
   it. A workspace account for "Sotto Notetaker" is the owner's choice.

## Known issues

- The sotto-api `dev-cache` snapshot for the current manifests doesn't exist (the last `sync`
  ran before `reindex` was added to `apps/worker/package.json`, a script-only change). Restored
  the previous snapshot, whose dependencies are identical.
- This sandbox has Node 22 (the repos ask for 24). npm, PyPI and the Ubuntu mirror are reachable
  (2026-10-16); Docker Hub and `binaries.prisma.sh` are not. So `pnpm install --frozen-lockfile`
  works, but `prisma generate` can't fetch its schema engine: copy
  `node_modules/.pnpm/@prisma+engines@7.10.0/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x`
  from the newest `dev-cache` snapshot (`node_modules-linux-x64-621d8c1534f2035a.tar.gz`, same
  Prisma build `0edf323`). Run `pnpm build` before `typecheck` and `test`: the apps import the
  packages' `dist`.

## Tests and checks run

sotto-api's integration tests in this sandbox (no Docker images): `apt-get install
postgresql-16-pgvector`, then a throwaway cluster (`initdb -U sotto --auth=trust`, port 5544),
`redis-server --port 6399`, `moto_server -p 5599` (`pip install 'moto[server]'`, bucket
`sotto-test`), and
`REDIS_URL=redis://127.0.0.1:6399 AWS_REGION=eu-west-2 AWS_ACCESS_KEY_ID=ci AWS_SECRET_ACCESS_KEY=ci S3_FORCE_PATH_STYLE=true TEST_DATABASE_URL=postgresql://sotto@127.0.0.1:5544/postgres TEST_S3_ENDPOINT=http://127.0.0.1:5599 REQUIRE_INTEGRATION=1 pnpm test`.
Postgres 16 and pgvector 0.6 here; CI and the demo run 18, so Jenkins stays the final word.

| When       | Check                                                                                                                                                | Result |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-10-16 | sotto-api `feat/p7-live` after merging `main`: lint, format, typecheck, unit tests, build, `pnpm openapi` (no drift)                                 | pass   |
| 2026-10-16 | sotto-api integration (Postgres 16 + pgvector, Redis, moto): api 223/223 (live 11, live notes 12), worker 29/29, storage 14/14                       | pass   |
| 2026-10-16 | sotto-web `feat/p7-live` after merging `main`: lint (0 errors), format, typecheck, unit 91/91, build                                                 | pass   |
| 2026-10-16 | sotto-web e2e (`CI=true`): 28 passed, 20 skipped (accounts flow without an api; one-layout tests)                                                    | pass   |
| 2026-10-16 | sotto-web `build-storybook` + `test:stories` (`CI=true`): 170/170                                                                                    | pass   |
| 2026-10-17 | sotto-web `feat/p7-live-now` (Live now): lint (0 errors), format, typecheck, unit 99/99                                                              | pass   |
| 2026-10-17 | sotto-web `feat/p7-live-now`: `build-storybook` + `test:stories` (`CI=true`): 200 passed (2 retried: trace files clashing with a parallel run)       | pass   |
| 2026-10-17 | sotto-web e2e (`CI=true`): 30 passed (Listen: iPhone and desktop), 20 skipped (as before)                                                            | pass   |
| 2026-10-17 | sotto-web unit 102/102 (`childKey` +3), lint (0 errors), format, typecheck, build                                                                    | pass   |
| 2026-10-17 | sotto-web `pnpm smoothness` 4× (built app): live steps ≤ 33 ms, network 0; Docs steps within `main`'s spread (main measured the same hour)           | pass   |
| 2026-10-17 | sotto-web rendered checks (built app, fake microphone): iPhone and desktop, light and dark: Listen sheet, live screen, Live now on Meetings and Home | pass   |
