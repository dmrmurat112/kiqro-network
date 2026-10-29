import { NextResponse, type NextRequest } from 'next/server';

// Cheap gate: without a session cookie go straight to /login. The cookie itself is
// verified against the database in every page and server action (lib/session.ts).
export function middleware(req: NextRequest) {
  if (!req.cookies.has('kq_admin')) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!login|_next|favicon.ico).*)'] };
