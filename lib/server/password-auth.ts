import { cookies } from 'next/headers';
import { env } from 'cloudflare:workers';
import { ApiError } from './http';
import { ensureSchema } from './ensure-schema';

const SESSION_COOKIE = 'school_admin_session';
const SESSION_DAYS = 7;
export type PasswordUser = { id: string; school_id: string | null; school_name: string | null; role: 'admin' | 'staff' | 'viewer'; active: number; email: string; full_name: string | null };

export async function requirePasswordUser(): Promise<PasswordUser> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new ApiError(401, 'Vui lòng đăng nhập để tiếp tục.', 'unauthenticated');
  await ensureSchema();
  const row = await env.DB.prepare(`SELECT u.id, u.school_id, sc.name AS school_name, u.role, u.active, u.email, u.full_name FROM app_sessions session JOIN users u ON u.id = session.user_id JOIN schools sc ON sc.id = u.school_id WHERE session.token_hash = ? AND session.expires_at > ?`).bind(await sha256(token), new Date().toISOString()).first<PasswordUser>();
  if (!row?.active || !row.school_id) throw new ApiError(401, 'Phiên đăng nhập đã hết hạn.', 'unauthenticated');
  return row;
}

export async function authenticatePassword(username: string, password: string): Promise<PasswordUser | null> {
  await ensureSchema();
  const row = await env.DB.prepare(`SELECT u.id, u.school_id, sc.name AS school_name, u.role, u.active, u.email, u.full_name, u.password_hash, u.password_salt FROM users u LEFT JOIN schools sc ON sc.id = u.school_id WHERE u.username = ?`).bind(username.toLowerCase()).first<PasswordUser & { password_hash: string | null; password_salt: string | null }>();
  if (!row?.active || !row.password_hash || !row.password_salt) return null;
  return constantTimeEqual(await hashPassword(password, row.password_salt), row.password_hash) ? row : null;
}

export async function createSession(userId: string) {
  await ensureSchema();
  const token = randomToken(); const now = new Date(); const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await env.DB.prepare('DELETE FROM app_sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await env.DB.prepare('INSERT INTO app_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), userId, await sha256(token), expiresAt.toISOString(), now.toISOString()).run();
  return { token, expiresAt };
}

export async function destroyCurrentSession() { const token = (await cookies()).get(SESSION_COOKIE)?.value; if (token) { await ensureSchema(); await env.DB.prepare('DELETE FROM app_sessions WHERE token_hash = ?').bind(await sha256(token)).run(); } }
export function sessionCookie(token: string, expires: Date) { return { name: SESSION_COOKIE, value: token, httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', expires }; }
export function expiredSessionCookie() { return { name: SESSION_COOKIE, value: '', httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', expires: new Date(0) }; }
export async function hashPassword(password: string, salt: string) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256); return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join(''); }
async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''); }
function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
function constantTimeEqual(left: string, right: string) { if (left.length !== right.length) return false; let value = 0; for (let i = 0; i < left.length; i++) value |= left.charCodeAt(i) ^ right.charCodeAt(i); return value === 0; }
