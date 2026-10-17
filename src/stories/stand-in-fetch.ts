/**
 * Storybook only, imported first in .storybook/preview.tsx: the API client captures `fetch`
 * when it's created, so the stand-in library must be in place before any module loads it.
 * Answers the file, chat, search and live-call routes from the stand-in fixtures, so every story sees the
 * same library however it queries it. Anything else goes to the real fetch.
 */
import { standInAskRoute } from './ask-fixtures';
import { STAND_IN_FILES, standInFileRoute } from './file-fixtures';
import { standInLiveRoute } from './live-fixtures';

function installStandInFetch(): void {
  if (typeof window === 'undefined' || (window as { __standIn?: boolean }).__standIn) return;
  (window as { __standIn?: boolean }).__standIn = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const answer = url.pathname.includes('/api/v1/')
      ? (standInAskRoute(url, STAND_IN_FILES) ?? standInFileRoute(url) ?? standInLiveRoute(url))
      : undefined;
    if (!answer) return real(input, init);
    return new Response(answer.json === undefined ? null : JSON.stringify(answer.json), {
      status: answer.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

installStandInFetch();
