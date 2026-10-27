import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, readJson, requiredText, optionalText } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await readJson(request);

    // Mã ID xe người dùng tự đặt (Custom Device ID)
    const rawDeviceId = requiredText(body.device_id, 'Mã xe tự chọn (device_id)', 64).toUpperCase().trim();
    if (!/^[A-Z0-9_-]{3,64}$/.test(rawDeviceId)) {
      throw new ApiError(400, 'Mã xe không hợp lệ (từ 3-64 ký tự chữ hoa, số hoặc gạch nối).', 'validation_error');
    }

    // Mã xác thực phần cứng nạp trong code thiết bị (từ 1 đến 1.000.000.000, tối đa 10 chữ số)
    const verifyCode = requiredText(body.verify_code, 'Mã xác thực phần cứng (verify_code)', 64).trim();
    if (!/^[0-9]{1,10}$/.test(verifyCode) || BigInt(verifyCode) < 1n || BigInt(verifyCode) > 1000000000n) {
      throw new ApiError(400, 'Mã xác thực phần cứng phải là số từ 1 đến 1.000.000.000 (tối đa 10 chữ số).', 'invalid_verify_code_format');
    }
    const studentName = requiredText(body.student_name, 'Họ và tên học sinh', 100).trim();
    const studentClass = requiredText(body.student_class, 'Lớp học', 32).trim().toUpperCase();
    const schoolIdInput = optionalText(body.school_id, 'Trường học', 64);
    const parentPhone = optionalText(body.parent_phone, 'Số điện thoại phụ huynh', 20)?.trim();
    const parentName = optionalText(body.parent_name, 'Tên phụ huynh', 100)?.trim() || `Phụ huynh em ${studentName}`;

    // 1. Xác định trường học
    let school = null;
    if (schoolIdInput) {
      school = await env.DB.prepare('SELECT id, name FROM schools WHERE id = ?').bind(schoolIdInput).first<{ id: string; name: string }>();
    }
    if (!school) {
      school = await env.DB.prepare('SELECT id, name FROM schools ORDER BY created_at ASC LIMIT 1').first<{ id: string; name: string }>();
    }
    if (!school) {
      const newSchoolId = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO schools (id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(newSchoolId, 'Trường THCS Mặc Định', 'Asia/Ho_Chi_Minh', now, now).run();
      school = { id: newSchoolId, name: 'Trường THCS Mặc Định' };
    }

    const schoolId = school.id;
    const now = new Date().toISOString();

    // 2. Tìm hoặc khởi tạo thiết bị: hỗ trợ tìm theo Custom Device ID hoặc Hardware Verify Code
    let device = await env.DB.prepare(
      'SELECT id, school_id, device_id, device_name, verify_code, pairing_pending, pairing_requested_at, student_id, enabled FROM devices WHERE school_id = ? AND (device_id = ? OR verify_code = ?)'
    ).bind(schoolId, rawDeviceId, verifyCode).first<{
      id: string;
      school_id: string;
      device_id: string;
      device_name: string;
      verify_code: string | null;
      pairing_pending: number;
      pairing_requested_at: string | null;
      student_id: string | null;
      enabled: number;
    }>();

    if (device) {
      // Nếu thiết bị đã có mã verify_code nhưng khác mã học sinh nhập -> từ chối
      if (device.verify_code && device.verify_code.trim() !== verifyCode) {
        throw new ApiError(400, 'ID xác minh không chính xác! Vui lòng kiểm tra lại mã được khai báo trong code thiết bị.', 'invalid_verify_code');
      }
    } else {
      // Chưa có trong DB -> Tự động tạo thiết bị với Custom ID và mã xác thực phần cứng này
      const newDeviceId = crypto.randomUUID();
      const rawToken = createDeviceToken();
      const tokenHash = await sha256(rawToken);
      const configId = crypto.randomUUID();

      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO devices (id, school_id, device_id, device_name, device_token_hash, verify_code, enabled, gps_valid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(newDeviceId, schoolId, rawDeviceId, `Xe của ${studentName}`, tokenHash, verifyCode, 1, 0, now, now),
        env.DB.prepare(
          'INSERT INTO device_configs (id, device_id, speed_limit, speed_alert_enabled, buzzer_enabled, remote_alarm, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(configId, newDeviceId, 40, 1, 1, 0, 1, now, now),
      ]);

      device = {
        id: newDeviceId,
        school_id: schoolId,
        device_id: rawDeviceId,
        device_name: `Xe của ${studentName}`,
        verify_code: verifyCode,
        pairing_pending: 0,
        pairing_requested_at: null,
        student_id: null,
        enabled: 1,
      };
    }

    // 3. Tạo hồ sơ học sinh
    const studentId = crypto.randomUUID();
    const studentCode = `HS-${studentClass}-${Date.now().toString().slice(-4)}`;

    await env.DB.prepare(
      'INSERT INTO students (id, school_id, student_code, full_name, class_name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(studentId, schoolId, studentCode, studentName, studentClass, 1, now, now).run();

    // 4. Lưu thông tin phụ huynh nếu có
    if (parentPhone) {
      await env.DB.prepare(
        'INSERT INTO parent_contacts (id, student_id, name, relationship, phone, sms_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), studentId, parentName, 'Phụ huynh', parentPhone, 1, now, now).run();
    }

    // 5. Nối thiết bị với học sinh và lưu Custom ID + Verify Code
    await env.DB.prepare(
      'UPDATE devices SET student_id = ?, device_id = ?, device_name = ?, verify_code = ?, paired_at = ?, pairing_pending = 0, enabled = 1, updated_at = ? WHERE id = ?'
    ).bind(studentId, rawDeviceId, `Xe của ${studentName} (${studentClass})`, verifyCode, now, now, device.id).run();

    return json({
      success: true,
      message: 'Xác thực và ghép đôi thiết bị thành công!',
      data: {
        device_id: rawDeviceId,
        student_name: studentName,
        student_class: studentClass,
        school_name: school.name,
        paired_at: now,
      },
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
