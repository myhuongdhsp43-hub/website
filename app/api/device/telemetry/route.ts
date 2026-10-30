import { env } from 'cloudflare:workers';
import { ApiError, apiError, boundedNumber, json, readJson, requiredText } from '@/lib/server/http';
import { renderSmsTemplate, sendSms } from '@/lib/server/sms';
import { determineOverspeedTransition } from '@/lib/domain/overspeed.mjs';
import { helmetDecision, normalizeSmsPhone, helmetSmsMessage, supportsHelmetSms } from '@/lib/domain/helmet.mjs';
import { acknowledgeHelmetSms, nextHelmetSms } from '@/lib/server/helmet-sms';

type DeviceRow = {
  id: string;
  device_id: string;
  last_seen: string | null;
  helmet_alert_active: number;
  school_id: string;
  student_id: string | null;
  device_token_hash: string;
  enabled: number;
  speed_limit: number;
  speed_alert_enabled: number;
  buzzer_enabled: number;
  remote_alarm: number;
  version: number;
  helmet_worn: number | null;
  helmet_missing_since: string | null;
  helmet_alert_sent_at: string | null;
  firmware_version: string | null;
};

type ActiveEvent = { id: string; sms_sent: number; max_speed: number };

const MAX_REQUESTS_PER_MINUTE = 40;

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const deviceId = requiredText(body.device_id, 'device_id', 64);
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(deviceId)) throw new ApiError(400, 'device_id chỉ gồm chữ, số, gạch dưới hoặc gạch ngang.', 'validation_error');
    const token = getBearerToken(request);
    const tokenHash = await sha256(token);
    const device = await env.DB.prepare(`SELECT d.id, d.device_id, d.last_seen, d.helmet_alert_active, d.school_id, d.student_id, d.device_token_hash, d.enabled, d.firmware_version,
      c.speed_limit, c.speed_alert_enabled, c.buzzer_enabled, c.remote_alarm, c.version,
      d.helmet_worn, d.helmet_missing_since, d.helmet_alert_sent_at
      FROM devices d JOIN device_configs c ON c.device_id = d.id
      WHERE d.device_id = ? AND d.device_token_hash = ?`).bind(deviceId, tokenHash).first<DeviceRow>();
    if (!device || !tokenHash) throw new ApiError(401, 'Thiết bị không được xác thực.', 'device_unauthorized');
    if (!device.enabled) throw new ApiError(403, 'Thiết bị đang bị tắt.', 'device_disabled');
    await enforceRateLimit(device.id);
    await acknowledgeHelmetSms(device.id, device.school_id, body);

    const speed = boundedNumber(body.speed, 'speed', 0, 160)!;
    const gpsValid = requiredBoolean(body.gps_valid, 'gps_valid');
    const latitude = boundedNumber(body.latitude, 'latitude', -90, 90, gpsValid);
    const longitude = boundedNumber(body.longitude, 'longitude', -180, 180, gpsValid);
    const satellites = boundedNumber(body.satellites, 'satellites', 0, 99, false);
    const hdop = boundedNumber(body.hdop, 'hdop', 0, 99.9, false);
    const networkSignal = boundedNumber(body.network_signal, 'network_signal', 0, 31, false);
    const overspeedActive = requiredBoolean(body.overspeed_active, 'overspeed_active');
    const helmetWorn = typeof body.helmet_worn === 'boolean' ? body.helmet_worn : null;
    const sampleId = requiredText(body.sample_id, 'sample_id', 80);
    const recordedAt = parseTimestamp(body.timestamp);
    const firmwareVersion = typeof body.firmware_version === 'string' ? body.firmware_version.trim().slice(0, 60) || null : null;

    const duplicate = await env.DB.prepare('SELECT id FROM telemetry WHERE device_id = ? AND sample_id = ?').bind(device.id, sampleId).first();
    if (!duplicate) {
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO telemetry (id, device_id, recorded_at, received_at, sample_id, speed, latitude, longitude, gps_valid, satellites, hdop, network_signal, overspeed_active, helmet_worn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), device.id, recordedAt, now, sampleId, speed, latitude, longitude, gpsValid ? 1 : 0, satellites, hdop, networkSignal, overspeedActive ? 1 : 0, helmetWorn === null ? null : helmetWorn ? 1 : 0),
        env.DB.prepare('UPDATE devices SET last_seen = ?, last_telemetry_at = ?, last_latitude = ?, last_longitude = ?, current_speed = ?, gps_valid = ?, satellites = ?, hdop = ?, network_signal = ?, helmet_worn = ?, helmet_last_seen_at = CASE WHEN ? = 1 THEN ? ELSE helmet_last_seen_at END, firmware_version = COALESCE(?, firmware_version), updated_at = ? WHERE id = ?').bind(now, now, latitude, longitude, speed, gpsValid ? 1 : 0, satellites, hdop, networkSignal, helmetWorn === null ? null : helmetWorn ? 1 : 0, helmetWorn ? 1 : 0, now, firmwareVersion, now, device.id),
      ]);
      await updateOverspeedEvent(device, { speed, latitude, longitude, gpsValid, overspeedActive, recordedAt });
      await updateHelmetSafety(device, { speed, helmetWorn, latitude, longitude, gpsValid, recordedAt });
    }

    const effectiveFirmware = firmwareVersion || device.firmware_version;
    const sms = supportsHelmetSms(effectiveFirmware) ? await nextHelmetSms(device.id, device.school_id) : {};
    return json({ success: true, config: { ...toDeviceConfig(device), ...sms } });
  } catch (error) {
    return apiError(error);
  }
}

