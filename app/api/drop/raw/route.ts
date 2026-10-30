import { env } from 'cloudflare:workers';
import { ApiError, apiError } from '@/lib/server/http';
import { ensureSchema } from '@/lib/server/ensure-schema';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const download = url.searchParams.get('download') === '1';

    if (!id) {
      throw new ApiError(400, 'Thiếu id ảnh.', 'missing_id');
    }

    const row = await env.DB.prepare(
      'SELECT id, filename, content_type, data FROM shared_photos WHERE id = ?'
    ).bind(id).first<{
      id: string;
      filename: string;
      content_type: string;
      data: string;
    }>();

    if (!row) {
      throw new ApiError(404, 'Không tìm thấy ảnh hoặc ảnh đã bị xóa.', 'not_found');
    }

    const binary = base64ToUint8Array(row.data);
    const safeFilename = encodeURIComponent(row.filename || 'photo.jpg');

    return new Response(binary, {
      status: 200,
      headers: {
        'Content-Type': row.content_type || 'image/jpeg',
        'Content-Disposition': download
          ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
          : `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
        'Content-Length': String(binary.length),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
