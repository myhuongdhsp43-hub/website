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
    const fileId = url.searchParams.get('id');
    const isPreview = url.searchParams.get('preview') === '1';

    if (!fileId) {
      throw new ApiError(400, 'Thiếu mã file.', 'missing_id');
    }

    const fileMeta = await env.DB.prepare(`
      SELECT id, school_id, filename, content_type, size, total_chunks, created_at
      FROM chat_files
      WHERE id = ?
    `).bind(fileId).first<{
      id: string;
      school_id: string;
      filename: string;
      content_type: string;
      size: number;
      total_chunks: number;
      created_at: string;
    }>();

    if (!fileMeta) {
      throw new ApiError(404, 'Không tìm thấy file hoặc file đã bị xóa.', 'not_found');
    }

    const chunks = await env.DB.prepare(`
      SELECT chunk_index, data
      FROM chat_file_chunks
      WHERE file_id = ?
      ORDER BY chunk_index ASC
    `).bind(fileId).all<{
      chunk_index: number;
      data: string;
    }>();

    const chunkList = chunks.results || [];
    if (chunkList.length === 0) {
      throw new ApiError(404, 'Dữ liệu file không tồn tại.', 'empty_file');
    }

    // Ghép các khối nhị phân lại
    const byteArrays = chunkList.map((c) => base64ToUint8Array(c.data));
    const totalLength = byteArrays.reduce((acc, curr) => acc + curr.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of byteArrays) {
      merged.set(arr, offset);
      offset += arr.length;
    }

    const safeFilename = encodeURIComponent(fileMeta.filename || 'download');
    const isImage = fileMeta.content_type?.startsWith('image/');
    const disposition = isPreview && isImage
      ? `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
      : `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`;

    return new Response(merged, {
      status: 200,
      headers: {
        'Content-Type': fileMeta.content_type || 'application/octet-stream',
        'Content-Disposition': disposition,
        'Content-Length': String(totalLength),
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
