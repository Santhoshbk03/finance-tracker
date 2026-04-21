import { adminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'auth-session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 * 1000; // 7 days in ms

export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE });
}

export async function verifySessionCookie(sessionCookie: string) {
  try {
    return await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!session) return null;
  return verifySessionCookie(session);
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

export { SESSION_COOKIE };
