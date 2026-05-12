import { NextResponse } from 'next/server';

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const submitted =
    body &&
    typeof body === 'object' &&
    typeof (body as { password?: unknown }).password === 'string'
      ? (body as { password: string }).password
      : '';

  const demoPassword = process.env.DEMO_PASSWORD;

  if (!demoPassword || submitted !== demoPassword) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('mirror_auth', demoPassword, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: THIRTY_DAYS_SECONDS,
    path: '/',
  });

  return response;
}
