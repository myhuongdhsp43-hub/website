'use client';

import React, { useState, useEffect } from 'react';

type School = {
  id: string;
  name: string;
  address?: string;
};

export default function ActivatePage() {
  const [deviceId, setDeviceId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [schools, setSchools] = useState<School[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    device_id: string;
    student_name: string;
    student_class: string;
    school_name: string;
    paired_at: string;
  } | null>(null);

  // Lấy gợi ý device_id từ query parameters (?device_id=XE01)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('device_id');
      const verify = params.get('verify_code');
      if (id) {
        setDeviceId(id.toUpperCase().trim());
      }
      if (verify) {
        setVerifyCode(verify.trim());
      }
    }

    // Tải danh sách trường học
    fetch('/api/schools')
      .then((res) => res.json())
      .then((data: any) => {
        if (data?.schools && Array.isArray(data.schools)) {
          setSchools(data.schools);
          if (data.schools.length > 0) {
            setSchoolId(data.schools[0].id);
          }
        }
      })
      .catch((err) => console.error('Lỗi tải danh sách trường:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!deviceId.trim()) {
      setError('Vui lòng nhập ID xe (bạn có thể tự đặt tên xe theo ý muốn).');
      return;
    }
    if (!verifyCode.trim()) {
      setError('Vui lòng nhập mã xác thực phần cứng (số từ 1 đến 1.000.000.000).');
      return;
    }
    if (!/^[0-9]{1,10}$/.test(verifyCode.trim()) || BigInt(verifyCode.trim()) < 1n || BigInt(verifyCode.trim()) > 1000000000n) {
      setError('Mã xác thực phải là số nguyên từ 1 đến 1.000.000.000 (tối đa 10 chữ số).');
      return;
    }
    if (!studentName.trim()) {
      setError('Vui lòng nhập họ và tên học sinh.');
      return;
    }
    if (!studentClass.trim()) {
      setError('Vui lòng nhập lớp học của học sinh.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/device/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId.trim(),
          verify_code: verifyCode.trim(),
          school_id: schoolId || undefined,
          student_name: studentName.trim(),
          student_class: studentClass.trim(),
          parent_phone: parentPhone.trim() || undefined,
        }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData?.error?.message || resData?.message || 'Kích hoạt thất bại. Vui lòng kiểm tra lại ID xác minh.');
      }

      setSuccessData(resData.data);
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white shadow-lg mb-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
            XÁC THỰC & GHÉP ĐÔI THIẾT BỊ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tự do đặt ID xe và xác thực thiết bị vật lý vào hệ thống nhà trường
          </p>
        </div>

        {/* Hướng dẫn quy trình */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 shadow-sm">
          <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Quy trình ghép đôi thiết bị:
          </p>
          <ol className="text-xs text-slate-700 space-y-1.5 pl-4 list-decimal">
            <li><strong>Ấn nút</strong> trên thiết bị vật lý để bật chế độ nhận diện.</li>
            <li><strong>Quét mã QR</strong> trên thiết bị để mở trang kích hoạt.</li>
            <li><strong>Đặt mã ID xe theo ý muốn</strong> (tự custom), nhập <strong>mã xác thực phần cứng</strong> (nạp trong code) rồi bấm <strong>Kích hoạt</strong>.</li>
          </ol>
        </div>

        {/* Màn hình kết quả thành công */}
        {successData ? (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-100 text-center animate-fade-in">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800">GHÉP ĐÔI THÀNH CÔNG!</h2>
            <p className="text-sm text-slate-600 mt-2">
              Thiết bị vật lý đã được nối chính xác với ID xe và hồ sơ học sinh trên hệ thống.
            </p>

            <div className="mt-6 bg-slate-50 rounded-2xl p-4 text-left space-y-2 border border-slate-200 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Mã ID xe (Custom):</span>
                <span className="font-bold text-emerald-700 font-mono">{successData.device_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Họ và tên:</span>
                <span className="font-bold text-slate-800">{successData.student_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lớp:</span>
                <span className="font-bold text-slate-800">{successData.student_class}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trường:</span>
                <span className="font-bold text-slate-800">{successData.school_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Thời gian kích hoạt:</span>
                <span className="text-slate-700 text-xs">{new Date(successData.paired_at).toLocaleString('vi-VN')}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <a
                href="/login"
                className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 transition"
              >
                Vào Bảng Radar Giám Sát
              </a>
              <button
                type="button"
                onClick={() => {
                  setSuccessData(null);
                  setVerifyCode('');
                  setStudentName('');
                }}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Kích hoạt thêm xe khác
              </button>
            </div>
          </div>
        ) : (
          /* Form kích hoạt */
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/80 space-y-5"
          >
            {error && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-start gap-2">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Custom Device ID */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                🏷️ Mã ID Xe Tự Chọn (Custom Device ID) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
                placeholder="VD: XE_NAM_9A1 hoặc XE01, Biển số xe..."
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-300 font-mono font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Người dùng có thể tự do đặt mã xe theo ý thích (theo tên học sinh, lớp hoặc biển số xe).
              </p>
            </div>

            {/* Hardware Verification Code */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                🔑 Mã Xác Thực Nhận Thiết Bị (Từ 1 - 1.000.000.000) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                placeholder="VD: 9824 hoặc số bất kỳ từ 1 đến 1.000.000.000"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-300 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Mã xác thực là số nguyên từ 1 đến 1.000.000.000 (tối đa 10 chữ số) nạp sẵn trong code firmware.
              </p>
            </div>

            {/* Trường học */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                🏫 Trường Học <span className="text-rose-500">*</span>
              </label>
              {schools.length > 0 ? (
                <select
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value="Trường THCS Mặc Định"
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-slate-100 text-slate-600"
                />
              )}
            </div>

            {/* Thông tin học sinh */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  👤 Họ và Tên Học Sinh <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="VD: Nguyễn Văn Nam"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  🎒 Lớp Học <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value.toUpperCase())}
                  placeholder="VD: 9A1"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Số điện thoại phụ huynh */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                📞 Số Điện Thoại Phụ Huynh (Nhận SMS cảnh báo)
              </label>
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                placeholder="VD: 0912345678"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Dùng để gửi tin nhắn SMS khẩn cấp khi xe vượt tốc độ hoặc học sinh không đội mũ.
              </p>
            </div>

            {/* Nút bấm Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 font-bold text-white shadow-lg hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-200 transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Đang xác minh & ghép đôi...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span>XÁC THỰC & GHÉP ĐÔI THIẾT BỊ</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
