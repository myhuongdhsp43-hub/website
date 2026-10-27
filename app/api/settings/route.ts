import { env } from 'cloudflare:workers';
import { audit, requireAdmin, requireSchoolUser } from '@/lib/server/auth';
import { apiError, boundedNumber, json, optionalBoolean, optionalText, readJson } from '@/lib/server/http';

export async function GET() {
  try {
    const context = await requireSchoolUser();
    const setting = await env.DB.prepare('SELECT sms_enabled, send_location, sms_cooldown_minutes, sms_template, telemetry_retention_days, helmet_detection_enabled, helmet_grace_seconds, helmet_min_speed_kmh, updated_at FROM system_settings WHERE school_id = ?').bind(context.schoolId).first();
    return json({ success: true, settings: setting });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireAdmin(context);
    const body = await readJson(request);
    const current = await env.DB.prepare('SELECT sms_enabled, send_location, sms_cooldown_minutes, sms_template, telemetry_retention_days, helmet_detection_enabled, helmet_grace_seconds, helmet_min_speed_kmh FROM system_settings WHERE school_id = ?').bind(context.schoolId).first<{ sms_enabled: number; send_location: number; sms_cooldown_minutes: number; sms_template: string; telemetry_retention_days: number; helmet_detection_enabled: number; helmet_grace_seconds: number; helmet_min_speed_kmh: number }>();
    if (!current) return json({ success: false, error: { code: 'not_found', message: 'Chưa tìm thấy cài đặt nhà trường.' } }, { status: 404 });
    const now = new Date().toISOString();
    const template = optionalText(body.sms_template, 'Mẫu SMS', 1_200) ?? current.sms_template;
    await env.DB.prepare('UPDATE system_settings SET sms_enabled = ?, send_location = ?, sms_cooldown_minutes = ?, sms_template = ?, telemetry_retention_days = ?, helmet_detection_enabled = ?, helmet_grace_seconds = ?, helmet_min_speed_kmh = ?, updated_at = ? WHERE school_id = ?').bind(optionalBoolean(body.sms_enabled, Boolean(current.sms_enabled)) ? 1 : 0, optionalBoolean(body.send_location, Boolean(current.send_location)) ? 1 : 0, boundedNumber(body.sms_cooldown_minutes, 'SMS cooldown', 1, 1_440, false) ?? current.sms_cooldown_minutes, template, boundedNumber(body.telemetry_retention_days, 'Thời hạn telemetry', 7, 365, false) ?? current.telemetry_retention_days, optionalBoolean(body.helmet_detection_enabled, Boolean(current.helmet_detection_enabled)) ? 1 : 0, boundedNumber(body.helmet_grace_seconds, 'Thời gian xác nhận mũ', 15, 300, false) ?? current.helmet_grace_seconds, boundedNumber(body.helmet_min_speed_kmh, 'Tốc độ kiểm tra mũ', 1, 30, false) ?? current.helmet_min_speed_kmh, now, context.schoolId).run();
    await audit(context, 'settings.update', 'system_settings', context.schoolId);
    if (body.helmet_detection_enabled === false) {
      await env.DB.batch([
        env.DB.prepare('UPDATE devices SET helmet_missing_since = NULL, helmet_alert_active = 0 WHERE school_id = ?').bind(context.schoolId),
        env.DB.prepare("UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE school_id = ? AND type = 'helmet_missing' AND status = 'open'").bind(now, context.schoolId),
        env.DB.prepare("UPDATE helmet_sms_jobs SET status = 'cancelled', updated_at = ? WHERE school_id = ? AND status = 'queued'").bind(now, context.schoolId),
      ]);
    }
    return json({ success: true });
  } catch (error) { return apiError(error); }
}
