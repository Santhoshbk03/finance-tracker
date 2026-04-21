import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'auth-session';
const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Full Firebase session verification happens in API routes via adminAuth.
  // The middleware just checks the cookie exists for fast edge-level gating.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)'],
};
