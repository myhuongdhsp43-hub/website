import { env } from 'cloudflare:workers';
import { requireAdmin, requireSchoolUser } from '@/lib/server/auth';
import { ApiError, apiError, json, readJson, requiredText } from '@/lib/server/http';
import { normalizeSmsPhone } from '@/lib/domain/helmet.mjs';

export async function GET() {
  try {
    const context = await requireSchoolUser();
    const [devices, jobs] = await Promise.all([
      env.DB.prepare('SELECT id, device_id, firmware_version, last_seen FROM devices WHERE school_id = ? AND enabled = 1 ORDER BY device_id').bind(context.schoolId).all(),
      env.DB.prepare('SELECT j.id, j.phone, j.status, j.detail, j.created_at, d.device_id FROM helmet_sms_jobs j JOIN devices d ON d.id = j.device_id AND d.school_id = j.school_id WHERE j.school_id = ? ORDER BY j.created_at DESC LIMIT 20').bind(context.schoolId).all(),
    ]);
    return json({ success: true, devices: devices.results, jobs: jobs.results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireAdmin(context);
    const body = await readJson(request);
    const id = requiredText(body.device_id, 'Thiết bị', 64);
    const phone = normalizeSmsPhone(body.phone);
    if (!phone) throw new ApiError(400, 'Số điện thoại chưa đúng. Dùng 0xxxxxxxxx hoặc +84xxxxxxxxx.', 'validation_error');
    const device = await env.DB.prepare('SELECT id, firmware_version FROM devices WHERE id = ? AND school_id = ? AND enabled = 1').bind(id, context.schoolId).first<{ id: string; firmware_version: string | null }>();
    if (!device) throw new ApiError(404, 'Không tìm thấy thiết bị của tài khoản này.', 'not_found');
    if (!device.firmware_version?.startsWith('2.4.')) throw new ApiError(400, 'Hãy nạp firmware 2.4 cho bo SIM và chờ thiết bị gửi dữ liệu lên web trước.', 'firmware_required');
    const recent = await env.DB.prepare("SELECT id FROM helmet_sms_jobs WHERE device_id = ? AND school_id = ? AND created_at > ? LIMIT 1").bind(id, context.schoolId, new Date(Date.now() - 60_000).toISOString()).first();
    if (recent) throw new ApiError(429, 'Đợi ít nhất 60 giây trước khi thử lại trên cùng thiết bị.', 'rate_limited');
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO helmet_sms_jobs (id, school_id, device_id, alert_id, phone, message, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, 'queued', ?, ?)")
      .bind(crypto.randomUUID(), context.schoolId, id, phone, 'TEST AN TOAN XE DIEN: Tin nhan duoc gui truc tiep tu SIM EG800K tren xe. Vui long kiem tra canh bao mu bao hiem.', now, now).run();
    return json({ success: true });
  } catch (error) { return apiError(error); }
}
