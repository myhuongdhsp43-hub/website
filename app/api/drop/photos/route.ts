import { env } from 'cloudflare:workers';
import { apiError, json, noStore } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const room = (url.searchParams.get('room') || 'khkt').trim().toLowerCase().slice(0, 32);
    const rows = await env.DB.prepare(
      'SELECT id, room_id, filename, content_type, size, created_at FROM shared_photos WHERE room_id = ? ORDER BY created_at DESC LIMIT 60'
    ).bind(room).all<{
      id: string;
      room_id: string;
      filename: string;
      content_type: string;
      size: number;
      created_at: string;
    }>();

    return noStore(json({
      success: true,
      room,
      photos: rows.results || [],
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const room = url.searchParams.get('room');

    if (id) {
      await env.DB.prepare('DELETE FROM shared_photos WHERE id = ?').bind(id).run();
      return json({ success: true, message: 'Đã xóa ảnh.' });
    }

    if (room) {
      const cleanRoom = room.trim().toLowerCase().slice(0, 32);
      await env.DB.prepare('DELETE FROM shared_photos WHERE room_id = ?').bind(cleanRoom).run();
      return json({ success: true, message: `Đã xóa tất cả ảnh trong phòng ${cleanRoom}.` });
    }

    return json({ success: false, error: 'Cần chỉ định id hoặc room.' }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