async function updateHelmetSafety(device: DeviceRow, point: { speed: number; helmetWorn: boolean | null; latitude: number | null; longitude: number | null; gpsValid: boolean; recordedAt: string }) {
  const setting = await env.DB.prepare('SELECT helmet_detection_enabled, helmet_grace_seconds, helmet_min_speed_kmh, sms_enabled, send_location, sms_cooldown_minutes FROM system_settings WHERE school_id = ?').bind(device.school_id).first<{ helmet_detection_enabled: number; helmet_grace_seconds: number; helmet_min_speed_kmh: number; sms_enabled: number; send_location: number; sms_cooldown_minutes: number }>();
  if (!setting) return;
  const now = new Date().toISOString();
  const decision = helmetDecision({ enabled: Boolean(setting.helmet_detection_enabled), worn: point.helmetWorn, gpsValid: point.gpsValid, speed: point.speed, minSpeed: setting.helmet_min_speed_kmh, graceSeconds: setting.helmet_grace_seconds, missingSince: device.helmet_missing_since, lastSeenAt: device.last_seen, nowMs: Date.parse(now), active: Boolean(device.helmet_alert_active) });
  if (decision === 'clear') {
    await env.DB.batch([
      env.DB.prepare('UPDATE devices SET helmet_missing_since = NULL, helmet_alert_active = 0 WHERE id = ? AND school_id = ?').bind(device.id, device.school_id),
      env.DB.prepare("UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE device_id = ? AND school_id = ? AND type = 'helmet_missing' AND status = 'open'").bind(now, device.id, device.school_id),
      env.DB.prepare("UPDATE helmet_sms_jobs SET status = 'cancelled', updated_at = ? WHERE device_id = ? AND school_id = ? AND alert_id IS NOT NULL AND status = 'queued'").bind(now, device.id, device.school_id),
    ]);
    return;
  }
  if (decision === 'unknown' || decision === 'begin') {
    await env.DB.prepare('UPDATE devices SET helmet_missing_since = ? WHERE id = ? AND school_id = ?').bind(decision === 'begin' ? now : null, device.id, device.school_id).run();
    return;
  }
  if (decision !== 'alert') return;
  const claim = await env.DB.prepare('UPDATE devices SET helmet_alert_active = 1 WHERE id = ? AND school_id = ? AND helmet_alert_active = 0').bind(device.id, device.school_id).run();
  if (!claim.meta.changes) return;
  const alertId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO alerts (id, school_id, device_id, student_id, event_id, type, severity, title, message, status, created_at) VALUES (?, ?, ?, ?, NULL, 'helmet_missing', 'warning', ?, ?, 'open', ?)")
    .bind(alertId, device.school_id, device.id, device.student_id, 'Chưa nhận tín hiệu đội mũ bảo hiểm', `Xe đang chạy ${point.speed.toFixed(1)} km/h, chưa nhận tín hiệu đội mũ đủ thời gian xác nhận. Kiểm tra mũ, công tắc và nguồn bộ phát.`, now).run();
  if (!setting.sms_enabled || !device.student_id) return;
  // Keep the SMS cooldown across stops, brief radio recovery and new incidents.
  if (device.helmet_alert_sent_at && Date.parse(now) - Date.parse(device.helmet_alert_sent_at) < Math.max(5, setting.sms_cooldown_minutes) * 60_000) return;
  const contacts = await env.DB.prepare('SELECT DISTINCT c.phone FROM parent_contacts c JOIN students s ON s.id = c.student_id WHERE s.id = ? AND s.school_id = ? AND c.sms_enabled = 1')
    .bind(device.student_id, device.school_id).all<{ phone: string }>();
  const phones = [...new Set(contacts.results.map(contact => normalizeSmsPhone(contact.phone)).filter((phone): phone is string => phone !== null))];
  const message = helmetSmsMessage(device.device_id, point.speed, point.gpsValid ? point.latitude : null, point.gpsValid ? point.longitude : null, Boolean(setting.send_location));
  if (phones.length) await env.DB.batch([
    ...phones.map(phone => env.DB.prepare("INSERT INTO helmet_sms_jobs (id, school_id, device_id, alert_id, phone, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)").bind(crypto.randomUUID(), device.school_id, device.id, alertId, phone, message, now, now)),
    env.DB.prepare('UPDATE devices SET helmet_alert_sent_at = ? WHERE id = ? AND school_id = ?').bind(now, device.id, device.school_id),
  ]);
}

