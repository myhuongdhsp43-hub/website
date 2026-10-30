import { env } from 'cloudflare:workers';
import { apiError, json, noStore } from '@/lib/server/http';
import { requireSchoolUser } from '@/lib/server/auth';

export async function GET() {
  try {
    const context = await requireSchoolUser();
    const [daily, students, speed, status] = await Promise.all([
      env.DB.prepare(`SELECT substr(e.started_at, 1, 10) AS day, COUNT(*) AS count
        FROM overspeed_events e JOIN devices d ON d.id = e.device_id
        WHERE d.school_id = ? AND julianday(e.started_at) >= julianday('now', '-29 days')
        GROUP BY substr(e.started_at, 1, 10) ORDER BY day`).bind(context.schoolId).all(),
      env.DB.prepare(`SELECT s.id, s.full_name, s.student_code, s.class_name, COUNT(e.id) AS count, MAX(e.max_speed) AS max_speed
        FROM students s JOIN overspeed_events e ON e.student_id = s.id
        WHERE s.school_id = ? AND julianday(e.started_at) >= julianday('now', '-30 days')
        GROUP BY s.id ORDER BY count DESC, max_speed DESC LIMIT 10`).bind(context.schoolId).all(),
      env.DB.prepare(`SELECT COALESCE(MAX(e.max_speed), 0) AS max_speed
        FROM overspeed_events e JOIN devices d ON d.id = e.device_id WHERE d.school_id = ?`).bind(context.schoolId).first(),
      env.DB.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN julianday(last_seen) >= julianday('now', '-180 seconds') THEN 1 ELSE 0 END) AS online
        FROM devices WHERE school_id = ?`).bind(context.schoolId).first(),
    ]);
    return noStore(json({ success: true, daily: daily.results, students: students.results, maxSpeed: Number((speed as { max_speed?: number } | null)?.max_speed ?? 0), devices: { total: Number((status as { total?: number } | null)?.total ?? 0), online: Number((status as { online?: number } | null)?.online ?? 0) } }));
  } catch (error) { return apiError(error); }
}
