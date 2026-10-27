import { env } from 'cloudflare:workers';
import { ApiError } from './http';
import { requirePasswordUser } from './password-auth';

export type SchoolContext = { schoolId: string; userId: string; role: 'admin' | 'staff' | 'viewer'; email: string; displayName: string; schoolName: string };

export async function requireSchoolUser(): Promise<SchoolContext> {
  const row = await requirePasswordUser();
  return { schoolId: row.school_id!, userId: row.id, role: row.role, email: row.email, displayName: row.full_name ?? row.email, schoolName: row.school_name ?? 'Đơn vị quản lý' };
}

export function requireWriteAccess(context: SchoolContext) { if (context.role === 'viewer') throw new ApiError(403, 'Tài khoản này chỉ có quyền xem.', 'forbidden'); }
export function requireAdmin(context: SchoolContext) { if (context.role !== 'admin') throw new ApiError(403, 'Chỉ quản trị viên được phép thực hiện thao tác này.', 'forbidden'); }

export async function audit(context: SchoolContext, action: string, entity: string, entityId?: string, metadata?: Record<string, unknown>) {
  await env.DB.prepare('INSERT INTO audit_logs (id, school_id, user_id, action, entity, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), context.schoolId, context.userId, action, entity, entityId ?? null, metadata ? JSON.stringify(metadata) : null, new Date().toISOString()).run();
}
