/**
 * A full page load to `path`. Moving between sign-in, onboarding and the app always crosses a
 * session change (a new cookie, a new active workspace), so a fresh load is the honest way
 * across: the proxy sees the cookie, the query cache starts clean, the service worker serves
 * the right page.
 */
export function loadPage(path: string, { replace = false } = {}): void {
  if (replace) window.location.replace(path);
  else window.location.assign(path);
}
