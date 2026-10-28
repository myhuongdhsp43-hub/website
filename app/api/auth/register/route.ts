import { NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import { createSession, hashPassword, sessionCookie } from '@/lib/server/password-auth';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(request, 'Biểu mẫu không hợp lệ.');
  }

  const accountType = text(form, 'account_type').trim() === 'personal' ? 'personal' : 'school';
  const schoolNameInput = text(form, 'school_name').trim();
  const fullName = text(form, 'full_name').trim();
  const username = text(form, 'username').trim().toLowerCase();
  const email = text(form, 'email').trim().toLowerCase();
  const password = text(form, 'password');

  const schoolName = accountType === 'personal'
    ? (schoolNameInput || `Cá nhân: ${fullName || username}`)
    : schoolNameInput;

  if (accountType === 'school' && (schoolName.length < 2 || schoolName.length > 160)) {
    return redirect(request, 'Vui lòng nhập tên trường hoặc đơn vị quản lý hợp lệ (2–160 ký tự).');
  }

  if (fullName.length < 2 || fullName.length > 160) {
    return redirect(request, 'Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự).');
  }

  if (!/^[a-z0-9_.-]{3,64}$/.test(username)) {
    return redirect(request, 'Tên đăng nhập chỉ gồm 3–64 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  }

  if (email.length > 160 || !/^\S+@\S+\.\S+$/.test(email)) {
    return redirect(request, 'Email không đúng định dạng.');
  }

  if (password.length < 8 || password.length > 200) {
    return redirect(request, 'Mật khẩu cần có ít nhất 8 ký tự.');
  }

  const schoolId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const salt = randomToken();
  const accountToken = 'acc_' + randomToken().slice(0, 16);

  try {
    await ensureSchema();
    const exists = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ? OR lower(email) = ? LIMIT 1'
    ).bind(username, email).first();

    if (exists) {
      return redirect(request, 'Tên đăng nhập hoặc email đã được sử dụng. Vui lòng chọn tên đăng nhập hoặc email khác.');
    }

    const passwordHash = await hashPassword(password, salt);

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO schools (id, name, timezone, account_token, account_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(schoolId, schoolName, 'Asia/Ho_Chi_Minh', accountToken, accountType, now, now),
      env.DB.prepare(
        'INSERT INTO users (id, school_id, platform_user_id, email, full_name, role, active, created_at, updated_at, username, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(userId, schoolId, userId, email, fullName, 'admin', 1, now, now, username, passwordHash, salt),
      env.DB.prepare(
        'INSERT INTO system_settings (id, school_id, sms_enabled, send_location, sms_cooldown_minutes, sms_template, telemetry_retention_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), schoolId, 1, 1, 15, 'Cảnh báo xe điện: {student_name} đang vượt tốc độ {speed} km/h.', 90, now, now),
    ]);
  } catch (error) {
    console.error('Account registration failed', error);
    return redirect(request, 'Chưa tạo được tài khoản. Hãy thử lại sau.');
  }

  try {
    const session = await createSession(userId);
    const returnTo = text(form, 'return_to');
    const targetUrl = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/admin';
    const response = NextResponse.redirect(new URL(targetUrl, request.url), 303);
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login?registered=1', request.url), 303);
  }
}

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function redirect(request: Request, error: string) {
  return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(error)}`, request.url), 303);
}
