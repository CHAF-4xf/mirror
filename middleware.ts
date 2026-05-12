import { NextResponse, type NextRequest } from 'next/server';

const AUTH_COOKIE = 'mirror_auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isExcludedPath(pathname)) {
    return NextResponse.next();
  }

  const demoPassword = process.env.DEMO_PASSWORD;
  const cookieValue = request.cookies.get(AUTH_COOKIE)?.value;

  if (demoPassword && cookieValue === demoPassword) {
    return NextResponse.next();
  }

  const gateUrl = request.nextUrl.clone();
  gateUrl.pathname = '/gate';
  gateUrl.search = '';
  return NextResponse.redirect(gateUrl);
}

export const config = {
  matcher: '/:path*',
};

function isExcludedPath(pathname: string): boolean {
  return (
    pathname === '/gate' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  );
}
