'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createToken, ADMIN_USERNAME, ADMIN_PASSWORD } from '@/lib/auth';

export async function loginAction(prevState: { error: string }, formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Please enter username and password' };
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return { error: 'Invalid username or password' };
  }

  const token = await createToken(username);
  const cookieStore = await cookies();

  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect('/');
}