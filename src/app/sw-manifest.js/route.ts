import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Tells the service worker (public/sw.js) which files make up this build, and its version.
 *
 * Generated on request from the build's own static folder, so it can never drift from what the
 * server actually serves. Every build has content-hashed file names, so a new build means a new
 * list, a new version, and a service-worker update.
 */
export const dynamic = 'force-dynamic';

// Always fetched by the worker; never needed offline.
const SKIP = /(_buildManifest|_ssgManifest|_clientMiddlewareManifest)\.js$/;

// Shown before anything else loads: the manifest, icons and the offline-capable start page.
const ALWAYS = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/favicon.ico',
  '/apple-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

async function files(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? files(join(dir, e.name), `${prefix}${e.name}/`)
        : Promise.resolve([`${prefix}${e.name}`]),
    ),
  );
  return nested.flat();
}

let script: Promise<string> | null = null;

async function build() {
  const assets = (await files(join(process.cwd(), '.next/static')))
    .filter((f) => !SKIP.test(f))
    .sort()
    .map((f) => `/_next/static/${f}`);
  const version = createHash('sha256')
    .update(process.env.APP_VERSION ?? 'dev')
    .update(assets.join('\n'))
    .digest('hex')
    .slice(0, 12);
  const manifest = { version, precache: [...assets, ...ALWAYS] };
  return `self.SOTTO = ${JSON.stringify(manifest)};\n`;
}

export async function GET() {
  // The build never changes under a running server: work it out once.
  script ??= build();
  return new Response(await script, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // The browser compares this byte for byte on every update check.
      'Cache-Control': 'no-cache',
    },
  });
}
