import { env } from 'cloudflare:workers';
import { audit, requireSchoolUser, requireWriteAccess } from '@/lib/server/auth';
import { apiError, json, readJson, requiredText } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    const context = await requireSchoolUser();
    const status = new URL(request.url).searchParams.get('status') ?? 'open';
    const alerts = await env.DB.prepare(`SELECT a.*, s.full_name, s.student_code, s.class_name, d.device_id, e.max_speed, e.speed_limit, e.sms_sent,
      (SELECT COUNT(*) FROM helmet_sms_jobs j WHERE j.alert_id = a.id AND j.school_id = a.school_id) AS helmet_sms_total,
      (SELECT COUNT(*) FROM helmet_sms_jobs j WHERE j.alert_id = a.id AND j.school_id = a.school_id AND j.status = 'accepted') AS helmet_sms_accepted
      FROM alerts a LEFT JOIN students s ON s.id = a.student_id AND s.school_id = a.school_id
      LEFT JOIN devices d ON d.id = a.device_id AND d.school_id = a.school_id
      LEFT JOIN overspeed_events e ON e.id = a.event_id AND e.device_id = d.id
      WHERE a.school_id = ? AND (? = 'all' OR a.status = ?) ORDER BY a.created_at DESC LIMIT 100`).bind(context.schoolId, status, status).all();
    return json({ success: true, alerts: alerts.results });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    const body = await readJson(request);
    const id = requiredText(body.id, 'id', 64);
    const status = body.status === 'acknowledged' || body.status === 'resolved' ? body.status : null;
    if (!status) return json({ success: false, error: { code: 'validation_error', message: 'Trạng thái không hợp lệ.' } }, { status: 400 });
    const now = new Date().toISOString();
    const result = await env.DB.prepare('UPDATE alerts SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ? AND school_id = ?').bind(status, status === 'resolved' ? now : null, context.userId, id, context.schoolId).run();
    if (!result.meta.changes) return json({ success: false, error: { code: 'not_found', message: 'Không tìm thấy cảnh báo.' } }, { status: 404 });
    await audit(context, `alert.${status}`, 'alert', id);
    return json({ success: true });
  } catch (error) { return apiError(error); }
}
