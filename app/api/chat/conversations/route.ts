import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, noStore, readJson, requiredText, optionalText } from '@/lib/server/http';
import { requirePasswordUser } from '@/lib/server/password-auth';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function GET(request: Request) {
  try {
    const user = await requirePasswordUser();
    await ensureSchema();

    const schoolId = user.school_id;
    if (!schoolId) {
      throw new ApiError(400, 'Tài khoản chưa được liên kết với trường học.', 'no_school');
    }

    const isStudent = user.role === 'student';
    let conversations = [];

    if (isStudent) {
      // Học sinh chỉ xem các cuộc trò chuyện / nhóm mà mình đã được thêm vào
      conversations = await env.DB.prepare(`
        SELECT c.id, c.school_id, c.type, c.title, c.created_by, c.created_at, c.updated_at
        FROM chat_conversations c
        JOIN chat_participants cp ON cp.conversation_id = c.id
        WHERE cp.user_id = ? AND c.school_id = ?
        ORDER BY c.updated_at DESC
      `).bind(user.id, schoolId).all<{
        id: string;
        school_id: string;
        type: 'direct' | 'group';
        title: string | null;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>();
    } else {
      // Giáo viên xem các cuộc trò chuyện của trường mà mình tham gia hoặc tạo
      conversations = await env.DB.prepare(`
        SELECT DISTINCT c.id, c.school_id, c.type, c.title, c.created_by, c.created_at, c.updated_at
        FROM chat_conversations c
        LEFT JOIN chat_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
        WHERE c.school_id = ? AND (c.created_by = ? OR cp.user_id IS NOT NULL)
        ORDER BY c.updated_at DESC
      `).bind(user.id, schoolId, user.id).all<{
        id: string;
        school_id: string;
        type: 'direct' | 'group';
        title: string | null;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>();
    }

    const convList = conversations.results || [];
    const detailedConversations = [];

    for (const conv of convList) {
      // Lấy danh sách thành viên
      const participants = await env.DB.prepare(`
        SELECT user_id, user_type, user_name, joined_at
        FROM chat_participants
        WHERE conversation_id = ?
      `).bind(conv.id).all<{
        user_id: string;
        user_type: 'teacher' | 'student';
        user_name: string;
        joined_at: string;
      }>();

      // Lấy tin nhắn mới nhất
      const lastMsg = await env.DB.prepare(`
        SELECT sender_id, sender_type, sender_name, message, is_alert, created_at
        FROM chat_messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(conv.id).first<{
        sender_id: string;
        sender_type: 'teacher' | 'student';
        sender_name: string;
        message: string;
        is_alert: number;
        created_at: string;
      }>();

      // Đếm số tin nhắn
      const msgCount = await env.DB.prepare(`
        SELECT COUNT(1) AS count FROM chat_messages WHERE conversation_id = ?
      `).bind(conv.id).first<{ count: number }>();

      // Đặt tên hiển thị thông minh
      let displayTitle = conv.title;
      if (conv.type === 'direct') {
        const otherParticipant = participants.results?.find((p) => p.user_id !== user.id);
        if (otherParticipant) {
          displayTitle = otherParticipant.user_name;
        } else {
          displayTitle = conv.title || 'Trò chuyện trực tiếp';
        }
      }

      detailedConversations.push({
        id: conv.id,
        type: conv.type,
        title: displayTitle,
        raw_title: conv.title,
        created_by: conv.created_by,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        participant_count: participants.results?.length || 0,
        participants: participants.results || [],
        last_message: lastMsg?.message || null,
        last_message_sender: lastMsg?.sender_name || null,
        last_message_at: lastMsg?.created_at || null,
        last_message_is_alert: Boolean(lastMsg?.is_alert),
        message_count: msgCount?.count || 0,
      });
    }

    return noStore(json({
      success: true,
      conversations: detailedConversations,
      current_user: {
        id: user.id,
        role: user.role,
        full_name: user.full_name || user.username || user.email,
        is_teacher: user.role !== 'student',
      },
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePasswordUser();
    await ensureSchema();

    // CHỈ GIÁO VIÊN ĐƯỢC TẠO NHÓM HOẶC MỞ CUỘC TRÒ CHUYỆN VỚI HỌC SINH
    if (user.role === 'student') {
      throw new ApiError(
        403,
        'Chỉ giáo viên / quản trị viên mới có quyền tạo nhóm hoặc mở cuộc trò chuyện mới.',
        'forbidden_students_cannot_create_chat'
      );
    }

    const schoolId = user.school_id;
    if (!schoolId) {
      throw new ApiError(400, 'Tài khoản chưa được liên kết với trường học.', 'no_school');
    }

    const body = await readJson(request);
    const type = (body.type === 'group' ? 'group' : 'direct') as 'group' | 'direct';
    const now = new Date().toISOString();
    const teacherName = user.full_name || user.username || user.email || 'Giáo viên';

    if (type === 'group') {
      // 1. TẠO GROUP TRÒ CHUYỆN
      const title = requiredText(body.title, 'Tên nhóm trò chuyện', 100).trim();
      const rawMemberIds = Array.isArray(body.member_ids) ? body.member_ids : [];

      if (!rawMemberIds.length) {
        throw new ApiError(400, 'Vui lòng chọn ít nhất 1 học sinh tham gia nhóm.', 'validation_error');
      }

      // Lấy danh sách học sinh hợp lệ thuộc trường
      const memberIds = Array.from(new Set(rawMemberIds.map((id) => String(id).trim()))).filter(Boolean);
      const studentPlaceholders = memberIds.map(() => '?').join(',');

      const students = await env.DB.prepare(`
        SELECT id, username, full_name, class_name
        FROM student_accounts
        WHERE school_id = ? AND id IN (${studentPlaceholders})
      `).bind(schoolId, ...memberIds).all<{
        id: string;
        username: string;
        full_name: string;
        class_name: string;
      }>();

      if (!students.results?.length) {
        throw new ApiError(400, 'Không tìm thấy học sinh hợp lệ nào được chọn.', 'no_valid_members');
      }

      const conversationId = crypto.randomUUID();

      // Tạo group conversation
      await env.DB.prepare(`
        INSERT INTO chat_conversations (id, school_id, type, title, created_by, created_at, updated_at)
        VALUES (?, ?, 'group', ?, ?, ?, ?)
      `).bind(conversationId, schoolId, title, user.id, now, now).run();

      // Thêm giáo viên vào nhóm
      await env.DB.prepare(`
        INSERT INTO chat_participants (id, conversation_id, user_id, user_type, user_name, joined_at)
        VALUES (?, ?, ?, 'teacher', ?, ?)
      `).bind(crypto.randomUUID(), conversationId, user.id, teacherName, now).run();

      // Thêm từng học sinh vào nhóm
      for (const st of students.results) {
        const studentDisplayName = `${st.full_name} (${st.class_name})`;
        await env.DB.prepare(`
          INSERT OR IGNORE INTO chat_participants (id, conversation_id, user_id, user_type, user_name, joined_at)
          VALUES (?, ?, ?, 'student', ?, ?)
        `).bind(crypto.randomUUID(), conversationId, st.id, studentDisplayName, now).run();
      }

      // Tạo tin nhắn thông báo tạo nhóm
      const initialMsg = `Thầy/Cô ${teacherName} đã tạo nhóm "${title}" gồm ${students.results.length} học sinh.`;
      await env.DB.prepare(`
        INSERT INTO chat_messages (id, conversation_id, sender_id, sender_type, sender_name, message, is_alert, created_at)
        VALUES (?, ?, ?, 'teacher', ?, ?, 0, ?)
      `).bind(crypto.randomUUID(), conversationId, user.id, teacherName, initialMsg, now).run();

      return json({
        success: true,
        message: `Đã tạo nhóm "${title}" thành công với ${students.results.length} học sinh!`,
        conversation: {
          id: conversationId,
          type: 'group',
          title,
          member_count: students.results.length + 1,
          created_at: now,
        },
      }, { status: 201 });
    } else {
      // 2. MỞ CUỘC TRÒ CHUYỆN 1-1 VỚI HỌC SINH
      const studentAccountId = requiredText(body.student_account_id || body.student_id, 'Học sinh cần nhắn tin', 64).trim();

      const student = await env.DB.prepare(`
        SELECT id, username, full_name, class_name
        FROM student_accounts
        WHERE school_id = ? AND id = ?
      `).bind(schoolId, studentAccountId).first<{
        id: string;
        username: string;
        full_name: string;
        class_name: string;
      }>();

      if (!student) {
        throw new ApiError(404, 'Không tìm thấy tài khoản học sinh con trong trường của bạn.', 'student_not_found');
      }

      const studentDisplayName = `${student.full_name} (${student.class_name})`;

      // Kiểm tra xem đã có cuộc trò chuyện direct giữa giáo viên này và học sinh này chưa
      const existingConv = await env.DB.prepare(`
        SELECT c.id, c.title
        FROM chat_conversations c
        JOIN chat_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
        JOIN chat_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
        WHERE c.school_id = ? AND c.type = 'direct'
        LIMIT 1
      `).bind(user.id, student.id, schoolId).first<{ id: string; title: string | null }>();

      if (existingConv) {
        return json({
          success: true,
          message: 'Đã mở lại cuộc trò chuyện sẵn có với học sinh.',
          conversation: {
            id: existingConv.id,
            type: 'direct',
            title: studentDisplayName,
            is_new: false,
          },
        });
      }

      // Tạo cuộc trò chuyện direct mới
      const conversationId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO chat_conversations (id, school_id, type, title, created_by, created_at, updated_at)
        VALUES (?, ?, 'direct', ?, ?, ?, ?)
      `).bind(conversationId, schoolId, studentDisplayName, user.id, now, now).run();

      // Thêm giáo viên & học sinh vào participants
      await env.DB.prepare(`
        INSERT INTO chat_participants (id, conversation_id, user_id, user_type, user_name, joined_at)
        VALUES (?, ?, ?, 'teacher', ?, ?)
      `).bind(crypto.randomUUID(), conversationId, user.id, teacherName, now).run();

      await env.DB.prepare(`
        INSERT INTO chat_participants (id, conversation_id, user_id, user_type, user_name, joined_at)
        VALUES (?, ?, ?, 'student', ?, ?)
      `).bind(crypto.randomUUID(), conversationId, student.id, studentDisplayName, now).run();

      // Tin nhắn mở đầu
      const initialMsg = `Thầy/Cô ${teacherName} đã mở cuộc trò chuyện trực tiếp với em ${student.full_name}.`;
      await env.DB.prepare(`
        INSERT INTO chat_messages (id, conversation_id, sender_id, sender_type, sender_name, message, is_alert, created_at)
        VALUES (?, ?, ?, 'teacher', ?, ?, 0, ?)
      `).bind(crypto.randomUUID(), conversationId, user.id, teacherName, initialMsg, now).run();

      return json({
        success: true,
        message: `Đã mở cuộc trò chuyện với học sinh ${student.full_name}!`,
        conversation: {
          id: conversationId,
          type: 'direct',
          title: studentDisplayName,
          is_new: true,
          created_at: now,
        },
      }, { status: 201 });
    }
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requirePasswordUser();
    await ensureSchema();

    if (user.role === 'student') {
      throw new ApiError(403, 'Chỉ giáo viên mới có quyền giải tán hoặc xóa nhóm trò chuyện.', 'forbidden');
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) throw new ApiError(400, 'Thiếu id cuộc trò chuyện.', 'validation_error');

    const conv = await env.DB.prepare(`
      SELECT id, title, type FROM chat_conversations WHERE id = ? AND school_id = ?
    `).bind(id, user.school_id).first<{ id: string; title: string | null; type: string }>();

    if (!conv) {
      throw new ApiError(404, 'Không tìm thấy cuộc trò chuyện cần xóa.', 'not_found');
    }

    await env.DB.batch([
      env.DB.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').bind(id),
      env.DB.prepare('DELETE FROM chat_participants WHERE conversation_id = ?').bind(id),
      env.DB.prepare('DELETE FROM chat_conversations WHERE id = ?').bind(id),
    ]);

    return json({
      success: true,
      message: `Đã xóa cuộc trò chuyện "${conv.title || id}" thành công.`,
    });
  } catch (error) {
    return apiError(error);
  }
}
