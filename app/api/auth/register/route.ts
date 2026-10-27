import { NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import { createSession, hashPassword, sessionCookie } from '@/lib/server/password-auth';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function POST(request: Request) {
  let form: FormData; try { form = await request.formData(); } catch { return redirect(request, 'Biểu mẫu không hợp lệ.'); }
  const schoolName = text(form, 'school_name').trim(); const username = text(form, 'username').trim().toLowerCase(); const email = text(form, 'email').trim().toLowerCase(); const password = text(form, 'password');
  if (schoolName.length < 2 || schoolName.length > 160 || !/^[a-z0-9_.-]{3,64}$/.test(username) || email.length > 160 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 200) return redirect(request, 'Thông tin chưa hợp lệ. Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang; mật khẩu cần ít nhất 8 ký tự.');
  const schoolId = crypto.randomUUID(); const userId = crypto.randomUUID(); const now = new Date().toISOString(); const salt = randomToken();
  try {
    await ensureSchema();
    const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ? OR lower(email) = ? LIMIT 1').bind(username, email).first();
    if (exists) return redirect(request, 'Tên đăng nhập hoặc email đã được sử dụng.');
    const passwordHash = await hashPassword(password, salt);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO schools (id,name,timezone,created_at,updated_at) VALUES (?,?,?,?,?)').bind(schoolId, schoolName, 'Asia/Ho_Chi_Minh', now, now),
      env.DB.prepare('INSERT INTO users (id,school_id,platform_user_id,email,full_name,role,active,created_at,updated_at,username,password_hash,password_salt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(userId, schoolId, userId, email, schoolName, 'admin', 1, now, now, username, passwordHash, salt),
      env.DB.prepare('INSERT INTO system_settings (id,school_id,sms_enabled,send_location,sms_cooldown_minutes,sms_template,telemetry_retention_days,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), schoolId, 1, 1, 15, 'Cảnh báo xe điện: {student} đang vượt tốc độ {speed} km/h.', 90, now, now),
    ]);
  } catch (error) { console.error('school registration failed', error); return redirect(request, 'Chưa tạo được tài khoản. Hãy thử lại sau.'); }
  try { const session = await createSession(userId); const response = NextResponse.redirect(new URL('/admin', request.url), 303); response.cookies.set(sessionCookie(session.token, session.expiresAt)); response.headers.set('Cache-Control', 'no-store'); return response; } catch { return NextResponse.redirect(new URL('/login?registered=1', request.url), 303); }
}
function text(form: FormData, key: string) { const value = form.get(key); return typeof value === 'string' ? value : ''; }
function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
function redirect(request: Request, error: string) { return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(error)}`, request.url), 303); }
