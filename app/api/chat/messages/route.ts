import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, noStore, readJson, requiredText, optionalText, optionalBoolean } from '@/lib/server/http';
import { requirePasswordUser } from '@/lib/server/password-auth';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function GET(request: Request) {
  try {
    const user = await requirePasswordUser();
    await ensureSchema();

    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversation_id');
    if (!conversationId) {
      throw new ApiError(400, 'Thiếu conversation_id.', 'validation_error');
    }

    const schoolId = user.school_id;
    if (!schoolId) {
      throw new ApiError(400, 'Tài khoản chưa được liên kết với trường học.', 'no_school');
    }

    // 1. Kiểm tra conversation có thuộc trường học của user không
    const conv = await env.DB.prepare(`
      SELECT id, school_id, type, title, created_by
      FROM chat_conversations
      WHERE id = ? AND school_id = ?
    `).bind(conversationId, schoolId).first<{
      id: string;
      school_id: string;
      type: string;
      title: string | null;
      created_by: string;
    }>();

    if (!conv) {
      throw new ApiError(404, 'Không tìm thấy cuộc trò chuyện.', 'not_found');
    }

    // 2. Kiểm tra quyền truy cập:
    // Học sinh bắt buộc phải là participant
    // Giáo viên/Admin phải là creator hoặc là participant
    const isParticipant = await env.DB.prepare(`
      SELECT id FROM chat_participants
      WHERE conversation_id = ? AND user_id = ?
      LIMIT 1
    `).bind(conversationId, user.id).first();

    const isTeacher = user.role !== 'student';
    if (!isParticipant && !isTeacher) {
      throw new ApiError(403, 'Bạn không có quyền xem cuộc trò chuyện này.', 'forbidden');
    }

    // 3. Lấy tin nhắn
    const messages = await env.DB.prepare(`
      SELECT id, conversation_id, sender_id, sender_type, sender_name, message,
             file_url, file_name, file_type, file_size, is_alert, created_at
      FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT 300
    `).bind(conversationId).all<{
      id: string;
      conversation_id: string;
      sender_id: string;
      sender_type: 'teacher' | 'student';
      sender_name: string;
      message: string;
      file_url: string | null;
      file_name: string | null;
      file_type: string | null;
      file_size: number | null;
      is_alert: number;
      created_at: string;
    }>();

    // 4. Lấy danh sách thành viên hiện tại
    const participants = await env.DB.prepare(`
      SELECT user_id, user_type, user_name, joined_at
      FROM chat_participants
      WHERE conversation_id = ?
    `).bind(conversationId).all<{
      user_id: string;
      user_type: string;
      user_name: string;
      joined_at: string;
    }>();

    return noStore(json({
      success: true,
      conversation: {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        created_by: conv.created_by,
      },
      participants: participants.results || [],
      messages: (messages.results || []).map((m) => ({
        ...m,
        is_alert: Boolean(m.is_alert),
        is_me: m.sender_id === user.id,
      })),
      current_user: {
        id: user.id,
        role: user.role,
        name: user.full_name || user.username || user.email,
        is_teacher: isTeacher,
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

    const schoolId = user.school_id;
    if (!schoolId) {
      throw new ApiError(400, 'Tài khoản chưa được liên kết với trường học.', 'no_school');
    }

    const body = await readJson(request, 10 * 1024 * 1024); // Cho phép tối đa 10MB nếu gửi file/ảnh base64
    const conversationId = requiredText(body.conversation_id, 'Mã cuộc trò chuyện', 64).trim();
    const rawMessage = optionalText(body.message, 'Nội dung tin nhắn', 4000) || '';
    const fileUrl = optionalText(body.file_url, 'File đính kèm', 6 * 1024 * 1024); // Tối đa 6MB cho file/ảnh base64
    const fileName = optionalText(body.file_name, 'Tên file', 255);
    const fileType = optionalText(body.file_type, 'Loại file', 100);
    const fileSize = typeof body.file_size === 'number' ? Math.round(body.file_size) : null;
    const isTeacher = user.role !== 'student';
    const isAlert = isTeacher ? Boolean(body.is_alert) : false; // CHỈ GIÁO VIÊN MỚI ĐƯỢC GỬI TIN CẢNH BÁO

    if (!rawMessage.trim() && !fileUrl) {
      throw new ApiError(400, 'Vui lòng nhập nội dung tin nhắn hoặc chọn ảnh/file đính kèm.', 'empty_message');
    }

    // 1. Kiểm tra conversation có tồn tại không
    const conv = await env.DB.prepare(`
      SELECT id, school_id, type FROM chat_conversations
      WHERE id = ? AND school_id = ?
    `).bind(conversationId, schoolId).first<{ id: string; school_id: string; type: string }>();

    if (!conv) {
      throw new ApiError(404, 'Cuộc trò chuyện không tồn tại.', 'not_found');
    }

    // 2. Kiểm tra người gửi có trong participants không
    let participant = await env.DB.prepare(`
      SELECT id FROM chat_participants
      WHERE conversation_id = ? AND user_id = ?
      LIMIT 1
    `).bind(conversationId, user.id).first();

    const senderName = user.full_name || user.username || user.email || (isTeacher ? 'Giáo viên' : 'Học sinh');
    const now = new Date().toISOString();

    // Nếu là giáo viên của trường nhưng chưa có trong participant của nhóm/hội thoại do chính trường tạo
    if (!participant && isTeacher) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_participants (id, conversation_id, user_id, user_type, user_name, joined_at)
        VALUES (?, ?, ?, 'teacher', ?, ?)
      `).bind(crypto.randomUUID(), conversationId, user.id, senderName, now).run();
    } else if (!participant) {
      throw new ApiError(403, 'Bạn không phải là thành viên của cuộc trò chuyện này.', 'forbidden');
    }

    // 3. Tạo tin nhắn
    const messageId = crypto.randomUUID();
    const senderType = isTeacher ? 'teacher' : 'student';

    await env.DB.prepare(`
      INSERT INTO chat_messages (
        id, conversation_id, sender_id, sender_type, sender_name, message,
        file_url, file_name, file_type, file_size, is_alert, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      messageId,
      conversationId,
      user.id,
      senderType,
      senderName,
      rawMessage.trim(),
      fileUrl || null,
      fileName || null,
      fileType || null,
      fileSize,
      isAlert ? 1 : 0,
      now
    ).run();

    // 4. Cập nhật thời gian updated_at của conversation
    await env.DB.prepare(`
      UPDATE chat_conversations SET updated_at = ? WHERE id = ?
    `).bind(now, conversationId).run();

    return json({
      success: true,
      message: 'Đã gửi tin nhắn thành công.',
      data: {
        id: messageId,
        conversation_id: conversationId,
        sender_id: user.id,
        sender_type: senderType,
        sender_name: senderName,
        message: rawMessage.trim(),
        file_url: fileUrl || null,
        file_name: fileName || null,
        file_type: fileType || null,
        file_size: fileSize,
        is_alert: isAlert,
        created_at: now,
        is_me: true,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
