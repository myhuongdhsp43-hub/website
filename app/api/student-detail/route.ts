import { env } from 'cloudflare:workers';
import { apiError, json, noStore } from '@/lib/server/http';
import { requireSchoolUser } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const context = await requireSchoolUser();
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return json({ success: false, error: { code: 'validation_error', message: 'Thiếu id học sinh.' } }, { status: 400 });

    const student = await env.DB.prepare(`SELECT s.*, d.device_id, d.device_name, d.current_speed, d.last_latitude, d.last_longitude,
      d.gps_valid, d.satellites, d.hdop, d.last_seen, d.network_signal, d.enabled,
      c.speed_limit, c.speed_alert_enabled, c.buzzer_enabled
      FROM students s
      LEFT JOIN devices d ON d.student_id = s.id AND d.school_id = s.school_id
      LEFT JOIN device_configs c ON c.device_id = d.id
      WHERE s.id = ? AND s.school_id = ?`).bind(id, context.schoolId).first();
    if (!student) return json({ success: false, error: { code: 'not_found', message: 'Không tìm thấy học sinh.' } }, { status: 404 });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const week = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1_000).toISOString();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [contacts, stats, events] = await Promise.all([
      env.DB.prepare(`SELECT c.id, c.name, c.relationship, c.phone, c.sms_enabled FROM parent_contacts c
        JOIN students s ON s.id = c.student_id
        WHERE c.student_id = ? AND s.school_id = ? ORDER BY c.created_at`).bind(id, context.schoolId).all(),
      env.DB.prepare(`SELECT
        COALESCE(MAX(CASE WHEN started_at >= ? THEN max_speed END), 0) AS max_today,
        COALESCE(MAX(CASE WHEN started_at >= ? THEN max_speed END), 0) AS max_week,
        SUM(CASE WHEN started_at >= ? THEN 1 ELSE 0 END) AS count_today,
        SUM(CASE WHEN started_at >= ? THEN 1 ELSE 0 END) AS count_week,
        SUM(CASE WHEN started_at >= ? THEN 1 ELSE 0 END) AS count_month
        FROM overspeed_events e
        WHERE e.student_id = ? AND e.device_id IN (SELECT d.id FROM devices d WHERE d.school_id = ?)`).bind(today, week, today, week, month, id, context.schoolId).first(),
      env.DB.prepare(`SELECT e.id, e.started_at, e.ended_at, e.max_speed, e.speed_limit, e.latitude, e.longitude, e.gps_valid, e.sms_sent,
        d.device_id
        FROM overspeed_events e JOIN devices d ON d.id = e.device_id
        WHERE e.student_id = ? AND d.school_id = ? ORDER BY e.started_at DESC LIMIT 50`).bind(id, context.schoolId).all(),
    ]);
    return noStore(json({ success: true, student, contacts: contacts.results, stats, events: events.results }));
  } catch (error) { return apiError(error); }
}
