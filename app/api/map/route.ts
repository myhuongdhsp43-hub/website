import { env } from 'cloudflare:workers';
import { apiError, json, noStore } from '@/lib/server/http';
import { requireSchoolUser } from '@/lib/server/auth';

export async function GET() {
  try {
    const context = await requireSchoolUser();
    const [markers, trailRows] = await Promise.all([
      env.DB.prepare(`SELECT d.id, d.device_id, d.last_latitude AS latitude, d.last_longitude AS longitude, d.current_speed, d.last_seen, d.gps_valid,
      c.speed_limit, s.full_name, s.student_code, s.class_name,
      CASE WHEN julianday(d.last_seen) >= julianday('now', '-180 seconds') THEN 1 ELSE 0 END AS online,
      CASE WHEN d.active_overspeed_event_id IS NOT NULL THEN 1 ELSE 0 END AS overspeed
      FROM devices d JOIN device_configs c ON c.device_id = d.id LEFT JOIN students s ON s.id = d.student_id AND s.school_id = d.school_id
      WHERE d.school_id = ? AND d.gps_valid = 1 AND d.last_latitude IS NOT NULL AND d.last_longitude IS NOT NULL`).bind(context.schoolId).all(),
      env.DB.prepare(`SELECT d.device_id, t.latitude, t.longitude, t.recorded_at
        FROM telemetry t JOIN devices d ON d.id = t.device_id
        WHERE d.school_id = ? AND t.gps_valid = 1 AND t.latitude IS NOT NULL AND t.longitude IS NOT NULL
        ORDER BY t.recorded_at DESC LIMIT 300`).bind(context.schoolId).all(),
    ]);
    return noStore(json({ success: true, markers: markers.results, trail: trailRows.results.reverse() }));
  } catch (error) { return apiError(error); }
}
