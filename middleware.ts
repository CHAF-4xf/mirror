import { NextResponse, type NextRequest } from 'next/server';

/**
 * Demo password gate is currently disabled.
 * To re-enable: restore cookie check against process.env.DEMO_PASSWORD
 * and redirect unauthenticated requests to /gate.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
