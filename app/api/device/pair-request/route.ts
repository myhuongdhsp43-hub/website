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
    const device = await env.DB.prepare(
      'SELECT id, device_id, verify_code, device_token, student_id FROM devices WHERE device_id = ?'
    ).bind(deviceId).first<{
      id: string;
      device_id: string;
      verify_code: string | null;
      device_token: string | null;
      student_id: string | null;
    }>();

    if (!device) {
      throw new ApiError(404, 'Thiết bị chưa được đăng ký trong hệ thống! Vui lòng đăng ký thiết bị trước.', 'device_not_found');
    }

    if (device.verify_code && device.verify_code.trim() !== verifySecret) {
      throw new ApiError(401, 'Mã xác thực phần cứng không khớp!', 'invalid_verify_secret');
    }

    // Cập nhật trạng thái chờ ghép đôi cho thiết bị
    await env.DB.prepare(
      'UPDATE devices SET pairing_pending = 1, pairing_requested_at = ?, verify_code = ?, updated_at = ? WHERE device_id = ?'
    ).bind(now, verifySecret, now, deviceId).run();

    const origin = new URL(request.url).origin;
    const isPaired = Boolean(device.student_id);

    let deviceToken = device.device_token;
    if (isPaired && !deviceToken) {
      deviceToken = createDeviceToken();
      const tokenHash = await sha256(deviceToken);
      await env.DB.prepare(
        'UPDATE devices SET device_token = ?, device_token_hash = ?, updated_at = ? WHERE id = ?'
      ).bind(deviceToken, tokenHash, now, device.id).run();
    }

    return json({
      success: true,
      paired: isPaired,
      device_id: deviceId,
      device_token: isPaired ? deviceToken : null,
      telemetry_url: `${origin}/api/device/telemetry`,
      remote_alarm_ack_url: `${origin}/api/device/acknowledge-remote-alarm`,
      pairing_requested_at: now,
      message: isPaired
        ? 'Thiết bị đã được liên kết trên web! Cấp token cho phần cứng lưu vào Flash.'
        : 'Thiết bị đã chuyển sang chế độ chờ ghép đôi (pairing mode).',
    });
  } catch (error) {
    return apiError(error);
  }
}

function createDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'dt_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, '0')).join('');
}
