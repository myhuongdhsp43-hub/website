import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, readJson } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

const MASTER_ADMIN_KEY = 'Admin123@';

function verifyMasterKey(request: Request, body?: any) {
  const headerKey = request.headers.get('x-master-admin-key');
  const bodyKey = body?.master_key;
  if (headerKey !== MASTER_ADMIN_KEY && bodyKey !== MASTER_ADMIN_KEY) {
    throw new ApiError(401, 'Mã quản trị viên (Admin Key) không chính xác!', 'unauthorized');
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await readJson(request);
    verifyMasterKey(request, body);

    const action = body.action || 'GET_DATA';

    // 1. LẤY TOÀN BỘ DỮ LIỆU HỆ THỐNG
    if (action === 'GET_DATA') {
      const [devicesRes, usersRes, schoolsRes] = await Promise.all([
        env.DB.prepare(`
          SELECT d.id, d.device_id, d.device_name, d.verify_code, d.enabled, d.last_seen, d.paired_at,
                 d.device_token_hash, d.created_at,
                 s.full_name AS student_name, s.student_code, s.class_name,
                 sc.name AS school_name, sc.id AS school_id
          FROM devices d
          LEFT JOIN schools sc ON sc.id = d.school_id
          LEFT JOIN students s ON s.id = d.student_id
          ORDER BY d.created_at DESC
        `).all(),
        env.DB.prepare(`
          SELECT u.id, u.username, u.email, u.role, u.active, u.created_at, sc.name AS school_name
          FROM users u
          LEFT JOIN schools sc ON sc.id = u.school_id
          ORDER BY u.created_at DESC
        `).all(),
        env.DB.prepare(`
          SELECT id, name, address, created_at FROM schools ORDER BY name ASC
        `).all(),
      ]);

      return json({
        success: true,
        data: {
          devices: devicesRes.results || [],
          users: usersRes.results || [],
          schools: schoolsRes.results || [],
        },
      });
    }

    // 2. SINH MÃ XÁC THỰC NGẪU NHIÊN TỪ 1 ĐẾN 1.000.000.000
    if (action === 'GENERATE_RANDOM_CODE') {
      const existing = await env.DB.prepare('SELECT verify_code FROM devices WHERE verify_code IS NOT NULL').all();
      const usedCodes = new Set((existing.results || []).map((r: any) => String(r.verify_code)));

      let randomCode = '';
      for (let i = 0; i < 100; i++) {
        // Sinh số ngẫu nhiên từ 1 đến 1.000.000.000
        const num = Math.floor(Math.random() * 999_999_999) + 1;
        const candidate = String(num);
        if (!usedCodes.has(candidate)) {
          randomCode = candidate;
          break;
        }
      }
      if (!randomCode) {
        randomCode = String((Date.now() % 1_000_000_000) + 1);
      }

      // Gợi ý số thứ tự xe tiếp theo
      const totalDevices = await env.DB.prepare('SELECT COUNT(*) AS count FROM devices').first<{ count: number }>();
      const nextIndex = (totalDevices?.count || 0) + 1;
      const suggestedDeviceId = `XE${String(nextIndex).padStart(2, '0')}`;

      return json({
        success: true,
        generated_code: randomCode,
        suggested_device_id: suggestedDeviceId,
      });
    }

    // 3. TẠO THIẾT BỊ XUẤT XƯỞNG MỚI (PRE-PROVISION)
    if (action === 'CREATE_DEVICE') {
      const deviceId = String(body.device_id || '').toUpperCase().trim();
      const verifyCode = String(body.verify_code || '').trim();
      const schoolId = String(body.school_id || '').trim();
      const deviceName = String(body.device_name || `Thiết bị ${deviceId}`).trim();

      if (!/^[A-Z0-9_-]{3,64}$/.test(deviceId)) {
        throw new ApiError(400, 'Mã xe không hợp lệ (từ 3-64 ký tự chữ hoa, số hoặc gạch nối).', 'validation_error');
      }
      if (!/^[0-9]{1,10}$/.test(verifyCode) || BigInt(verifyCode) < 1n || BigInt(verifyCode) > 1000000000n) {
        throw new ApiError(400, 'Mã xác thực phải là số nguyên từ 1 đến 1.000.000.000 (tối đa 10 chữ số).', 'validation_error');
      }

      // Kiểm tra trùng mã xác thực
      const dupCode = await env.DB.prepare('SELECT id, device_id FROM devices WHERE verify_code = ?').bind(verifyCode).first();
      if (dupCode) {
        throw new ApiError(409, `Mã xác thực ${verifyCode} đã được gán cho thiết bị ${(dupCode as any).device_id}.`, 'conflict');
      }

      // Lấy trường học
      let targetSchoolId = schoolId;
      if (!targetSchoolId) {
        const firstSchool = await env.DB.prepare('SELECT id FROM schools LIMIT 1').first<{ id: string }>();
        targetSchoolId = firstSchool?.id || '';
      }
      if (!targetSchoolId) {
        targetSchoolId = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.DB.prepare('INSERT INTO schools (id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(targetSchoolId, 'Trường THCS Mặc Định', 'Asia/Ho_Chi_Minh', now, now).run();
      }

      const newId = crypto.randomUUID();
      const configId = crypto.randomUUID();
      const rawToken = createDeviceToken();
      const tokenHash = await sha256(rawToken);
      const now = new Date().toISOString();

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO devices (id, school_id, device_id, device_name, device_token_hash, verify_code, enabled, gps_valid, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
        `).bind(newId, targetSchoolId, deviceId, deviceName, tokenHash, verifyCode, now, now),
        env.DB.prepare(`
          INSERT INTO device_configs (id, device_id, speed_limit, speed_alert_enabled, buzzer_enabled, remote_alarm, version, created_at, updated_at)
          VALUES (?, ?, 40, 1, 1, 0, 1, ?, ?)
        `).bind(configId, newId, now, now),
      ]);

      return json({
        success: true,
        message: 'Tạo thiết bị xuất xưởng thành công!',
        device: {
          id: newId,
          device_id: deviceId,
          verify_code: verifyCode,
          device_token: rawToken,
        },
      });
    }

    // 4. XÓA THIẾT BỊ
    if (action === 'DELETE_DEVICE') {
      const id = String(body.id || '').trim();
      if (!id) throw new ApiError(400, 'Thiếu id thiết bị.', 'validation_error');
      await env.DB.batch([
        env.DB.prepare('DELETE FROM telemetry WHERE device_id = ?').bind(id),
        env.DB.prepare('DELETE FROM overspeed_events WHERE device_id = ?').bind(id),
        env.DB.prepare('DELETE FROM device_configs WHERE device_id = ?').bind(id),
        env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id),
      ]);
      return json({ success: true, message: 'Đã xóa thiết bị thành công.' });
    }

    throw new ApiError(400, 'Hành động không hợp lệ.', 'bad_action');
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
