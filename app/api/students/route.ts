import { env } from 'cloudflare:workers';
import { audit, requireSchoolUser, requireWriteAccess } from '@/lib/server/auth';
import { apiError, json, optionalBoolean, optionalText, readJson, requiredText } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function GET() {
  try {
    const context = await requireSchoolUser();
    await ensureSchema();
    const results = await env.DB.prepare(`SELECT s.*, d.device_id, d.device_name FROM students s
      LEFT JOIN devices d ON d.student_id = s.id AND d.school_id = s.school_id
      WHERE s.school_id = ? ORDER BY s.full_name`).bind(context.schoolId).all();
    return json({ success: true, students: results.results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    await ensureSchema();
    const body = await readJson(request);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const studentCode = requiredText(body.student_code, 'Mã học sinh', 40).toUpperCase();
    const fullName = requiredText(body.full_name, 'Họ tên', 120);
    const className = requiredText(body.class_name, 'Lớp', 40);
    const active = optionalBoolean(body.active, true);
    await env.DB.prepare('INSERT INTO students (id, school_id, student_code, full_name, class_name, grade, academic_year, active, vehicle_plate, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, context.schoolId, studentCode, fullName, className, optionalText(body.grade, 'Khối', 20), optionalText(body.academic_year, 'Năm học', 20), active ? 1 : 0, optionalText(body.vehicle_plate, 'Biển số xe', 30), optionalText(body.notes, 'Ghi chú', 1_000), now, now).run();
    await audit(context, 'student.create', 'student', id, { studentCode });
    return json({ success: true, student: { id, studentCode, fullName, className } }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    await ensureSchema();
    const body = await readJson(request);
    const id = requiredText(body.id, 'id', 64);
    const existing = await env.DB.prepare('SELECT id FROM students WHERE id = ? AND school_id = ?').bind(id, context.schoolId).first();
    if (!existing) return json({ success: false, error: { code: 'not_found', message: 'Không tìm thấy học sinh.' } }, { status: 404 });
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE students SET full_name = ?, class_name = ?, grade = ?, academic_year = ?, active = ?, vehicle_plate = ?, notes = ?, updated_at = ? WHERE id = ? AND school_id = ?').bind(requiredText(body.full_name, 'Họ tên', 120), requiredText(body.class_name, 'Lớp', 40), optionalText(body.grade, 'Khối', 20), optionalText(body.academic_year, 'Năm học', 20), optionalBoolean(body.active, true) ? 1 : 0, optionalText(body.vehicle_plate, 'Biển số xe', 30), optionalText(body.notes, 'Ghi chú', 1_000), now, id, context.schoolId).run();
    await audit(context, 'student.update', 'student', id);
    return json({ success: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    await ensureSchema();
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return json({ success: false, error: { code: 'validation_error', message: 'Thiếu id.' } }, { status: 400 });

    const existing = await env.DB.prepare('SELECT id FROM students WHERE id = ? AND school_id = ?').bind(id, context.schoolId).first();
    if (!existing) {
      return json({ success: false, error: { code: 'not_found', message: 'Không tìm thấy học sinh cần xóa.' } }, { status: 404 });
    }

    const now = new Date().toISOString();
    await env.DB.batch([
      // 1. Tách thiết bị đang gán cho học sinh này
      env.DB.prepare('UPDATE devices SET student_id = NULL, updated_at = ? WHERE student_id = ? AND school_id = ?').bind(now, id, context.schoolId),
      // 2. Gỡ liên kết student_id trên alerts để giữ nhật ký cảnh báo của xe mà không vi phạm khoá ngoại
      env.DB.prepare('UPDATE alerts SET student_id = NULL WHERE student_id = ? AND school_id = ?').bind(id, context.schoolId),
      // 3. Gỡ liên kết student_id trên overspeed_events để giữ nhật ký tốc độ của xe mà không vi phạm khoá ngoại
      env.DB.prepare('UPDATE overspeed_events SET student_id = NULL WHERE student_id = ?').bind(id),
      // 4. Xóa phiên đăng nhập của các tài khoản học sinh con gắn với học sinh này
      env.DB.prepare('DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM student_accounts WHERE student_id = ? AND school_id = ?)').bind(id, context.schoolId),
      // 5. Xóa tài khoản học sinh con gắn với học sinh này
      env.DB.prepare('DELETE FROM student_accounts WHERE student_id = ? AND school_id = ?').bind(id, context.schoolId),
      // 6. Xóa các số liên hệ phụ huynh của học sinh này
      env.DB.prepare('DELETE FROM parent_contacts WHERE student_id = ?').bind(id),
      // 7. Xóa hồ sơ học sinh
      env.DB.prepare('DELETE FROM students WHERE id = ? AND school_id = ?').bind(id, context.schoolId),
    ]);
    await audit(context, 'student.delete', 'student', id);
    return json({ success: true, message: 'Đã xóa học sinh thành công.' });
  } catch (error) { return apiError(error); }
}
