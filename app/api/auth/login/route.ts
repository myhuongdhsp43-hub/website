import { NextResponse } from 'next/server';
import { authenticatePassword, createSession, sessionCookie } from '@/lib/server/password-auth';

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectLogin(request, 'Biểu mẫu đăng nhập không hợp lệ.');
  }

  const username = text(form, 'username').trim().toLowerCase();
  const password = text(form, 'password');
  const schoolId = text(form, 'school_id').trim() || undefined;
  const returnTo = safeReturnTo(text(form, 'return_to') || '/admin');

  if (!/^[a-z0-9_\.\-]{3,64}$/.test(username) || password.length < 6 || password.length > 200) {
    return redirectLogin(request, 'Thông tin đăng nhập không hợp lệ. Vui lòng kiểm tra lại tên đăng nhập và mật khẩu.');
  }

  try {
    const user = await authenticatePassword(username, password, schoolId);
    if (!user) {
      return redirectLogin(request, 'Tên đăng nhập hoặc mật khẩu không chính xác.');
    }

    const session = await createSession(user.id);
    const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('admin/student login failed', error);
    return redirectLogin(request, 'Không thể đăng nhập lúc này. Vui lòng thử lại sau.');
  }
}

function redirectLogin(request: Request, error: string) {
  const returnTo = new URL(request.url).searchParams.get('return_to') || '';
  const url = new URL('/login', request.url);
  url.searchParams.set('error', error);
  if (returnTo) url.searchParams.set('return_to', returnTo);
  const response = NextResponse.redirect(url, 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function safeReturnTo(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/admin';
  try {
    const url = new URL(value, 'https://local.invalid');
    return url.origin === 'https://local.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/admin';
  } catch {
    return '/admin';
  }
}

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
