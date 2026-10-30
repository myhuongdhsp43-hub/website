import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, noStore, readJson, requiredText } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await readJson(request, 15 * 1024 * 1024); // Tối đa 15MB

    const rawData = requiredText(body.data, 'Dữ liệu ảnh', 15 * 1024 * 1024);
    // Bỏ tiền tố data:image/...;base64, nếu có
    const cleanBase64 = rawData.replace(/^data:[^;]+;base64,/, '');

    const room = typeof body.room === 'string' && body.room.trim()
      ? body.room.trim().toLowerCase().slice(0, 32)
      : 'khkt';
    const filename = typeof body.filename === 'string' && body.filename.trim()
      ? body.filename.trim().slice(0, 255)
      : `photo_${Date.now()}.jpg`;
    const contentType = typeof body.content_type === 'string' && body.content_type.trim()
      ? body.content_type.trim().slice(0, 64)
      : 'image/jpeg';
    const size = Number(body.size) || Math.round((cleanBase64.length * 3) / 4);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO shared_photos (id, room_id, filename, content_type, size, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, room, filename, contentType, size, cleanBase64, now).run();

    return noStore(json({
      success: true,
      id,
      room,
      filename,
      size,
      created_at: now,
      url: `/api/drop/raw?id=${encodeURIComponent(id)}`,
    }));
  } catch (error) {
    return apiError(error);
  }
}
