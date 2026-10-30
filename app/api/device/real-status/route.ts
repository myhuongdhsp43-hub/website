import { env } from 'cloudflare:workers';
import { ApiError, apiError, json } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const rawDeviceId = (url.searchParams.get('device_id') || '').toUpperCase().trim();
    const verifyCode = (url.searchParams.get('verify_code') || '').trim();

    if (!rawDeviceId && !verifyCode) {
      throw new ApiError(400, 'Cần cung cấp device_id hoặc verify_code từ mã QR của thiết bị.', 'missing_params');
    }

    // Tìm thiết bị trong DB
    let device = null;
    if (verifyCode) {
      device = await env.DB.prepare(`
        SELECT d.id, d.school_id, d.device_id, d.device_name, d.verify_code, d.device_token,
               d.pairing_pending, d.pairing_requested_at, d.paired_at, d.student_id, d.last_seen,
               d.token_synced_at, s.full_name AS student_name, s.class_name AS student_class,
               sc.name AS school_name
        FROM devices d
        LEFT JOIN students s ON s.id = d.student_id
        LEFT JOIN schools sc ON sc.id = d.school_id
        WHERE d.verify_code = ?
      `).bind(verifyCode).first<{
        id: string;
        school_id: string;
        device_id: string;
        device_name: string;
        verify_code: string | null;
        device_token: string | null;
        pairing_pending: number;
        pairing_requested_at: string | null;
        paired_at: string | null;
        student_id: string | null;
        last_seen: string | null;
        token_synced_at: string | null;
        student_name: string | null;
        student_class: string | null;
        school_name: string | null;
      }>();
    }

    if (!device && rawDeviceId) {
      device = await env.DB.prepare(`
        SELECT d.id, d.school_id, d.device_id, d.device_name, d.verify_code, d.device_token,
               d.pairing_pending, d.pairing_requested_at, d.paired_at, d.student_id, d.last_seen,
               d.token_synced_at, s.full_name AS student_name, s.class_name AS student_class,
               sc.name AS school_name
        FROM devices d
        LEFT JOIN students s ON s.id = d.student_id
        LEFT JOIN schools sc ON sc.id = d.school_id
        WHERE d.device_id = ?
      `).bind(rawDeviceId).first();
    }

    if (!device) {
      throw new ApiError(404, 'Thiết bị không tồn tại trong hệ thống! Hãy kiểm tra lại mã QR trên xe hoặc liên hệ quản trị viên.', 'device_not_found');
    }

    // Nếu người dùng gửi verifyCode nhưng không khớp với thiết bị
    if (verifyCode && device.verify_code && device.verify_code.trim() !== verifyCode) {
      throw new ApiError(401, 'Mã xác thực phần cứng không khớp với bo mạch của xe này.', 'invalid_verify_code');
    }

    const nowMs = Date.now();
    const requestedAtMs = device.pairing_requested_at ? new Date(device.pairing_requested_at).getTime() : 0;
    const isPairingFresh = device.pairing_pending === 1 && (nowMs - requestedAtMs < 60 * 60 * 1000);
    const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : 0;
    const isRecentlyActive = (nowMs - lastSeenMs < 60 * 60 * 1000);

    const hardwareOnline = isPairingFresh || isRecentlyActive;
    const isPaired = Boolean(device.student_id);
    const tokenSynced = Boolean(device.token_synced_at) || (isPaired && isRecentlyActive);

    let statusLabel: 'ONLINE' | 'OFFLINE' | 'PAIRING_READY' | 'TOKEN_SYNCED' = 'OFFLINE';
    let statusMessage = 'Chưa nhận được tín hiệu từ xe. Vui lòng bật nguồn và nhấn nút BOOT trên xe để kết nối thật.';

    if (tokenSynced) {
      statusLabel = 'TOKEN_SYNCED';
      statusMessage = 'Thiết bị đã kết nối REAL-TIME! Bo mạch đã nạp token vào bộ nhớ Flash NVS và đang hoạt động.';
    } else if (isPairingFresh) {
      statusLabel = 'PAIRING_READY';
      statusMessage = 'Đã nhận được tín hiệu 4G từ nút BOOT trên xe! Sẵn sàng ghép đôi ngay.';
    } else if (hardwareOnline) {
      statusLabel = 'ONLINE';
      statusMessage = 'Thiết bị đang hoạt động trên mạng 4G. Vui lòng nhấn nút BOOT trên xe để kích hoạt chế độ ghép đôi.';
    }

    return json({
      success: true,
      device: {
        id: device.id,
        device_id: device.device_id,
        device_name: device.device_name,
        verify_code: device.verify_code,
        school_id: device.school_id,
        school_name: device.school_name,
        student_id: device.student_id,
        student_name: device.student_name,
        student_class: device.student_class,
        paired: isPaired,
        hardware_online: hardwareOnline,
        pairing_pending: device.pairing_pending,
        pairing_requested_at: device.pairing_requested_at,
        seconds_since_button_press: requestedAtMs ? Math.max(0, Math.round((nowMs - requestedAtMs) / 1000)) : null,
        last_seen: device.last_seen,
        token_synced: tokenSynced,
        token_synced_at: device.token_synced_at,
        status_label: statusLabel,
        message: statusMessage,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
