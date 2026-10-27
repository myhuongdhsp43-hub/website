import { env } from 'cloudflare:workers';
import { audit, requireAdmin, requireSchoolUser } from '@/lib/server/auth';
import { apiError, json, readJson, requiredText } from '@/lib/server/http';
import { sendSms } from '@/lib/server/sms';

export async function POST(request: Request) {
  try {
    const context = await requireSchoolUser();
    requireAdmin(context);
    const body = await readJson(request);
    const phone = requiredText(body.phone, 'Số điện thoại', 24);
    if (!/^\+?[0-9]{9,15}$/.test(phone.replaceAll(' ', ''))) return json({ success: false, error: { code: 'validation_error', message: 'Số điện thoại không hợp lệ.' } }, { status: 400 });
    const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim().slice(0, 1_200) : 'Tin nhắn kiểm tra từ Hệ thống hỗ trợ giáo dục và an toàn giao thông dành cho học sinh.';
    const result = await sendSms(phone, message);
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO sms_logs (id, event_id, phone, message, status, provider, provider_message_id, error_message, sent_at, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), phone, message, result.status, result.provider, result.providerMessageId ?? null, result.errorMessage ?? null, result.status === 'failed' ? null : now, now).run();
    await audit(context, 'sms.test', 'sms_log', undefined, { phone, provider: result.provider, status: result.status });
    return json({ success: result.status !== 'failed', result });
  } catch (error) { return apiError(error); }
}
