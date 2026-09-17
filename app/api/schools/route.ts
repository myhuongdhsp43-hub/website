import { env } from 'cloudflare:workers';
import { json, apiError, ApiError } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const accountToken = (url.searchParams.get('account_token') || '').trim();

    if (accountToken) {
      const school = await env.DB.prepare(
        'SELECT id, name, address, account_token FROM schools WHERE account_token = ?'
      ).bind(accountToken).first<{ id: string; name: string; address: string | null; account_token: string }>();

      if (!school) {
        throw new ApiError(404, 'Mã token tài khoản không chính xác hoặc không tồn tại!', 'account_token_not_found');
      }

      return json({
        success: true,
        verified: true,
        school: {
          id: school.id,
          name: school.name,
          address: school.address,
          account_token: school.account_token,
        },
      });
    }

    const schools = await env.DB.prepare(
      'SELECT id, name, address, account_token FROM schools ORDER BY name ASC'
    ).all();
    return json({ success: true, schools: schools.results || [] });
  } catch (error) {
    return apiError(error);
  }
}
