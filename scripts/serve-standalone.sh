#!/bin/sh
# Serves the production build the way the image does (Dockerfile, runtime stage): Next's
# standalone server, with the static assets and public files copied beside it. `next start`
# warns that it "does not work" with `output: 'standalone'`; this is what actually ships, so
# it's what the browser tests should run against.
#
# Usage, after `pnpm build`: scripts/serve-standalone.sh [port]   (default 3000)
set -e

out=.next/standalone
if [ ! -f "$out/server.js" ]; then
  echo "No standalone build in $out: run pnpm build first." >&2
  exit 1
fi

# Fresh copies: a previous run's files would mix with this build's hashed assets.
rm -rf "$out/.next/static" "$out/public"
cp -R .next/static "$out/.next/static"
cp -R public "$out/public"

# HOSTNAME explicitly: the server binds to it, and many shells set it to the machine's name.
# 0.0.0.0 as in the image.
PORT="${1:-3000}" HOSTNAME=0.0.0.0 exec node "$out/server.js"
