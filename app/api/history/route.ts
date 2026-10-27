import { env } from 'cloudflare:workers';
import { apiError, json, noStore } from '@/lib/server/http';
import { requireSchoolUser } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const context = await requireSchoolUser();
    const type = new URL(request.url).searchParams.get('type') === 'telemetry' ? 'telemetry' : 'events';
    if (type === 'telemetry') {
      const rows = await env.DB.prepare(`SELECT t.recorded_at, t.speed, t.latitude, t.longitude, t.gps_valid, t.satellites, t.hdop,
        t.network_signal, t.overspeed_active, d.device_id, s.full_name, s.student_code, s.class_name
        FROM telemetry t JOIN devices d ON d.id = t.device_id LEFT JOIN students s ON s.id = d.student_id AND s.school_id = d.school_id
        WHERE d.school_id = ? ORDER BY t.recorded_at DESC LIMIT 100`).bind(context.schoolId).all();
      return noStore(json({ success: true, type, rows: rows.results }));
    }
    const rows = await env.DB.prepare(`SELECT e.started_at, e.ended_at, e.max_speed, e.speed_limit, e.latitude, e.longitude, e.gps_valid, e.sms_sent,
      d.device_id, s.full_name, s.student_code, s.class_name
      FROM overspeed_events e JOIN devices d ON d.id = e.device_id LEFT JOIN students s ON s.id = e.student_id AND s.school_id = d.school_id
      WHERE d.school_id = ? ORDER BY e.started_at DESC LIMIT 100`).bind(context.schoolId).all();
    return noStore(json({ success: true, type, rows: rows.results }));
  } catch (error) { return apiError(error); }
}
