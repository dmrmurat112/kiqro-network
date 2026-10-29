import { NextResponse, type NextRequest } from 'next/server';

// Same name as lib/session.ts (middleware runs on the edge and cannot import server-only code).
const ADV_COOKIE = 'kq_adv';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // "/" → the visitor's language (Turkish if the browser prefers it, otherwise English).
  if (pathname === '/') {
    const prefersTr = /^tr\b|,\s*tr\b/i.test(req.headers.get('accept-language') ?? '');
    return NextResponse.redirect(new URL(prefersTr ? '/tr' : '/en', req.url));
  }

  // Cheap gate for the panel; the session itself is verified on every request (lib/session.ts).
  if (pathname.startsWith('/app') && !req.cookies.has(ADV_COOKIE)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/', '/app/:path*'] };