async function updateOverspeedEvent(device: DeviceRow, point: { speed: number; latitude: number | null; longitude: number | null; gpsValid: boolean; overspeedActive: boolean; recordedAt: string }) {
  const activeId = await env.DB.prepare('SELECT active_overspeed_event_id FROM devices WHERE id = ?').bind(device.id).first<{ active_overspeed_event_id: string | null }>();
  const transition = determineOverspeedTransition({ overspeedActive: point.overspeedActive, speedAlertEnabled: Boolean(device.speed_alert_enabled), hasOpenEvent: Boolean(activeId?.active_overspeed_event_id) });
  if (transition === 'start' || transition === 'update') {
    let eventId = activeId?.active_overspeed_event_id ?? null;
    if (!eventId) {
      const proposedId = crypto.randomUUID();
      const claimed = await env.DB.prepare('UPDATE devices SET active_overspeed_event_id = ? WHERE id = ? AND active_overspeed_event_id IS NULL').bind(proposedId, device.id).run();
      if (claimed.meta.changes > 0) {
        const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare('INSERT INTO overspeed_events (id, student_id, device_id, started_at, speed_limit, max_speed, latitude, longitude, gps_valid, sms_sent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(proposedId, device.student_id, device.id, point.recordedAt, device.speed_limit, point.speed, point.latitude, point.longitude, point.gpsValid ? 1 : 0, 0, now, now),
          env.DB.prepare('INSERT INTO alerts (id, school_id, device_id, student_id, event_id, type, severity, title, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), device.school_id, device.id, device.student_id, proposedId, 'overspeed', 'warning', 'Cảnh báo vượt tốc', `Thiết bị ghi nhận ${point.speed.toFixed(1)} km/h, giới hạn ${device.speed_limit.toFixed(1)} km/h.`, 'open', now),
        ]);
        eventId = proposedId;
      } else {
        const current = await env.DB.prepare('SELECT active_overspeed_event_id FROM devices WHERE id = ?').bind(device.id).first<{ active_overspeed_event_id: string | null }>();
        eventId = current?.active_overspeed_event_id ?? null;
      }
    }
    if (eventId) {
      await env.DB.prepare('UPDATE overspeed_events SET max_speed = MAX(max_speed, ?), latitude = ?, longitude = ?, gps_valid = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL').bind(point.speed, point.latitude, point.longitude, point.gpsValid ? 1 : 0, new Date().toISOString(), eventId).run();
      const event = await env.DB.prepare('SELECT id, sms_sent, max_speed FROM overspeed_events WHERE id = ?').bind(eventId).first<ActiveEvent>();
      if (event && !event.sms_sent) await sendEventSms(device, event.id, point.speed, point.latitude, point.longitude, point.gpsValid, point.recordedAt);
    }
  } else if (transition === 'end' && activeId?.active_overspeed_event_id) {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE overspeed_events SET ended_at = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL').bind(point.recordedAt, now, activeId.active_overspeed_event_id),
      env.DB.prepare('UPDATE devices SET active_overspeed_event_id = NULL, updated_at = ? WHERE id = ? AND active_overspeed_event_id = ?').bind(now, device.id, activeId.active_overspeed_event_id),
    ]);
  }
}

