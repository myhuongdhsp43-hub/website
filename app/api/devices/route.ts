import { env } from 'cloudflare:workers';
import { audit, requireAdmin, requireSchoolUser, requireWriteAccess } from '@/lib/server/auth';
import { ApiError, apiError, boundedNumber, json, optionalBoolean, optionalText, readJson, requiredText } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function GET() {
  try {
    const context = await requireSchoolUser();
    await ensureSchema();
    const schoolRow = await env.DB.prepare('SELECT account_token FROM schools WHERE id = ?').bind(context.schoolId).first<{ account_token: string | null }>();
    const devices = await env.DB.prepare(`SELECT d.id, d.device_id, d.device_name, d.verify_code, d.device_token, d.student_id, d.enabled, d.last_seen, d.current_speed, d.gps_valid, d.network_signal, d.firmware_version,
      c.speed_limit, c.speed_alert_enabled, c.buzzer_enabled, c.remote_alarm, c.version, s.full_name, s.student_code, s.class_name
      FROM devices d JOIN device_configs c ON c.device_id = d.id
      LEFT JOIN students s ON s.id = d.student_id AND s.school_id = d.school_id
      WHERE d.school_id = ? ORDER BY d.device_id`).bind(context.schoolId).all();
    return json({ success: true, account_token: schoolRow?.account_token ?? null, devices: devices.results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireAdmin(context);
    await ensureSchema();
    const body = await readJson(request);
    const deviceId = requiredText(body.device_id, 'device_id', 64).toUpperCase();
    if (!/^[A-Z0-9_-]{3,64}$/.test(deviceId)) throw new ApiError(400, 'device_id không hợp lệ.', 'validation_error');
    const duplicate = await env.DB.prepare('SELECT id FROM devices WHERE school_id = ? AND device_id = ?').bind(context.schoolId, deviceId).first();
    if (duplicate) throw new ApiError(409, 'Mã thiết bị này đã được dùng trong trường của bạn.', 'device_id_conflict');
    const studentId = optionalText(body.student_id, 'student_id', 64);
    if (studentId) await validateStudent(context.schoolId, studentId);
    const rawToken = createDeviceToken();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const deviceName = requiredText(body.device_name, 'Tên thiết bị', 120);
    const speedLimit = boundedNumber(body.speed_limit, 10, 100, 40);
    const verifyCode = Math.floor(100000000 + Math.random() * 900000000).toString();
    const deviceToken = `dt_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO devices (id, school_id, student_id, device_id, device_name, device_token_hash, device_token, verify_code, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        id, context.schoolId, studentId ?? null, deviceId, deviceName, await sha256(rawToken), deviceToken, verifyCode, optionalBoolean(body.enabled, true) ? 1 : 0, now, now
      ),
      env.DB.prepare(`INSERT INTO device_configs (id, device_id, speed_limit, speed_alert_enabled, buzzer_enabled, remote_alarm, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(
        crypto.randomUUID(), id, speedLimit, optionalBoolean(body.speed_alert_enabled, true) ? 1 : 0, optionalBoolean(body.buzzer_enabled, true) ? 1 : 0, optionalBoolean(body.remote_alarm, false) ? 1 : 0, now, now
      ),
    ]);
    await audit(context, 'device.create', 'device', id, { deviceId });
    return json({ success: true, device: { id, deviceId, rawToken, verifyCode, deviceToken } }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    await ensureSchema();
    const body = await readJson(request);
    const id = requiredText(body.id, 'id', 64);
    const device = await env.DB.prepare('SELECT id, device_id FROM devices WHERE id = ? AND school_id = ?').bind(id, context.schoolId).first();
    if (!device) throw new ApiError(404, 'Không tìm thấy thiết bị.', 'not_found');
    const studentId = optionalText(body.student_id, 'student_id', 64);
    if (studentId) await validateStudent(context.schoolId, studentId);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE devices SET device_name = ?, student_id = ?, enabled = ?, updated_at = ? WHERE id = ? AND school_id = ?`).bind(
        requiredText(body.device_name, 'Tên thiết bị', 120), studentId ?? null, optionalBoolean(body.enabled, true) ? 1 : 0, now, id, context.schoolId
      ),
      env.DB.prepare(`UPDATE device_configs SET speed_limit = ?, speed_alert_enabled = ?, buzzer_enabled = ?, remote_alarm = ?, version = version + 1, updated_at = ? WHERE device_id = ?`).bind(
        boundedNumber(body.speed_limit, 10, 100, 40), optionalBoolean(body.speed_alert_enabled, true) ? 1 : 0, optionalBoolean(body.buzzer_enabled, true) ? 1 : 0, optionalBoolean(body.remote_alarm, false) ? 1 : 0, now, id
      ),
    ]);
    await audit(context, 'device.update', 'device', id);
    return json({ success: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireAdmin(context);
    await ensureSchema();
    const body = await readJson(request);
    const id = requiredText(body.id, 'id', 64);
    const device = await env.DB.prepare('SELECT id, device_id FROM devices WHERE id = ? AND school_id = ?').bind(id, context.schoolId).first<{ id: string; device_id: string }>();
    if (!device) throw new ApiError(404, 'Không tìm thấy thiết bị.', 'not_found');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sms_logs WHERE event_id IN (SELECT id FROM overspeed_events WHERE device_id = ?)').bind(id),
      env.DB.prepare('DELETE FROM helmet_sms_jobs WHERE device_id = ?').bind(id),
      env.DB.prepare('DELETE FROM alerts WHERE device_id = ?').bind(id),
      env.DB.prepare('DELETE FROM telemetry WHERE device_id = ?').bind(id),
      env.DB.prepare('DELETE FROM device_request_limits WHERE device_id = ?').bind(id),
      env.DB.prepare('DELETE FROM overspeed_events WHERE device_id = ?').bind(id),
      env.DB.prepare('DELETE FROM device_configs WHERE device_id = ?').bind(id),
      env.DB.prepare('DELETE FROM devices WHERE id = ? AND school_id = ?').bind(id, context.schoolId),
    ]);
    await audit(context, 'device.delete', 'device', id, { deviceId: device.device_id });
    return json({ success: true });
  } catch (error) { return apiError(error); }
}

async function validateStudent(schoolId: string, studentId: string) {
  const student = await env.DB.prepare('SELECT id FROM students WHERE id = ? AND school_id = ?').bind(studentId, schoolId).first();
  if (!student) throw new ApiError(400, 'Học sinh được gán không thuộc nhà trường.', 'validation_error');
}

function createDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
