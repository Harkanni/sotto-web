import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sends people without a session cookie to sign-in before the app shell loads, so a signed-out
 * visit never flashes the app. Only the cookie's presence is checked here; the API decides
 * whether the session is real, and the app's session gate handles an expired one.
 */
const SESSION_COOKIES = ['sotto.session_token', '__Secure-sotto.session_token'];

export function proxy(request: NextRequest) {
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = '/sign-in';
  url.search = next === '/home' ? '' : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/home/:path*',
    '/docs/:path*',
    '/ask/:path*',
    '/meetings/:path*',
    '/profile/:path*',
    '/welcome/:path*',
  ],
};