async function sendEventSms(device: DeviceRow, eventId: string, speed: number, latitude: number | null, longitude: number | null, gpsValid: boolean, recordedAt: string) {
  const setting = await env.DB.prepare('SELECT sms_enabled, send_location, sms_template FROM system_settings WHERE school_id = ?').bind(device.school_id).first<{ sms_enabled: number; send_location: number; sms_template: string }>();
  const student = device.student_id ? await env.DB.prepare('SELECT full_name, class_name, student_code FROM students WHERE id = ? AND school_id = ?').bind(device.student_id, device.school_id).first<{ full_name: string; class_name: string; student_code: string }>() : null;
  const contacts = device.student_id ? await env.DB.prepare(`SELECT c.phone FROM parent_contacts c
    JOIN students s ON s.id = c.student_id
    WHERE c.student_id = ? AND s.school_id = ? AND c.sms_enabled = 1`).bind(device.student_id, device.school_id).all<{ phone: string }>() : { results: [] };
  if (!setting?.sms_enabled || !student || contacts.results.length === 0) {
    await env.DB.prepare('UPDATE overspeed_events SET sms_sent = 1, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), eventId).run();
    return;
  }
  const mapLink = gpsValid && latitude !== null && longitude !== null && setting.send_location ? `Vị trí: https://www.google.com/maps?q=${latitude},${longitude}` : 'Vị trí chưa xác định.';
  const message = renderSmsTemplate(setting.sms_template, { student_name: student.full_name, class_name: student.class_name, student_code: student.student_code, speed: speed.toFixed(1), speed_limit: device.speed_limit.toFixed(1), overspeed_amount: Math.max(0, speed - device.speed_limit).toFixed(1), time: new Date(recordedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), location_link: mapLink });
  const now = new Date().toISOString();
  for (const contact of contacts.results) {
    const result = await sendSms(contact.phone, message);
    await env.DB.prepare('INSERT INTO sms_logs (id, event_id, phone, message, status, provider, provider_message_id, error_message, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), eventId, contact.phone, message, result.status, result.provider, result.providerMessageId ?? null, result.errorMessage ?? null, result.status === 'failed' ? null : now, now).run();
  }
  await env.DB.prepare('UPDATE overspeed_events SET sms_sent = 1, updated_at = ? WHERE id = ?').bind(now, eventId).run();
}

async function enforceRateLimit(deviceId: string) {
  const now = new Date();
  const timestamp = now.toISOString();
  const existing = await env.DB.prepare('SELECT window_started_at, request_count FROM device_request_limits WHERE device_id = ?').bind(deviceId).first<{ window_started_at: string; request_count: number }>();
  const freshWindow = !existing || now.getTime() - Date.parse(existing.window_started_at) >= 60_000;
  const count = freshWindow ? 1 : existing.request_count + 1;
  if (count > MAX_REQUESTS_PER_MINUTE) throw new ApiError(429, 'Thiết bị gửi dữ liệu quá nhanh. Hãy thử lại sau.', 'rate_limited');
  if (!existing) await env.DB.prepare('INSERT INTO device_request_limits (device_id, window_started_at, request_count, updated_at) VALUES (?, ?, ?, ?)').bind(deviceId, timestamp, count, timestamp).run();
  else await env.DB.prepare('UPDATE device_request_limits SET window_started_at = ?, request_count = ?, updated_at = ? WHERE device_id = ?').bind(freshWindow ? timestamp : existing.window_started_at, count, timestamp, deviceId).run();
}

function toDeviceConfig(device: DeviceRow) {
  return { speed_limit: device.speed_limit, speed_alert_enabled: Boolean(device.speed_alert_enabled), buzzer_enabled: Boolean(device.buzzer_enabled), remote_alarm: Boolean(device.remote_alarm), config_version: device.version };
}

function getBearerToken(request: Request) {
  const value = request.headers.get('authorization');
  if (!value?.startsWith('Bearer ')) throw new ApiError(401, 'Thiếu bearer token.', 'device_unauthorized');
  const token = value.slice(7).trim();
  if (token.length < 24 || token.length > 256) throw new ApiError(401, 'Bearer token không hợp lệ.', 'device_unauthorized');
  return token;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, '0')).join('');
}

function requiredBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new ApiError(400, `${label} phải là true hoặc false.`, 'validation_error');
  return value;
}

function parseTimestamp(value: unknown) {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  const text = requiredText(value, 'timestamp', 40);
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || Math.abs(Date.now() - date.getTime()) > 7 * 24 * 60 * 60 * 1000) throw new ApiError(400, 'timestamp không hợp lệ hoặc lệch quá 7 ngày.', 'validation_error');
  return date.toISOString();
}
