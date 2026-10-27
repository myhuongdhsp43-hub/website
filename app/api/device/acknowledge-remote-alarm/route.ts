import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, readJson, requiredText } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const deviceId = requiredText(body.device_id, 'device_id', 64);
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new ApiError(401, 'Thiếu bearer token.', 'device_unauthorized');
    const tokenHash = await sha256(token);
    const device = await env.DB.prepare('SELECT id, enabled FROM devices WHERE device_id = ? AND device_token_hash = ?').bind(deviceId, tokenHash).first<{ id: string; enabled: number }>();
    if (!device) throw new ApiError(401, 'Thiết bị không được xác thực.', 'device_unauthorized');
    if (!device.enabled) throw new ApiError(403, 'Thiết bị đang bị tắt.', 'device_disabled');
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE device_configs SET remote_alarm = 0, updated_at = ? WHERE device_id = ?').bind(now, device.id).run();
    return json({ success: true });
  } catch (error) { return apiError(error); }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, '0')).join('');
}
