import { env } from 'cloudflare:workers';
import { json, apiError } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function GET() {
  try {
    await ensureSchema();
    const schools = await env.DB.prepare(
      'SELECT id, name, address FROM schools ORDER BY name ASC'
    ).all();
    return json({ success: true, schools: schools.results || [] });
  } catch (error) {
    return apiError(error);
  }
}
