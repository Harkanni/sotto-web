import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page } from '@playwright/test';
import type { Schemas } from '../src/lib/api/client';
import {
  STAND_IN_LIVE_FILE,
  STAND_IN_LIVE_LINES,
  standInLiveSession,
} from '../src/stories/live-fixtures';

type LiveSession = Schemas['LiveSession'];
type LiveSegment = Schemas['LiveSegment'];

/**
 * A stand-in for sotto-api's Listen routes, for the Listen e2e. It is the page's front door: it
 * answers the Listen routes itself and passes everything else to the app's own server, so the
 * page, its api and its event stream share one origin, as behind the real gateway. (Playwright
 * can't stream a stubbed response, and a request can't be sent to another host mid-flight.)
 * It keeps one call: numbered audio pieces in order (a repeat is accepted again, a gap is
 * refused), a made-up line per piece pushed to every open stream, and End. Like the api, a piece
 * is 16 kHz mono PCM16: 32 bytes a millisecond.
 */
export interface LiveApi {
  /** The front door: open the app here. */
  url: string;
  /** Bytes in each piece of audio received, in order of `seq`. */
  pieces: number[];
  /** Every `seq` sent, in the order the requests arrived (repeats included). */
  sent: number[];
  /** The `seq` each End arrived after (how many pieces had arrived). */
  endedAfter: number | null;
  session: LiveSession | null;
  close(): Promise<void>;
}

const LIVE_ID = 'ls_e2e';
const FILE_ID = 'f_live_e2e';

function body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on('data', (part: Buffer) => parts.push(part));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

/** Everything that isn't a Listen route goes to the app's server, streamed both ways. */
function passOn(req: IncomingMessage, res: ServerResponse, app: string): void {
  const target = new URL(req.url ?? '/', app);
  const out = request(target, { method: req.method, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  out.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(out);
}

function sse(res: ServerResponse, event: string, data: unknown, id?: string): void {
  res.write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function startLiveApi(app: string): Promise<LiveApi> {
  const streams = new Set<ServerResponse>();
  const segments: LiveSegment[] = [];
  const state: LiveApi = {
    url: '',
    pieces: [],
    sent: [],
    endedAfter: null,
    session: null,
    close: () =>
      new Promise((resolve) => {
        for (const res of streams) res.end();
        server.close(() => resolve());
      }),
  };
  const broadcast = (event: string, data: unknown, id?: string) => {
    for (const res of streams) sse(res, event, data, id);
  };
  const isOpen = (s: LiveSession | null) => s !== null && ['connecting', 'live'].includes(s.status);

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://stand-in');
      const path = url.pathname.replace(/^\/api\/v1\//, '');
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      const notFound = () =>
        json(404, { error: { code: 'NOT_FOUND', message: 'This live meeting doesn’t exist.' } });

      const ours = url.pathname.startsWith('/api/v1/live-sessions') || path === `files/${FILE_ID}`;
      if (!ours) return passOn(req, res, app);

      if (path === 'live-sessions' && req.method === 'POST') {
        const start = JSON.parse((await body(req)).toString('utf8')) as Schemas['StartLive'];
        state.session = standInLiveSession({
          id: LIVE_ID,
          status: 'connecting',
          inputs: start.inputs,
          startedAt: new Date().toISOString(),
          file: { ...STAND_IN_LIVE_FILE, id: FILE_ID, title: start.title ?? 'Call' },
        });
        return json(201, state.session);
      }
      if (path === 'live-sessions' && req.method === 'GET') {
        return json(200, { items: isOpen(state.session) ? [state.session] : [] });
      }

      if (path === `files/${FILE_ID}` && state.session) {
        return json(200, { ...state.session.file, durationMs: state.session.durationMs });
      }

      const match = /^live-sessions\/([^/]+)(?:\/(\w+))?$/.exec(path);
      if (!match || match[1] !== LIVE_ID || !state.session) return notFound();
      const sub = match[2];
      const session = state.session;

      if (!sub && req.method === 'GET') return json(200, session);

      if (sub === 'audio' && req.method === 'POST') {
        const seq = Number(url.searchParams.get('seq'));
        const bytes = (await body(req)).length;
        state.sent.push(seq);
        if (!isOpen(session)) {
          return json(409, { error: { code: 'LIVE_ENDED', message: 'This call has ended.' } });
        }
        if (seq < state.pieces.length) {
          return json(200, {
            accepted: false,
            nextSeq: state.pieces.length,
            durationMs: session.durationMs,
          });
        }
        if (seq > state.pieces.length) {
          return json(409, { error: { code: 'CHUNK_GAP', message: 'A piece is missing.' } });
        }
        state.pieces.push(bytes);
        const startMs = session.durationMs;
        const ms = bytes / 32;
        state.session = {
          ...session,
          status: 'live',
          durationMs: startMs + ms,
          nextSeq: seq + 1,
        };
        const line: LiveSegment = {
          id: `${seq}.0`,
          seq,
          idx: 0,
          startMs,
          endMs: startMs + ms,
          text: STAND_IN_LIVE_LINES[seq % STAND_IN_LIVE_LINES.length]!,
          speaker: null,
        };
        segments.push(line);
        if (seq === 0) broadcast('session', state.session);
        broadcast('segment', line, line.id);
        return json(200, {
          accepted: true,
          nextSeq: seq + 1,
          durationMs: state.session.durationMs,
        });
      }

      if (sub === 'events' && req.method === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write('retry: 1000\n\n');
        sse(res, 'session', session);
        // Resume after the last line this browser saw, like the api (Last-Event-ID).
        const [lastSeq, lastIdx] = String(req.headers['last-event-id'] ?? '-1.-1')
          .split('.')
          .map(Number);
        for (const s of segments) {
          if (s.seq > lastSeq! || (s.seq === lastSeq && s.idx > lastIdx!))
            sse(res, 'segment', s, s.id);
        }
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }

      if (sub === 'end' && req.method === 'POST') {
        state.endedAfter = state.pieces.length;
        state.session = {
          ...session,
          status: 'ended',
          endedAt: new Date().toISOString(),
          canControl: false,
          file: { ...session.file, status: 'uploaded', durationMs: session.durationMs },
        };
        broadcast('session', state.session);
        return json(200, { discarded: false, session: state.session });
      }

      return notFound();
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return state;
}

/**
 * Lets the page's Listen requests (and the meeting a call becomes) reach the front door: the
 * shell's stand-ins would otherwise answer them (nothing live; no such file). Register after
 * them: Playwright tries the newest route first.
 */
export async function routeLiveApi(page: Page): Promise<void> {
  await page.route('**/api/v1/live-sessions**', (route) => route.continue());
  await page.route(`**/api/v1/files/${FILE_ID}`, (route) => route.continue());
}
