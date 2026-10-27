import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, readJson, requiredText } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

async function handleGetOrPost(request: Request, isGet: boolean) {
  try {
    await ensureSchema();
    let rawDeviceId = '';
    let verifySecret = '';

    if (isGet) {
      const url = new URL(request.url);
      rawDeviceId = (url.searchParams.get('device_id') || '').toUpperCase().trim();
      verifySecret = (url.searchParams.get('verify_secret') || '').trim();
    } else {
      const body = await readJson(request);
      rawDeviceId = requiredText(body.device_id, 'device_id', 64).toUpperCase().trim();
      verifySecret = requiredText(body.verify_secret, 'verify_secret', 64).trim();
    }

    if (!rawDeviceId) {
      throw new ApiError(400, 'Thiếu device_id.', 'validation_error');
    }
    if (!verifySecret) {
      throw new ApiError(400, 'Thiếu verify_secret.', 'validation_error');
    }
    if (!/^[0-9]{1,10}$/.test(verifySecret) || BigInt(verifySecret) < 1n || BigInt(verifySecret) > 1000000000n) {
      throw new ApiError(400, 'verify_secret phải là số từ 1 đến 1.000.000.000 (tối đa 10 chữ số).', 'invalid_verify_secret_format');
    }

    const device = await env.DB.prepare(`
      SELECT d.id, d.school_id, d.device_id, d.device_name, d.verify_code, d.device_token, d.student_id,
             s.full_name AS student_name, s.class_name, sc.name AS school_name,
             c.speed_limit, c.speed_alert_enabled, c.buzzer_enabled
      FROM devices d
      LEFT JOIN students s ON s.id = d.student_id
      LEFT JOIN schools sc ON sc.id = d.school_id
      LEFT JOIN device_configs c ON c.device_id = d.id
      WHERE d.device_id = ?
    `).bind(rawDeviceId).first<{
      id: string;
      school_id: string;
      device_id: string;
      device_name: string;
      verify_code: string | null;
      device_token: string | null;
      student_id: string | null;
      student_name: string | null;
      class_name: string | null;
      school_name: string | null;
      speed_limit: number | null;
      speed_alert_enabled: number | null;
      buzzer_enabled: number | null;
    }>();

    if (!device) {
      throw new ApiError(404, `Thiết bị ${rawDeviceId} không tồn tại trong hệ thống!`, 'device_not_found');
    }

    if (device.verify_code && device.verify_code.trim() !== verifySecret) {
      throw new ApiError(401, 'Mã xác thực phần cứng (verify_secret) không chính xác!', 'invalid_verify_secret');
    }

    const origin = new URL(request.url).origin;

    // Trường hợp 1: Thiết bị chưa được liên kết với học sinh trên Web
    if (!device.student_id) {
      return json({
        success: true,
        paired: false,
        device_id: device.device_id,
        message: 'Thiết bị hợp lệ nhưng đang chờ học sinh quét mã QR và kích hoạt trên web.',
      });
    }

    // Trường hợp 2: Thiết bị đã ghép đôi thành công -> Cấp token để bo mạch lưu vào Flash
    let deviceToken = device.device_token;
    const now = new Date().toISOString();
    if (!deviceToken) {
      deviceToken = createDeviceToken();
      const tokenHash = await sha256(deviceToken);
      await env.DB.prepare(
        'UPDATE devices SET device_token = ?, device_token_hash = ?, token_synced_at = ?, pairing_pending = 0, updated_at = ? WHERE id = ?'
      ).bind(deviceToken, tokenHash, now, now, device.id).run();
    } else {
      // Ghi nhận thiết bị phần cứng đã kết nối và lấy token thành công vào Flash (NVS)
      await env.DB.prepare(
        'UPDATE devices SET token_synced_at = ?, pairing_pending = 0, updated_at = ? WHERE id = ?'
      ).bind(now, now, device.id).run();
    }

    return json({
      success: true,
      paired: true,
      device_id: device.device_id,
      device_token: deviceToken,
      telemetry_url: `${origin}/api/device/telemetry`,
      remote_alarm_ack_url: `${origin}/api/device/acknowledge-remote-alarm`,
      speed_limit: device.speed_limit ?? 40,
      student_name: device.student_name,
      class_name: device.class_name,
      school_name: device.school_name,
      message: 'Thiết bị đã ghép đôi thành công! Cấp token phần cứng lưu vào bộ nhớ Flash (NVS).',
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  return handleGetOrPost(request, true);
}

export async function POST(request: Request) {
  return handleGetOrPost(request, false);
}

function createDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'dt_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, '0')).join('');
}
