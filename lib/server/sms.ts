import { env } from 'cloudflare:workers';

export type SmsResult = { status: 'sent' | 'mocked' | 'failed'; provider: string; providerMessageId?: string; errorMessage?: string };

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const provider = (env.SMS_PROVIDER ?? 'mock').trim().toLowerCase();
  if (provider === 'mock') {
    console.log('[SMS MOCK]', { to, message });
    return { status: 'mocked', provider: 'mock', providerMessageId: `mock-${crypto.randomUUID()}` };
  }
  if (provider === 'twilio') return sendTwilioSms(to, message);
  return { status: 'failed', provider, errorMessage: `SMS_PROVIDER=${provider} chưa được hỗ trợ.` };
}

async function sendTwilioSms(to: string, message: string): Promise<SmsResult> {
  const accountSid = env.SMS_API_KEY;
  const authToken = env.SMS_SECRET;
  const sender = env.SMS_SENDER;
  if (!accountSid || !authToken || !sender) return { status: 'failed', provider: 'twilio', errorMessage: 'Thiếu SMS_API_KEY, SMS_SECRET hoặc SMS_SENDER.' };
  const auth = btoa(`${accountSid}:${authToken}`);
  const body = new URLSearchParams({ To: to, From: sender, Body: message });
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const data = await response.json() as { sid?: string; message?: string };
    if (!response.ok) return { status: 'failed', provider: 'twilio', errorMessage: data.message ?? `HTTP ${response.status}` };
    return { status: 'sent', provider: 'twilio', providerMessageId: data.sid };
  } catch {
    return { status: 'failed', provider: 'twilio', errorMessage: 'Không thể kết nối nhà cung cấp SMS.' };
  }
}

export function renderSmsTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{([a-z_]+)\}/g, (token, key) => key in values ? String(values[key]) : token);
}
