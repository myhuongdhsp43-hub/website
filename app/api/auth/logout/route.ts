import { NextResponse } from 'next/server';
import { destroyCurrentSession, expiredSessionCookie } from '@/lib/server/password-auth';
export async function POST(request: Request) { try { await destroyCurrentSession(); } catch (error) { console.error('session revocation failed', error); } const response = NextResponse.redirect(new URL('/login?logged_out=1', request.url), 303); response.cookies.set(expiredSessionCookie()); response.headers.set('Cache-Control', 'no-store'); return response; }
