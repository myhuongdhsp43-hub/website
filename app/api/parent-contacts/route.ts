import { env } from 'cloudflare:workers';
import { audit, requireSchoolUser, requireWriteAccess } from '@/lib/server/auth';
import { ApiError, apiError, json, optionalBoolean, readJson, requiredText } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    const context = await requireSchoolUser();
    const studentId = new URL(request.url).searchParams.get('student_id');
    if (!studentId) throw new ApiError(400, 'Thiếu student_id.', 'validation_error');
    const contacts = await env.DB.prepare('SELECT c.* FROM parent_contacts c JOIN students s ON s.id = c.student_id WHERE c.student_id = ? AND s.school_id = ? ORDER BY c.created_at').bind(studentId, context.schoolId).all();
    return json({ success: true, contacts: contacts.results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    const body = await readJson(request);
    const studentId = requiredText(body.student_id, 'student_id', 64);
    const student = await env.DB.prepare('SELECT id FROM students WHERE id = ? AND school_id = ?').bind(studentId, context.schoolId).first();
    if (!student) throw new ApiError(404, 'Không tìm thấy học sinh.', 'not_found');
    const phone = requiredText(body.phone, 'Số điện thoại', 24).replaceAll(' ', '');
    if (!/^\+?[0-9]{9,15}$/.test(phone)) throw new ApiError(400, 'Số điện thoại không hợp lệ.', 'validation_error');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO parent_contacts (id, student_id, name, relationship, phone, sms_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, studentId, requiredText(body.name, 'Tên phụ huynh', 120), requiredText(body.relationship, 'Mối quan hệ', 40), phone, optionalBoolean(body.sms_enabled, true) ? 1 : 0, now, now).run();
    await audit(context, 'parent_contact.create', 'parent_contact', id, { studentId });
    return json({ success: true, id }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    const body = await readJson(request);
    const id = requiredText(body.id, 'id', 64);
    const phone = requiredText(body.phone, 'Số điện thoại', 24).replaceAll(' ', '');
    if (!/^\+?[0-9]{9,15}$/.test(phone)) throw new ApiError(400, 'Số điện thoại không hợp lệ.', 'validation_error');
    const result = await env.DB.prepare(`UPDATE parent_contacts SET name = ?, relationship = ?, phone = ?, sms_enabled = ?, updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM students s WHERE s.id = parent_contacts.student_id AND s.school_id = ?)`).bind(requiredText(body.name, 'Tên phụ huynh', 120), requiredText(body.relationship, 'Mối quan hệ', 40), phone, optionalBoolean(body.sms_enabled, true) ? 1 : 0, new Date().toISOString(), id, context.schoolId).run();
    if (!result.meta.changes) throw new ApiError(404, 'Không tìm thấy liên hệ phụ huynh.', 'not_found');
    await audit(context, 'parent_contact.update', 'parent_contact', id);
    return json({ success: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError(400, 'Thiếu id.', 'validation_error');
    const result = await env.DB.prepare(`DELETE FROM parent_contacts WHERE id = ? AND EXISTS (SELECT 1 FROM students s WHERE s.id = parent_contacts.student_id AND s.school_id = ?)`).bind(id, context.schoolId).run();
    if (!result.meta.changes) throw new ApiError(404, 'Không tìm thấy liên hệ phụ huynh.', 'not_found');
    await audit(context, 'parent_contact.delete', 'parent_contact', id);
    return json({ success: true });
  } catch (error) { return apiError(error); }
}
