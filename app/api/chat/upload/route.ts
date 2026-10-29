import { ApiError, apiError, json, noStore, readJson, requiredText, optionalText } from '@/lib/server/http';
import { requirePasswordUser } from '@/lib/server/password-auth';
import { ensureSchema } from '@/lib/server/ensure-schema';

// Token API của tài khoản storage.to dùng để lưu trữ file chat an toàn xe
const DEFAULT_STORAGE_TO_TOKEN = '927|xwaP9soaUWC0amxNd6207zC48DhODZ4SHWVnJVSo';
const STORAGE_TO_BASE_URL = 'https://storage.to/api';
const MAX_FILE_SIZE = 25 * 1024 * 1024 * 1024; // 25 GB theo yêu cầu
const DEFAULT_EXPIRY_DAYS = 7; // Mặc định 7 ngày (hỗ trợ 3 hoặc 7 ngày)

function getStorageToToken(): string {
  try {
    const runtimeEnv = (globalThis as any).process?.env || {};
    return runtimeEnv.STORAGE_TO_TOKEN || DEFAULT_STORAGE_TO_TOKEN;
  } catch {
    return DEFAULT_STORAGE_TO_TOKEN;
  }
}

const COMMON_STORAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

export async function GET() {
  try {
    await requirePasswordUser();
    return noStore(json({
      success: true,
      provider: 'storage.to',
      max_size_bytes: MAX_FILE_SIZE,
      max_size_gb: 25,
      default_expiry_days: DEFAULT_EXPIRY_DAYS,
      allowed_expiry_days: [3, 7],
      features: {
        direct_r2_upload: true,
        direct_user_download: true,
        resumable_large_file: true,
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

    const token = getStorageToToken();
    const contentTypeHeader = request.headers.get('content-type') || '';

    // Trường hợp 1: JSON body (dùng cho 3-step Direct Upload up to 25 GB)
    if (contentTypeHeader.includes('application/json')) {
      const body = await readJson(request, 1024 * 1024);
      const action = optionalText(body.action, 'Hành động', 32) || 'init';

      let expiryDays = Number(body.expiry_days) || DEFAULT_EXPIRY_DAYS;
      if (expiryDays !== 3 && expiryDays !== 7) {
        expiryDays = DEFAULT_EXPIRY_DAYS;
      }

      if (action === 'init') {
        const filename = requiredText(body.filename, 'Tên file', 255).trim();
        const contentType = optionalText(body.content_type, 'Loại file', 128) || 'application/octet-stream';
        const size = Number(body.size);

        if (!Number.isFinite(size) || size <= 0) {
          throw new ApiError(400, 'Dung lượng file không hợp lệ.', 'invalid_size');
        }

        if (size > MAX_FILE_SIZE) {
          throw new ApiError(400, 'Dung lượng file vượt quá giới hạn tối đa 25GB.', 'file_too_large');
        }

        // Gọi storage.to /api/upload/init để lấy presigned R2 upload URL
        const initRes = await fetch(`${STORAGE_TO_BASE_URL}/upload/init`, {
          method: 'POST',
          headers: {
            ...COMMON_STORAGE_HEADERS,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename,
            content_type: contentType,
            size,
            expiry_days: expiryDays,
          }),
        });

        const initData = (await initRes.json().catch(() => ({}))) as any;
        if (!initRes.ok || !initData?.success || !initData?.upload_url) {
          throw new ApiError(
            initRes.status || 502,
            initData?.message || initData?.error?.message || 'Không thể khởi tạo phiên tải lên storage.to.',
            'storage_init_failed'
          );
        }

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

      if (action === 'confirm') {
        const r2Key = requiredText(body.r2_key, 'Khóa R2 upload', 255).trim();
        const filename = requiredText(body.filename, 'Tên file', 255).trim();
        const contentType = optionalText(body.content_type, 'Loại file', 128) || 'application/octet-stream';
        const size = Number(body.size);

        if (!Number.isFinite(size) || size <= 0) {
          throw new ApiError(400, 'Dung lượng file không hợp lệ.', 'invalid_size');
        }

        // Gọi storage.to /api/upload/confirm để xác nhận và lấy URL công khai
        const confirmRes = await fetch(`${STORAGE_TO_BASE_URL}/upload/confirm`, {
          method: 'POST',
          headers: {
            ...COMMON_STORAGE_HEADERS,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            r2_key: r2Key,
            filename,
            content_type: contentType,
            size,
            expiry_days: expiryDays,
          }),
        });

        const confirmData = (await confirmRes.json().catch(() => ({}))) as any;
        if (!confirmRes.ok || !confirmData?.success || !confirmData?.file) {
          throw new ApiError(
            confirmRes.status || 502,
            confirmData?.message || confirmData?.error?.message || 'Không thể xác nhận hoàn tất tải lên storage.to.',
            'storage_confirm_failed'
          );
        }

        return noStore(json({
          success: true,
          action: 'confirm',
          file: {
            id: confirmData.file.id,
            url: confirmData.file.url,
            filename: confirmData.file.filename || filename,
            size: confirmData.file.size || size,
            human_size: confirmData.file.human_size || `${(size / (1024 * 1024)).toFixed(1)} MB`,
            expires_at: confirmData.file.expires_at,
          },
        }));
      }

      throw new ApiError(400, 'Hành động không hợp lệ. Chỉ chấp nhận "init" hoặc "confirm".', 'invalid_action');
    }

    // Trường hợp 2: Multipart form-data (tải lên 1 bước cho file nhỏ hơn 50MB)
    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        throw new ApiError(400, 'Vui lòng cung cấp file cần tải lên.', 'missing_file');
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new ApiError(400, 'Dung lượng file vượt quá giới hạn tối đa 25GB.', 'file_too_large');
      }

      let expiryDays = Number(formData.get('expiry_days')) || DEFAULT_EXPIRY_DAYS;
      if (expiryDays !== 3 && expiryDays !== 7) {
        expiryDays = DEFAULT_EXPIRY_DAYS;
      }

      // Tạo FormData chuyển tiếp đến /api/sharex/upload của storage.to
      const forwardFormData = new FormData();
      forwardFormData.append('file', file, file.name);
      forwardFormData.append('expiry_days', String(expiryDays));

      const uploadRes = await fetch(`${STORAGE_TO_BASE_URL}/sharex/upload`, {
        method: 'POST',
        headers: {
          ...COMMON_STORAGE_HEADERS,
          'Authorization': `Bearer ${token}`,
        },
        body: forwardFormData,
      });

      const uploadData = (await uploadRes.json().catch(() => ({}))) as any;
      if (!uploadRes.ok || !uploadData?.success || !uploadData?.url) {
        throw new ApiError(
          uploadRes.status || 502,
          uploadData?.message || uploadData?.error?.message || 'Không thể tải file lên storage.to.',
          'storage_upload_failed'
        );
      }

      return noStore(json({
        success: true,
        action: 'upload',
        file: {
          url: uploadData.url,
          filename: uploadData.filename || file.name,
          size: file.size,
          human_size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          expires_at: uploadData.expires_at,
        },
      }));
    }

    throw new ApiError(400, 'Định dạng yêu cầu không được hỗ trợ. Vui lòng gửi JSON hoặc multipart/form-data.', 'invalid_content_type');
  } catch (error) {
    return apiError(error);
  }
}
