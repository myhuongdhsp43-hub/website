import { env } from 'cloudflare:workers';
import { apiError, json, noStore } from '@/lib/server/http';
import { requireSchoolUser } from '@/lib/server/auth';

export async function GET() {
  try {
    const context = await requireSchoolUser();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const [studentCount, deviceCount, onlineCount, movingCount, todayEvents, weekEvents, unresolvedAlerts, rows] = await Promise.all([
      scalar('SELECT COUNT(*) AS value FROM students WHERE school_id = ? AND active = 1', context.schoolId),
      scalar('SELECT COUNT(*) AS value FROM devices WHERE school_id = ?', context.schoolId),
      scalar("SELECT COUNT(*) AS value FROM devices WHERE school_id = ? AND julianday(last_seen) >= julianday('now', '-30 seconds')", context.schoolId),
      scalar('SELECT COUNT(*) AS value FROM devices WHERE school_id = ? AND current_speed >= 5 AND julianday(last_seen) >= julianday(\'now\', \'-30 seconds\')', context.schoolId),
      scalar('SELECT COUNT(*) AS value FROM overspeed_events e JOIN devices d ON d.id = e.device_id WHERE d.school_id = ? AND e.started_at >= ?', context.schoolId, dayStart),
      scalar('SELECT COUNT(*) AS value FROM overspeed_events e JOIN devices d ON d.id = e.device_id WHERE d.school_id = ? AND e.started_at >= ?', context.schoolId, weekStart),
      scalar("SELECT COUNT(*) AS value FROM alerts WHERE school_id = ? AND status = 'open'", context.schoolId),
      env.DB.prepare(`SELECT d.id, d.device_id, d.device_name, d.current_speed, d.gps_valid, d.last_seen, d.network_signal,
        d.helmet_worn, COALESCE(h.helmet_detection_enabled, 0) AS helmet_detection_enabled,
        c.speed_limit, s.id AS student_id, s.full_name, s.student_code, s.class_name,
        CASE WHEN julianday(d.last_seen) >= julianday('now', '-30 seconds') THEN 1 ELSE 0 END AS online,
        CASE WHEN d.active_overspeed_event_id IS NOT NULL THEN 1 ELSE 0 END AS overspeed
        FROM devices d LEFT JOIN students s ON s.id = d.student_id AND s.school_id = d.school_id JOIN device_configs c ON c.device_id = d.id
        LEFT JOIN system_settings h ON h.school_id = d.school_id
        WHERE d.school_id = ? ORDER BY d.last_seen DESC LIMIT 50`).bind(context.schoolId).all(),
    ]);
    return noStore(json({ success: true, user: { displayName: context.displayName, email: context.email, role: context.role, schoolName: context.schoolName }, stats: { students: studentCount, devices: deviceCount, online: onlineCount, offline: Math.max(0, deviceCount - onlineCount), moving: movingCount, todayOverspeed: todayEvents, weekOverspeed: weekEvents, openAlerts: unresolvedAlerts }, devices: rows.results }));
  } catch (error) { return apiError(error); }
}

async function scalar(query: string, ...values: unknown[]) {
  const row = await env.DB.prepare(query).bind(...values).first<{ value: number }>();
  return Number(row?.value ?? 0);
}
