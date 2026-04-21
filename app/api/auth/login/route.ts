import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookie, SESSION_COOKIE } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
    }

    const sessionCookie = await createSessionCookie(idToken);
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (e) {
    console.error('Login error:', e);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }
}
