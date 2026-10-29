import { cookies } from 'next/headers';
import { env } from 'cloudflare:workers';
import { ApiError } from './http';
import { ensureSchema } from './ensure-schema';

const SESSION_COOKIE = 'school_admin_session';
const SESSION_DAYS = 7;

export type PasswordUser = {
  id: string;
  school_id: string | null;
  school_name: string | null;
  account_type?: 'school' | 'personal';
  role: 'admin' | 'staff' | 'viewer' | 'student';
  active: number;
  email: string;
  full_name: string | null;
  username?: string | null;
  student_id?: string | null;
};

export async function getSessionUser(): Promise<PasswordUser | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    await ensureSchema();
    const tokenHash = await sha256(token);
    const now = new Date().toISOString();

    // 1. Check users (teacher/admin/staff)
    const userRow = await env.DB.prepare(`
      SELECT u.id, u.school_id, sc.name AS school_name, sc.account_type, u.role, u.active, u.email, u.full_name, u.username
      FROM app_sessions session
      JOIN users u ON u.id = session.user_id
      JOIN schools sc ON sc.id = u.school_id
      WHERE session.token_hash = ? AND session.expires_at > ?
    `).bind(tokenHash, now).first<PasswordUser>();

    if (userRow?.active && userRow.school_id) {
      return userRow;
    }

    // 2. Check student_accounts (sub-accounts)
    const studentRow = await env.DB.prepare(`
      SELECT sa.id, sa.school_id, sc.name AS school_name, sc.account_type, 'student' AS role, sa.active,
             (sa.username || '@student.local') AS email, sa.full_name, sa.username, sa.student_id
      FROM app_sessions session
      JOIN student_accounts sa ON sa.id = session.user_id
      JOIN schools sc ON sc.id = sa.school_id
      WHERE session.token_hash = ? AND session.expires_at > ?
    `).bind(tokenHash, now).first<PasswordUser>();

    if (studentRow?.active && studentRow.school_id) {
      return studentRow;
    }

    return null;
  } catch {
    return null;
  }
}

export async function requirePasswordUser(): Promise<PasswordUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiError(401, 'Vui lòng đăng nhập để tiếp tục.', 'unauthenticated');
  }
  return user;
}

export async function authenticatePassword(
  usernameOrEmail: string,
  password: string,
  schoolId?: string
): Promise<PasswordUser | null> {
  await ensureSchema();
  const cleanInput = usernameOrEmail.trim().toLowerCase();

  // 1. Kiểm tra tài khoản giáo viên/quản trị/cá nhân trong users
  const userRow = await env.DB.prepare(`
    SELECT u.id, u.school_id, sc.name AS school_name, sc.account_type, u.role, u.active, u.email, u.full_name, u.username,
           u.password_hash, u.password_salt
    FROM users u
    LEFT JOIN schools sc ON sc.id = u.school_id
    WHERE lower(u.username) = ? OR lower(u.email) = ?
  `).bind(cleanInput, cleanInput).first<PasswordUser & { password_hash: string | null; password_salt: string | null }>();

  if (userRow?.active && userRow.password_hash && userRow.password_salt) {
    const isMatch = constantTimeEqual(await hashPassword(password, userRow.password_salt), userRow.password_hash);
    if (isMatch) return userRow;
  }

  // 2. Kiểm tra tài khoản học sinh con trong student_accounts
  let studentQuery = `
    SELECT sa.id, sa.school_id, sc.name AS school_name, sc.account_type, 'student' AS role, sa.active,
           (sa.username || '@student.local') AS email, sa.full_name, sa.username, sa.student_id,
           sa.password_hash, sa.password_salt
    FROM student_accounts sa
    JOIN schools sc ON sc.id = sa.school_id
    WHERE lower(sa.username) = ?
  `;
  const bindings: string[] = [cleanInput];

  if (schoolId) {
    studentQuery += ` AND sa.school_id = ?`;
    bindings.push(schoolId);
  }

  const studentRow = await env.DB.prepare(studentQuery).bind(...bindings).first<
    PasswordUser & { password_hash: string | null; password_salt: string | null }
  >();

  if (studentRow?.active && studentRow.password_hash && studentRow.password_salt) {
    const isMatch = constantTimeEqual(await hashPassword(password, studentRow.password_salt), studentRow.password_hash);
    if (isMatch) return studentRow;
  }

  return null;
}

export async function createSession(userId: string) {
  await ensureSchema();
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000);

  await env.DB.prepare('DELETE FROM app_sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await env.DB.prepare(
    'INSERT INTO app_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), userId, await sha256(token), expiresAt.toISOString(), now.toISOString()).run();

  return { token, expiresAt };
}

export async function destroyCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    await ensureSchema();
    await env.DB.prepare('DELETE FROM app_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  }
}

export function sessionCookie(token: string, expires: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

export function expiredSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: new Date(0),
  };
}

export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 },
    key,
    256
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let value = 0;
  for (let i = 0; i < left.length; i++) value |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return value === 0;
}
