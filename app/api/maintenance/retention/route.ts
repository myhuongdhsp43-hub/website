import { env } from 'cloudflare:workers';
import { audit, requireAdmin, requireSchoolUser } from '@/lib/server/auth';
import { apiError, json, readJson } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireAdmin(context);
    const body = await readJson(request);
    if (body.confirm !== 'DELETE_OLD_TELEMETRY') return json({ success: false, error: { code: 'confirmation_required', message: 'Xác nhận xóa telemetry cũ chưa hợp lệ.' } }, { status: 400 });
    const setting = await env.DB.prepare('SELECT telemetry_retention_days FROM system_settings WHERE school_id = ?').bind(context.schoolId).first<{ telemetry_retention_days: number }>();
    const result = await env.DB.prepare(`DELETE FROM telemetry WHERE julianday(recorded_at) < julianday('now', '-' || ? || ' days') AND device_id IN (SELECT id FROM devices WHERE school_id = ?)`).bind(setting?.telemetry_retention_days ?? 90, context.schoolId).run();
    await audit(context, 'telemetry.retention_cleanup', 'telemetry', undefined, { deleted: result.meta.changes });
    return json({ success: true, deleted: result.meta.changes });
  } catch (error) { return apiError(error); }
}
