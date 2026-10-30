'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type PhotoItem = {
  id: string;
  room_id: string;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
};

// Nén ảnh tự động trên trình duyệt (Canvas) để upload siêu tốc từ iPhone
async function compressImage(file: File, maxDimension = 1920, quality = 0.85): Promise<{ base64: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ base64: e.target?.result as string, size: file.size });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        const approxSize = Math.round((base64.length * 3) / 4);
        resolve({ base64, size: approxSize });
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoDropPage() {
  const [room, setRoom] = useState('khkt');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) setRoom(roomParam.trim().toLowerCase());
      setCurrentUrl(`${window.location.origin}/drop?room=${encodeURIComponent(roomParam || 'khkt')}`);
    }
  }, []);

  const loadPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/drop/photos?room=${encodeURIComponent(room)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as { success: boolean; photos: PhotoItem[] };
        if (data.success) {
          setPhotos(data.photos || []);
        }
      }
    } catch {}
  }, [room]);

  // Tự động đồng bộ mỗi 2 giây
  useEffect(() => {
    void loadPhotos();
    const timer = setInterval(() => void loadPhotos(), 2000);
    return () => clearInterval(timer);
  }, [loadPhotos]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      const total = files.length;
      for (let i = 0; i < total; i++) {
        const file = files[i];
        setUploadProgress(`Đang xử lý và gửi ảnh ${i + 1}/${total}...`);

        const { base64, size } = await compressImage(file);

        await fetch('/api/drop/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room,
            filename: file.name || `photo_${Date.now()}.jpg`,
            content_type: 'image/jpeg',
            size,
            data: base64,
          }),
        });
      }

      setUploadProgress('Gửi ảnh thành công!');
      setTimeout(() => setUploadProgress(null), 2500);
      await loadPhotos();
    } catch (err) {
      alert('Lỗi gửi ảnh: ' + (err instanceof Error ? err.message : 'Vui lòng thử lại.'));
      setUploadProgress(null);
    } finally {
      setUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  }

  async function deletePhoto(id: string) {
    if (!confirm('Bạn có chắc chắn muốn xóa ảnh này?')) return;
    try {
      await fetch(`/api/drop/photos?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadPhotos();
    } catch {}
  }

  async function clearAll() {
    if (!confirm(`Xóa toàn bộ ảnh trong phòng "${room}"?`)) return;
    try {
      await fetch(`/api/drop/photos?room=${encodeURIComponent(room)}`, { method: 'DELETE' });
      await loadPhotos();
    } catch {}
  }

  async function copyToClipboard(photo: PhotoItem) {
    try {
      const imgUrl = `/api/drop/raw?id=${encodeURIComponent(photo.id)}`;
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopiedId(photo.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback copy link
      await navigator.clipboard.writeText(`${window.location.origin}/api/drop/raw?id=${encodeURIComponent(photo.id)}`);
      alert('Đã sao chép link ảnh vào bộ nhớ tạm!');
    }
  }

  const qrUrl = currentUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentUrl)}`
    : '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Ẩn input camera và gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📲</span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Truyền ảnh Siêu Tốc (iOS ➔ Máy tính)</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Chụp ảnh mạch điện / linh kiện từ iPhone là ảnh tự nhảy lên màn hình máy tính ngay lập tức.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs sm:text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-sm"
            >
              ← Về Bảng điều khiển
            </Link>
          </div>
        </header>

        {/* Thanh trạng thái phòng & Nút bấm chụp ảnh (Đặc biệt tối ưu cho iPhone) */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Cột 1 & 2: Khu vực điều khiển & Upload */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-sm font-semibold">Phòng truyền ảnh:</span>
                  <input
                    type="text"
                    value={room}
                    onChange={(e) => setRoom(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className="w-28 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-sm font-bold text-center text-blue-600 dark:text-blue-400"
                    placeholder="khkt"
                  />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Tự động làm mới mỗi 2 giây
                </span>
              </div>

              {/* Nút to cho iPhone / Mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center justify-center gap-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white p-4 font-bold text-base shadow-md transition disabled:opacity-50"
                >
                  <span className="text-2xl">📸</span>
                  <span>Chụp ảnh mới bằng iPhone</span>
                </button>

                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex items-center justify-center gap-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white dark:bg-slate-800 dark:hover:bg-slate-700 p-4 font-bold text-base shadow-md transition disabled:opacity-50"
                >
                  <span className="text-2xl">🖼️</span>
                  <span>Chọn ảnh từ Thư viện</span>
                </button>
              </div>

              {/* Thông báo tiến độ upload */}
              {uploadProgress && (
                <div className="rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 p-3 text-center text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></span>
                  <span>{uploadProgress}</span>
                </div>
              )}
            </div>
          </div>

          {/* Cột 3: Mã QR mở nhanh trên iPhone */}
          <div className="rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col items-center justify-center text-center space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Quét mã bằng Camera iPhone</p>
            {qrUrl ? (
              <div className="p-2 bg-white rounded-xl shadow-inner border border-slate-200">
                <img src={qrUrl} alt="Mã QR mở trên điện thoại" className="w-36 h-36" />
              </div>
            ) : null}
            <p className="text-xs text-slate-500 max-w-xs">
              Mở Camera trên iPhone, quét mã này để mở thẳng trang chụp ảnh mà không cần gõ địa chỉ!
            </p>
          </div>
        </div>

        {/* Danh sách ảnh đã nhận trên máy tính */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>Ảnh đã nhận</span>
              <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-xs font-semibold">
                {photos.length} ảnh
              </span>
            </h2>
            {photos.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {photos.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
              <span className="text-4xl block">📷</span>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Chưa có ảnh nào trong phòng "{room}".
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Hãy mở camera iPhone bấm chụp hoặc quét mã QR ở trên để bắt đầu gửi ảnh sang máy tính ngay lập tức.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative rounded-xl border bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col"
                >
                  {/* Thumbnail */}
                  <div
                    onClick={() => setPreviewPhoto(photo)}
                    className="cursor-pointer aspect-square bg-slate-100 dark:bg-slate-800 relative overflow-hidden flex items-center justify-center"
                  >
                    <img
                      src={`/api/drop/raw?id=${encodeURIComponent(photo.id)}`}
                      alt={photo.filename}
                      loading="lazy"
                      className="object-cover w-full h-full group-hover:scale-105 transition duration-200"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <span className="text-white text-xs font-bold bg-black/60 px-2 py-1 rounded-md">Phóng to 🔍</span>
                    </div>
                  </div>

                  {/* Thông tin & Tác vụ */}
                  <div className="p-2.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-medium truncate" title={photo.filename}>
                        {photo.filename}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(photo.size / 1024).toFixed(0)} KB · {new Date(photo.created_at).toLocaleTimeString('vi-VN')}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-1 pt-1 border-t dark:border-slate-800">
                      {/* Tải về */}
                      <a
                        href={`/api/drop/raw?id=${encodeURIComponent(photo.id)}&download=1`}
                        download={photo.filename}
                        title="Tải ảnh về máy"
                        className="flex items-center justify-center rounded-lg p-1.5 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                      >
                        📥
                      </a>

                      {/* Sao chép ảnh */}
                      <button
                        onClick={() => copyToClipboard(photo)}
                        title="Sao chép ảnh vào clipboard"
                        className="flex items-center justify-center rounded-lg p-1.5 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                      >
                        {copiedId === photo.id ? '✓' : '📋'}
                      </button>

                      {/* Xóa */}
                      <button
                        onClick={() => deletePhoto(photo.id)}
                        title="Xóa ảnh này"
                        className="flex items-center justify-center rounded-lg p-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 transition"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal phóng to ảnh */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={`/api/drop/raw?id=${encodeURIComponent(previewPhoto.id)}`}
              alt={previewPhoto.filename}
              className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl"
            />
            <div className="mt-3 flex items-center gap-3 bg-slate-900/90 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg">
              <span>{previewPhoto.filename}</span>
              <span>·</span>
              <span>{(previewPhoto.size / 1024).toFixed(0)} KB</span>
              <span>·</span>
              <a
                href={`/api/drop/raw?id=${encodeURIComponent(previewPhoto.id)}&download=1`}
                download={previewPhoto.filename}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg transition"
              >
                Tải về máy tính
              </a>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
