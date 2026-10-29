import { NextResponse } from 'next/server';

export class ApiError extends Error {
  public isApiError = true;
  constructor(public status: number, message: string, public code = 'request_error') {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function json(data: unknown, init?: ResponseInit | number) {
  const options: ResponseInit | undefined = typeof init === 'number' ? { status: init } : init;
  return NextResponse.json(data, options);
}

export function apiError(error: unknown) {
  if (
    error instanceof ApiError ||
    (error && typeof error === 'object' && ('isApiError' in error || 'status' in error))
  ) {
    const err = error as any;
    return json(
      { success: false, error: { code: err.code || 'request_error', message: err.message || 'Lỗi yêu cầu' } },
      { status: typeof err.status === 'number' ? err.status : 400 }
    );
  }
  const message = error instanceof Error ? error.message : 'Máy chủ tạm thời không thể xử lý yêu cầu.';
  console.error('[API ERROR]', message);
  return json(
    { success: false, error: { code: 'internal_error', message: message || 'Máy chủ tạm thời không thể xử lý yêu cầu.' } },
    { status: 500 }
  );
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new ApiError(413, 'Dữ liệu gửi lên vượt kích thước cho phép.', 'payload_too_large');
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'JSON không hợp lệ.', 'invalid_json');
  }
}

export function requiredText(value: unknown, label: string, maxLength = 160): string {
  if (typeof value !== 'string') throw new ApiError(400, `${label} là bắt buộc.`, 'validation_error');
  const result = value.trim();
  if (!result || result.length > maxLength) throw new ApiError(400, `${label} không hợp lệ.`, 'validation_error');
  return result;
}

export function optionalText(value: unknown, label: string, maxLength = 1_000): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, label, maxLength);
}

export function optionalBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new ApiError(400, 'Giá trị bật/tắt không hợp lệ.', 'validation_error');
  return value;
}

export function boundedNumber(value: unknown, label: string, min: number, max: number, required = true): number | null {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    throw new ApiError(400, `${label} là bắt buộc.`, 'validation_error');
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ApiError(400, `${label} phải nằm trong khoảng ${min} đến ${max}.`, 'validation_error');
  }
  return value;
}

export function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

export function safeReturnTo(value?: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/admin';
  try {
    const url = new URL(value, 'https://local.invalid');
    return url.origin === 'https://local.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/admin';
  } catch {
    return '/admin';
  }
}
