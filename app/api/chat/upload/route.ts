import { env } from 'cloudflare:workers';
import { ApiError, apiError, json, noStore, readJson, requiredText, optionalText } from '@/lib/server/http';
import { requirePasswordUser } from '@/lib/server/password-auth';
import { ensureSchema } from '@/lib/server/ensure-schema';

const DEFAULT_STORAGE_TO_TOKEN = '927|xwaP9soaUWC0amxNd6207zC48DhODZ4SHWVnJVSo';
const STORAGE_TO_BASE_URL = 'https://storage.to/api';
const MAX_FILE_SIZE = 25 * 1024 * 1024 * 1024; // 25 GB theo yêu cầu
const DEFAULT_EXPIRY_DAYS = 7;

function getStorageToToken(): string {
  try {
    const runtimeEnv = (globalThis as any).process?.env || {};
    return runtimeEnv.STORAGE_TO_TOKEN || DEFAULT_STORAGE_TO_TOKEN;
  } catch {
    return DEFAULT_STORAGE_TO_TOKEN;
  }
}

export async function GET(request: Request) {
  try {
    await requirePasswordUser();

    // Lấy server GoFile tốt nhất cho client tải trực tiếp
    let gofileServer = 'store-eu-par-5';
    try {
      const srvRes = await fetch('https://api.gofile.io/servers', {
        headers: { 'Accept': 'application/json' },
      });
      if (srvRes.ok) {
        const srvData = await srvRes.json() as any;
        if (srvData?.data?.servers?.length > 0) {
          gofileServer = srvData.data.servers[0].name;
        }
      }
    } catch {
      // Dùng fallback server
    }

    return noStore(json({
      success: true,
      provider: 'gofile',
      gofile_server: gofileServer,
      gofile_upload_url: `https://${gofileServer}.gofile.io/uploadFile`,
      litterbox_upload_url: 'https://litterbox.catbox.moe/resources/internals/api.php',
      max_size_bytes: MAX_FILE_SIZE,
      max_size_gb: 25,
      default_expiry_days: DEFAULT_EXPIRY_DAYS,
      allowed_expiry_days: [3, 7],
      features: {
        direct_gofile_upload: true,
        direct_litterbox_upload: true,
        direct_chunk_upload: true,
        direct_user_download: true,
        storage_to_integration: true,
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

    if (!user.school_id) {
      throw new ApiError(400, 'Tài khoản chưa được liên kết với trường học.', 'no_school');
    }

    const contentTypeHeader = request.headers.get('content-type') || '';

    // Trường hợp 1: JSON body (Chunk upload an toàn, tốc độ cao hoặc liên kết storage.to)
    if (contentTypeHeader.includes('application/json')) {
      const body = await readJson(request, 3 * 1024 * 1024); // Cho phép tối đa 3MB mỗi khối
      const action = optionalText(body.action, 'Hành động', 32) || 'chunk';

      // 1.1 Tải lên từng khối trực tiếp vào hệ thống (tránh lỗi 403 Cloudflare WAF của storage.to)
      if (action === 'chunk') {
        const fileId = requiredText(body.file_id, 'Mã file', 64).trim();
        const filename = requiredText(body.filename, 'Tên file', 255).trim();
        const contentType = optionalText(body.content_type, 'Loại file', 128) || 'application/octet-stream';
        const size = Number(body.size);
        const chunkIndex = Number(body.chunk_index);
        const totalChunks = Number(body.total_chunks);
        const data = requiredText(body.data, 'Dữ liệu khối', 2 * 1024 * 1024);

        if (!Number.isFinite(chunkIndex) || !Number.isFinite(totalChunks) || chunkIndex < 0 || chunkIndex >= totalChunks) {
          throw new ApiError(400, 'Chỉ mục khối dữ liệu không hợp lệ.', 'invalid_chunk');
        }

        // Tạo bản ghi file nếu là khối đầu tiên
        if (chunkIndex === 0) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO chat_files (id, school_id, filename, content_type, size, total_chunks, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(fileId, user.school_id, filename, contentType, size, totalChunks, new Date().toISOString()).run();
        }

        // Lưu khối dữ liệu
        await env.DB.prepare(`
          INSERT OR REPLACE INTO chat_file_chunks (file_id, chunk_index, data)
          VALUES (?, ?, ?)
        `).bind(fileId, chunkIndex, data).run();

        const isLastChunk = chunkIndex === totalChunks - 1;
        return noStore(json({
          success: true,
          completed: isLastChunk,
          chunk_index: chunkIndex,
          total_chunks: totalChunks,
          file: isLastChunk ? {
            id: fileId,
            url: `/api/chat/download?id=${encodeURIComponent(fileId)}`,
            preview_url: `/api/chat/download?id=${encodeURIComponent(fileId)}&preview=1`,
            filename,
            size,
            human_size: `${(size / (1024 * 1024)).toFixed(1)} MB`,
          } : undefined,
        }));
      }

      // 1.2 Nhận diện liên kết storage.to
      if (action === 'external_link' || action === 'storage_to') {
        const fileUrl = requiredText(body.file_url, 'Đường dẫn file', 1024).trim();
        const filename = requiredText(body.filename, 'Tên file', 255).trim();
        const contentType = optionalText(body.content_type, 'Loại file', 128) || 'application/octet-stream';
        const size = Number(body.size) || 0;

        return noStore(json({
          success: true,
          action: 'storage_to',
          file: {
            url: fileUrl,
            filename,
            size,
            content_type: contentType,
            human_size: `${(size / (1024 * 1024)).toFixed(1)} MB`,
            expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
          },
        }));
      }

      // 1.3 Khởi tạo trực tiếp với storage.to (có xử lý fallback an toàn)
      if (action === 'init') {
        const filename = requiredText(body.filename, 'Tên file', 255).trim();
        const contentType = optionalText(body.content_type, 'Loại file', 128) || 'application/octet-stream';
        const size = Number(body.size);
        const token = getStorageToToken();

        let expiryDays = Number(body.expiry_days) || DEFAULT_EXPIRY_DAYS;
        if (expiryDays !== 3 && expiryDays !== 7) {
          expiryDays = DEFAULT_EXPIRY_DAYS;
        }

        try {
          const initRes = await fetch(`${STORAGE_TO_BASE_URL}/upload/init`, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filename, content_type: contentType, size, expiry_days: expiryDays }),
          });

          const initData = (await initRes.json().catch(() => ({}))) as any;
          if (initRes.ok && initData?.success && initData?.upload_url) {
            return noStore(json({
              success: true,
              action: 'init',
              upload_url: initData.upload_url,
              r2_key: initData.r2_key,
              filename,
              content_type: contentType,
              size,
              expiry_days: expiryDays,
            }));
          }
        } catch {}

        // Nếu storage.to trả về 403 (do Cloudflare WAF chặn Worker), chuyển hướng sang chunk upload
        return noStore(json({
          success: true,
          action: 'use_chunk_upload',
          fallback: true,
          message: 'Chuyển sang chế độ tải trực tiếp an toàn vào hệ thống An Toàn Xe.',
        }));
      }

      throw new ApiError(400, 'Hành động không hợp lệ.', 'invalid_action');
    }

    throw new ApiError(400, 'Định dạng yêu cầu không được hỗ trợ.', 'invalid_content_type');
  } catch (error) {
    return apiError(error);
  }
}
