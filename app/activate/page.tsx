'use client';

import React, { useState, useEffect } from 'react';

type School = {
  id: string;
  name: string;
  address?: string;
  account_token?: string;
};

export default function ActivatePage() {
  const [deviceId, setDeviceId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [accountToken, setAccountToken] = useState('');
  const [verifiedSchool, setVerifiedSchool] = useState<School | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [schools, setSchools] = useState<School[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    device_id: string;
    device_token?: string;
    account_token?: string;
    api_token_url?: string;
    student_name: string;
    student_class: string;
    school_name: string;
    paired_at: string;
  } | null>(null);

  // Lấy gợi ý device_id, verify_code, account_token từ query parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('device_id');
      const verify = params.get('verify_code');
      const accToken = params.get('account_token') || params.get('token');

      if (id) {
        setDeviceId(id.toUpperCase().trim());
      }
      if (verify) {
        setVerifyCode(verify.trim());
      }
      if (accToken) {
        const cleanToken = accToken.trim();
        setAccountToken(cleanToken);
        // Kiểm tra token tài khoản với máy chủ
        fetch(`/api/schools?account_token=${encodeURIComponent(cleanToken)}`)
          .then((res) => res.json())
          .then((data: any) => {
            if (data?.success && data?.school) {
              setVerifiedSchool(data.school);
              setSchoolId(data.school.id);
            }
          })
          .catch((err) => console.error('Lỗi kiểm tra account token:', err));
      }
    }

    // Tải danh sách trường học (dùng khi không có account_token)
    fetch('/api/schools')
      .then((res) => res.json())
      .then((data: any) => {
        if (data?.schools && Array.isArray(data.schools)) {
          setSchools(data.schools);
          if (data.schools.length > 0 && !schoolId) {
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
          account_token: accountToken.trim() || undefined,
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
            Xác thực tài khoản nhà trường, liên kết mã xe và tự nạp token vào Flash bo mạch
          </p>
        </div>

        {/* Thông báo đã xác thực Token tài khoản */}
        {verifiedSchool ? (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 mb-6 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                Đã xác thực tài khoản trường học:
              </p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{verifiedSchool.name}</p>
              <p className="text-[11px] font-mono text-emerald-700 mt-0.5">Token: {verifiedSchool.account_token}</p>
            </div>
            <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm">
              Đã khóa trường
            </span>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 shadow-sm">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Quy trình ghép đôi thiết bị:
            </p>
            <ol className="text-xs text-slate-700 space-y-1.5 pl-4 list-decimal">
              <li><strong>Quét mã QR</strong> trên thiết bị để tự động nhận diện Mã xe, Mã xác thực và Token tài khoản.</li>
              <li>Nhập <strong>Họ tên và Lớp học</strong> rồi bấm <strong>Kích hoạt</strong>.</li>
              <li>Bấm nút <strong>BOOT (Pair Button)</strong> trên xe một lần để thiết bị tự nạp Token vào Flash (NVS)!</li>
            </ol>
          </div>
        )}

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
              Thiết bị đã được liên kết với học sinh và tài khoản trường học.
            </p>

            <div className="mt-6 bg-slate-50 rounded-2xl p-4 text-left space-y-2 border border-slate-200 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Mã ID xe:</span>
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
                <span className="text-slate-500">Trường quản lý:</span>
                <span className="font-bold text-slate-800">{successData.school_name}</span>
              </div>
              {successData.device_token ? (
                <div className="flex justify-between items-center pt-1 border-t">
                  <span className="text-slate-500">Token thiết bị (Hardware):</span>
                  <span className="font-bold text-indigo-700 font-mono text-xs">{successData.device_token}</span>
                </div>
              ) : null}
              {successData.account_token ? (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Token tài khoản:</span>
                  <span className="font-bold text-amber-700 font-mono text-xs">{successData.account_token}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-slate-500">Thời gian kích hoạt:</span>
                <span className="text-slate-700 text-xs">{new Date(successData.paired_at).toLocaleString('vi-VN')}</span>
              </div>
            </div>

            {/* Hướng dẫn tự nạp vào Flash cho phần cứng */}
            <div className="mt-5 p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-left">
              <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Tự động lưu Token vào bộ nhớ Flash của xe:
              </p>
              <p className="text-xs text-slate-700 mt-1">
                Bây giờ bạn chỉ cần <strong>nhấn nút ghép đôi (BOOT)</strong> trên xe một lần. Bo mạch ESP32 sẽ tự động gọi API lấy Token và lưu thẳng vào Flash NVS, sau đó xe sẽ tự động gửi dữ liệu định vị về bảng radar!
              </p>
              {successData.api_token_url ? (
                <div className="mt-2.5 pt-2 border-t border-indigo-200">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Link API cấp token tự động cho thiết bị:</p>
                  <p className="text-[11px] font-mono text-indigo-800 break-all select-all bg-white p-2 rounded-xl mt-1 border border-indigo-200">
                    {successData.api_token_url}
                  </p>
                </div>
              ) : null}
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

            {/* Token tài khoản trường học */}
            {accountToken ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  🛡️ Token Xác Thực Tài Khoản (Account Token)
                </label>
                <input
                  type="text"
                  value={accountToken}
                  readOnly
                  className="w-full px-4 py-3 rounded-xl border border-emerald-300 font-mono text-emerald-800 bg-emerald-50/50 font-bold focus:outline-none"
                />
                <p className="text-[11px] text-emerald-700 mt-1">
                  Đã tự động xác thực xe này thuộc về tài khoản trường học của bạn.
                </p>
              </div>
            ) : null}

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
                Mã xác thực là số nguyên từ 1 đến 1.000.000.000 nạp sẵn trong code firmware.
              </p>
            </div>

            {/* Trường học */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                🏫 Trường Học Quản Lý <span className="text-rose-500">*</span>
              </label>
              {verifiedSchool ? (
                <input
                  type="text"
                  value={verifiedSchool.name}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-emerald-300 bg-emerald-50/50 text-slate-800 font-bold"
                />
              ) : schools.length > 0 ? (
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
