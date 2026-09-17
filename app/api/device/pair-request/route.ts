import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, readJson, requiredText } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await readJson(request);

    const deviceId = requiredText(body.device_id, 'device_id', 64).toUpperCase().trim();
    const verifySecret = requiredText(body.verify_secret, 'verify_secret', 64).trim();
    if (!/^[0-9]{1,10}$/.test(verifySecret) || BigInt(verifySecret) < 1n || BigInt(verifySecret) > 1000000000n) {
      throw new ApiError(400, 'verify_secret phải là số từ 1 đến 1.000.000.000 (tối đa 10 chữ số).', 'validation_error');
    }
    const now = new Date().toISOString();

    // Kiểm tra thiết bị có tồn tại trong hệ thống không
    const existing = await env.DB.prepare('SELECT id FROM devices WHERE device_id = ?').bind(deviceId).first();
    if (!existing) {
      throw new ApiError(404, 'Thiết bị chưa được đăng ký trong hệ thống! Vui lòng đăng ký thiết bị trước.', 'device_not_found');
    }

    // Cập nhật trạng thái chờ ghép đôi cho thiết bị
    await env.DB.prepare(
      'UPDATE devices SET pairing_pending = 1, pairing_requested_at = ?, verify_code = ?, updated_at = ? WHERE device_id = ?'
    ).bind(now, verifySecret, now, deviceId).run();

    return json({
      success: true,
      message: 'Thiết bị đã chuyển sang chế độ chờ ghép đôi (pairing mode).',
      device_id: deviceId,
      pairing_requested_at: now,
    });
  } catch (error) {
    return apiError(error);
  }
}
