import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, noStore, readJson, requiredText, optionalText } from '@/lib/server/http';
import { requireSchoolUser, requireWriteAccess } from '@/lib/server/auth';
import { ensureSchema } from '@/lib/server/ensure-schema';
import { hashPassword, randomToken } from '@/lib/server/password-auth';

export async function GET() {
  try {
    const context = await requireSchoolUser();
    await ensureSchema();

    const accounts = await env.DB.prepare(`
      SELECT sa.id, sa.school_id, sa.student_id, sa.username, sa.full_name, sa.class_name, sa.active, sa.created_at,
             s.student_code, d.device_id, d.device_name
      FROM student_accounts sa
      LEFT JOIN students s ON s.id = sa.student_id AND s.school_id = sa.school_id
      LEFT JOIN devices d ON d.student_id = s.id AND d.school_id = sa.school_id
      WHERE sa.school_id = ?
      ORDER BY sa.created_at DESC
    `).bind(context.schoolId).all<{
      id: string;
      school_id: string;
      student_id: string | null;
      username: string;
      full_name: string;
      class_name: string;
      active: number;
      created_at: string;
      student_code: string | null;
      device_id: string | null;
      device_name: string | null;
    }>();

    return noStore(json({
      success: true,
      accounts: accounts.results,
      school_id: context.schoolId,
      school_name: context.schoolName,
      student_login_path: `/login?school_id=${encodeURIComponent(context.schoolId)}&role=student`,
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    await ensureSchema();

    const body = await readJson(request);
    const username = requiredText(body.username, 'Tên đăng nhập học sinh', 64).trim().toLowerCase();
    const password = requiredText(body.password, 'Mật khẩu', 200);
    const fullName = requiredText(body.full_name, 'Họ tên học sinh', 160).trim();
    const className = requiredText(body.class_name, 'Lớp', 64).trim();
    const studentIdInput = optionalText(body.student_id, 'Mã học sinh liên kết', 64)?.trim();

    if (!/^[a-z0-9_.-]{3,64}$/.test(username)) {
      throw new ApiError(400, 'Tên đăng nhập chỉ gồm 3–64 ký tự chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.', 'invalid_username');
    }
    if (password.length < 6) {
      throw new ApiError(400, 'Mật khẩu học sinh phải có tối thiểu 6 ký tự.', 'invalid_password');
    }

    // Kiểm tra trùng lặp trong trường hiện tại
    const exists = await env.DB.prepare(
      'SELECT id FROM student_accounts WHERE school_id = ? AND lower(username) = ? LIMIT 1'
    ).bind(context.schoolId, username).first();

    if (exists) {
      throw new ApiError(409, `Tên đăng nhập "${username}" đã tồn tại trong trường của bạn. Vui lòng chọn tên đăng nhập khác!`, 'username_exists');
    }

    let finalStudentId = studentIdInput || null;
    const now = new Date().toISOString();

    // Nếu chưa chọn học sinh có sẵn, tìm học sinh đã có cùng tên và lớp hoặc tạo mới an toàn
    if (!finalStudentId) {
      const existingStudent = await env.DB.prepare(`
        SELECT id FROM students WHERE school_id = ? AND full_name = ? AND class_name = ? LIMIT 1
      `).bind(context.schoolId, fullName, className).first<{ id: string }>();

      if (existingStudent?.id) {
        finalStudentId = existingStudent.id;
      } else {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const cleanClass = className.replace(/[^A-Za-z0-9]/g, '') || 'L';
        const generatedCode = `HS-${cleanClass}-${Date.now().toString().slice(-4)}-${randomSuffix}`;
        finalStudentId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO students (id, school_id, student_code, full_name, class_name, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `).bind(finalStudentId, context.schoolId, generatedCode, fullName, className, now, now).run();
      }
    }

    const salt = randomToken();
    const passwordHash = await hashPassword(password, salt);
    const accountId = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO student_accounts (id, school_id, student_id, username, password_hash, password_salt, full_name, class_name, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(accountId, context.schoolId, finalStudentId, username, passwordHash, salt, fullName, className, now, now).run();

    return json({
      success: true,
      message: `Đã tạo tài khoản học sinh con "${username}" thành công!`,
      account: {
        id: accountId,
        username,
        full_name: fullName,
        class_name: className,
        student_id: finalStudentId,
        created_at: now,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    await ensureSchema();

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) throw new ApiError(400, 'Thiếu id tài khoản cần xóa.', 'validation_error');

    const existing = await env.DB.prepare(
      'SELECT id FROM student_accounts WHERE id = ? AND school_id = ?'
    ).bind(id, context.schoolId).first();

    if (!existing) {
      throw new ApiError(404, 'Không tìm thấy tài khoản học sinh con cần xóa.', 'not_found');
    }

    await env.DB.batch([
      env.DB.prepare('DELETE FROM app_sessions WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM student_accounts WHERE id = ? AND school_id = ?').bind(id, context.schoolId),
    ]);

    return json({
      success: true,
      message: 'Đã xóa tài khoản học sinh con thành công.',
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireWriteAccess(context);
    await ensureSchema();

    const body = await readJson(request);
    const id = requiredText(body.id, 'id tài khoản', 64);
    const newPassword = optionalText(body.password, 'Mật khẩu mới', 200);
    const fullName = optionalText(body.full_name, 'Họ tên', 160);
    const className = optionalText(body.class_name, 'Lớp', 64);
    const studentId = optionalText(body.student_id, 'Học sinh liên kết', 64);
    const now = new Date().toISOString();

    const existing = await env.DB.prepare(
      'SELECT id FROM student_accounts WHERE id = ? AND school_id = ?'
    ).bind(id, context.schoolId).first();

    if (!existing) {
      throw new ApiError(404, 'Không tìm thấy tài khoản học sinh con cần cập nhật.', 'not_found');
    }

    if (newPassword && newPassword.length >= 6) {
      const salt = randomToken();
      const hash = await hashPassword(newPassword, salt);
      await env.DB.prepare(
        'UPDATE student_accounts SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ? AND school_id = ?'
      ).bind(hash, salt, now, id, context.schoolId).run();
    }

    if (fullName || className || studentId !== undefined) {
      await env.DB.prepare(`
        UPDATE student_accounts 
        SET full_name = COALESCE(?, full_name),
            class_name = COALESCE(?, class_name),
            student_id = COALESCE(?, student_id),
            updated_at = ?
        WHERE id = ? AND school_id = ?
      `).bind(fullName || null, className || null, studentId || null, now, id, context.schoolId).run();
    }

    return json({
      success: true,
      message: 'Đã cập nhật tài khoản học sinh con thành công.',
    });
  } catch (error) {
    return apiError(error);
  }
}
