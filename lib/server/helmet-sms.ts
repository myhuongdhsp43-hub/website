import { env } from 'cloudflare:workers';

// Only a token-authenticated device can read its own jobs or acknowledge them.
export async function acknowledgeHelmetSms(deviceId: string, schoolId: string, body: Record<string, unknown>) {
  if (typeof body.sms_job_id !== 'string' || !['accepted', 'failed', 'unknown'].includes(String(body.sms_status))) return;
  const detail = typeof body.sms_detail === 'string' ? body.sms_detail.slice(0, 160) : null;
  await env.DB.prepare("UPDATE helmet_sms_jobs SET status = ?, detail = ?, updated_at = ? WHERE id = ? AND device_id = ? AND school_id = ? AND status IN ('queued', 'dispatched', 'expired')")
    .bind(body.sms_status, detail, new Date().toISOString(), body.sms_job_id, deviceId, schoolId).run();
}

export async function nextHelmetSms(deviceId: string, schoolId: string) {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  await env.DB.prepare("UPDATE helmet_sms_jobs SET status = 'expired', updated_at = ? WHERE device_id = ? AND school_id = ? AND status IN ('queued', 'dispatched') AND created_at < ?")
    .bind(now, deviceId, schoolId, cutoff).run();
  const job = await env.DB.prepare("SELECT id, phone, message FROM helmet_sms_jobs WHERE device_id = ? AND school_id = ? AND status IN ('queued', 'dispatched') ORDER BY CASE status WHEN 'dispatched' THEN 0 ELSE 1 END, created_at, id LIMIT 1")
    .bind(deviceId, schoolId).first<{ id: string; phone: string; message: string }>();
  if (!job) return {};
  await env.DB.prepare("UPDATE helmet_sms_jobs SET status = 'dispatched', updated_at = ? WHERE id = ? AND device_id = ? AND school_id = ? AND status = 'queued'").bind(now, job.id, deviceId, schoolId).run();
  return { sms_job_id: job.id, sms_phone: job.phone, sms_message: job.message };
}
