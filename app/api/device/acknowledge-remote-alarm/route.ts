import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, readJson, requiredText } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const deviceId = requiredText(body.device_id, 'device_id', 64);
    const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    const token = authHeader || (typeof body.device_token === 'string' ? body.device_token.trim() : typeof body.token === 'string' ? body.token.trim() : '');
    if (!token) throw new ApiError(401, 'Thiếu token xác thực thiết bị.', 'device_unauthorized');
    const tokenHash = await sha256(token);
    const device = await env.DB.prepare('SELECT id, device_id, school_id, enabled FROM devices WHERE device_id = ? AND device_token_hash = ?').bind(deviceId, tokenHash).first<{ id: string; device_id: string; school_id: string; enabled: number }>();
    if (!device) throw new ApiError(401, 'Thiết bị không được xác thực.', 'device_unauthorized');
    if (!device.enabled) throw new ApiError(403, 'Thiết bị đang bị tắt.', 'device_disabled');
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE device_configs SET remote_alarm = 0, last_alarm_sounded_at = ?, updated_at = ? WHERE device_id = ?').bind(now, now, device.id),
      env.DB.prepare(`
        INSERT INTO audit_logs (id, school_id, user_id, action, entity, entity_id, metadata, created_at)
        VALUES (?, ?, 'system', 'device.alarm_sounded', 'device', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        device.school_id,
        device.id,
        JSON.stringify({ deviceId: device.device_id, status: 'sounded_success', sounded_at: now }),
        now
      ),
    ]);
    return json({ success: true, message: 'Đã xác nhận còi đã kêu thành công.' });
  } catch (error) { return apiError(error); }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, '0')).join('');
}
