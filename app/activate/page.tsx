'use client';

import React, { useState, useEffect, useRef } from 'react';

type School = {
  id: string;
  name: string;
  address?: string;
  account_token?: string;
};

type HardwareRealStatus = {
  checked: boolean;
  online: boolean;
  pairingReady: boolean;
  tokenSynced: boolean;
  paired: boolean;
  message: string;
  statusLabel: 'ONLINE' | 'OFFLINE' | 'PAIRING_READY' | 'TOKEN_SYNCED';
  lastSeen?: string | null;
  pairingRequestedAt?: string | null;
  secondsSinceButton?: number | null;
  studentName?: string | null;
  studentClass?: string | null;
  schoolName?: string | null;
};

export default function ActivatePage() {
  const [deviceId, setDeviceId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [accountToken, setAccountToken] = useState('');
  const [isFromQR, setIsFromQR] = useState(false);

  const [verifiedSchool, setVerifiedSchool] = useState<School | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [schools, setSchools] = useState<School[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingHardware, setCheckingHardware] = useState(false);

  const [hardwareStatus, setHardwareStatus] = useState<HardwareRealStatus>({
    checked: false,
    online: false,
    pairingReady: false,
    tokenSynced: false,
    paired: false,
    statusLabel: 'OFFLINE',
    message: 'Đang kiểm tra tín hiệu phần cứng...',
  });

  const [waitingTokenSync, setWaitingTokenSync] = useState(false);
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

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Lấy thông tin từ QR Code trên URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('device_id');
      const verify = params.get('verify_code');
      const accToken = params.get('account_token') || params.get('token');

      let hasQRParams = false;
      if (id) {
        setDeviceId(id.toUpperCase().trim());
        hasQRParams = true;
      }
      if (verify) {
        setVerifyCode(verify.trim());
        hasQRParams = true;
      }
      if (hasQRParams) {
        setIsFromQR(true);
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

  // 2. Hàm kiểm tra tín hiệu thực tế của phần cứng xe qua API real-status
  const checkRealHardwareStatus = async (targetId: string, targetVerify: string) => {
    if (!targetId && !targetVerify) return;
    setCheckingHardware(true);
    try {
      const query = new URLSearchParams();
      if (targetId) query.set('device_id', targetId);
      if (targetVerify) query.set('verify_code', targetVerify);

      const res = await fetch(`/api/device/real-status?${query.toString()}`);
      const data = await res.json();

      if (data?.success && data?.device) {
        const dev = data.device;
        const isOnline = Boolean(dev.hardware_online);
        const isReady = dev.pairing_pending === 1 || Boolean(dev.seconds_since_button_press !== null && dev.seconds_since_button_press < 900);
        const isSynced = Boolean(dev.token_synced);

        setHardwareStatus({
          checked: true,
          online: isOnline,
          pairingReady: isReady,
          tokenSynced: isSynced,
          paired: Boolean(dev.paired),
          statusLabel: dev.status_label || (isReady ? 'PAIRING_READY' : isOnline ? 'ONLINE' : 'OFFLINE'),
          message: dev.message,
          lastSeen: dev.last_seen,
          pairingRequestedAt: dev.pairing_requested_at,
          secondsSinceButton: dev.seconds_since_button_press,
          studentName: dev.student_name,
          studentClass: dev.student_class,
          schoolName: dev.school_name,
        });

        // Nếu đang trong trạng thái chờ thiết bị tải token về Flash và nhận thấy token đã sync
        if (waitingTokenSync && (isSynced || dev.token_synced_at)) {
          setWaitingTokenSync(false);
        }
      } else {
        setHardwareStatus({
          checked: true,
          online: false,
          pairingReady: false,
          tokenSynced: false,
          paired: false,
          statusLabel: 'OFFLINE',
          message: data?.message || 'Không tìm thấy thông tin thiết bị trong hệ thống.',
        });
      }
    } catch (err: any) {
      console.error('Lỗi kiểm tra real status:', err);
    } finally {
      setCheckingHardware(false);
    }
  };

  // 3. Tự động kiểm tra và Polling trạng thái thiết bị mỗi 3 giây
  useEffect(() => {
    if (!deviceId && !verifyCode) return;

    // Kiểm tra ngay lập tức
    checkRealHardwareStatus(deviceId, verifyCode);

    // Bắt đầu vòng lặp polling mỗi 3 giây
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      checkRealHardwareStatus(deviceId, verifyCode);
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [deviceId, verifyCode, waitingTokenSync]);

  // 4. Xử lý gửi Form kích hoạt
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!deviceId.trim()) {
      setError('Thiếu mã ID xe từ mã QR.');
      return;
    }
    if (!verifyCode.trim()) {
      setError('Thiếu mã xác thực phần cứng từ mã QR.');
      return;
    }
    if (!/^[0-9]{1,10}$/.test(verifyCode.trim()) || BigInt(verifyCode.trim()) < 1n || BigInt(verifyCode.trim()) > 1000000000n) {
      setError('Mã xác thực phần cứng phải là số nguyên từ 1 đến 1.000.000.000.');
      return;
    }

    // KIỂM TRA PHẦN CỨNG THẬT TRƯỚC KHI GỬI
    if (!hardwareStatus.pairingReady && !hardwareStatus.online) {
      setError('Không thể ghép đôi! Thiết bị xe chưa bật nguồn hoặc chưa bấm nút Ghép đôi (BOOT). Hãy cấp nguồn cho xe và nhấn nút BOOT để xe gửi tín hiệu thật qua 4G.');
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
        throw new Error(resData?.error?.message || resData?.message || 'Kích hoạt thất bại. Thiết bị chưa phát tín hiệu thực tế.');
      }

      setSuccessData(resData.data);
      setWaitingTokenSync(true); // Bắt đầu chờ bo mạch tải token về Flash
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi kích hoạt thiết bị.');
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
            GHÉP ĐÔI THIẾT BỊ XE HỌC SINH
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Quét mã QR trên xe ➔ Tự nhận diện thiết bị ➔ Kiểm tra tín hiệu 4G thực tế
          </p>
        </div>

        {/* THÔNG BÁO TỰ NHẬN DIỆN TỪ QR CODE */}
        {isFromQR ? (
          <div className="bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                  Đã tự động nhận diện từ mã QR xe
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-xs">
                Mã QR Hợp Lệ
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                <span className="text-slate-500 block text-[11px]">Mã xe (Device ID):</span>
                <span className="font-mono font-black text-emerald-800 text-sm">{deviceId}</span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                <span className="text-slate-500 block text-[11px]">Mã bảo mật phần cứng:</span>
                <span className="font-mono font-bold text-slate-800 text-sm">••••••{verifyCode.slice(-4)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 shadow-sm">
            <p className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Hướng dẫn ghép đôi nhanh:
            </p>
            <p className="text-xs text-slate-700">
              Dùng điện thoại quét mã QR dán trên bo mạch xe hoặc nhập mã xe và mã bảo mật bên dưới để bắt đầu kiểm tra kết nối thật.
            </p>
          </div>
        )}

        {/* BẢNG THEO DÕI TÍN HIỆU PHẦN CỨNG REAL-TIME */}
        {(deviceId || verifyCode) && (
          <div className="bg-white rounded-3xl p-5 mb-6 shadow-md border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  📡 Kiểm Tra Tín Hiệu Bo Mạch Xe:
                </span>
              </div>
              <button
                type="button"
                onClick={() => checkRealHardwareStatus(deviceId, verifyCode)}
                disabled={checkingHardware}
                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${checkingHardware ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{checkingHardware ? 'Đang dò...' : 'Dò lại tín hiệu'}</span>
              </button>
            </div>

            {/* Trạng thái phần cứng */}
            <div className="mt-3">
              {hardwareStatus.statusLabel === 'TOKEN_SYNCED' ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider mb-1">
                      KẾT NỐI REAL-TIME THÀNH CÔNG
                    </span>
                    <p className="text-xs font-bold text-slate-800">
                      Bo mạch ESP32 đã nạp Token vào Flash NVS và đang truyền dữ liệu an toàn!
                    </p>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Xe đã sẵn sàng hoạt động trên bảng điều khiển giám sát.
                    </p>
                  </div>
                </div>
              ) : hardwareStatus.statusLabel === 'PAIRING_READY' ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 animate-pulse">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider mb-1">
                      ĐÃ PHÁT HIỆN TÍN HIỆU 4G TỪ XE (ONLINE)
                    </span>
                    <p className="text-xs font-bold text-emerald-900">
                      Bo mạch xe vừa gửi yêu cầu ghép đôi (đã nhấn nút BOOT)!
                    </p>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {hardwareStatus.secondsSinceButton !== null
                        ? `Tín hiệu nhận được cách đây ${hardwareStatus.secondsSinceButton} giây. Nhấn Xác Nhận bên dưới để hoàn tất.`
                        : 'Sẵn sàng kích hoạt tài khoản học sinh ngay bây giờ.'}
                    </p>
                  </div>
                </div>
              ) : hardwareStatus.statusLabel === 'ONLINE' ? (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider mb-1">
                      XE ĐANG BẬT - CẦN BẤM NÚT BOOT
                    </span>
                    <p className="text-xs font-bold text-amber-900">
                      Đã phát hiện xe đang hoạt động nhưng chưa mở chế độ ghép đôi.
                    </p>
                    <p className="text-[11px] text-slate-700 mt-1">
                      👉 Hãy nhấn nút <strong>BOOT (Pair Button)</strong> trên xe một lần để xe gửi tín hiệu xác nhận ghép nối.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider mb-1">
                      CHƯA CÓ TÍN HIỆU TỪ XE (OFFLINE)
                    </span>
                    <p className="text-xs font-bold text-rose-900">
                      Không thể ghép đôi giả mạo khi xe chưa bật nguồn!
                    </p>
                    <div className="text-[11px] text-slate-700 mt-1 space-y-1">
                      <p>Vui lòng thực hiện các bước sau để kết nối REAL:</p>
                      <ol className="list-decimal pl-4 space-y-0.5">
                        <li>Bật công tắc nguồn của xe / bo mạch ESP32.</li>
                        <li>Đợi đèn LED 4G sáng ổn định.</li>
                        <li>Nhấn nút <strong>BOOT</strong> trên xe để phát tín hiệu lên máy chủ.</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* THÔNG BÁO XÁC THỰC TÀI KHOẢN TRƯỜNG HỌC */}
        {verifiedSchool ? (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 mb-6 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                Tài khoản trường học quản lý:
              </p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{verifiedSchool.name}</p>
              <p className="text-[11px] font-mono text-emerald-700 mt-0.5">Token: {verifiedSchool.account_token}</p>
            </div>
            <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm">
              Đã khóa trường
            </span>
          </div>
        ) : null}

        {/* MÀN HÌNH THÀNH CÔNG VÀ ĐỒNG BỘ TOKEN VỀ FLASH */}
        {successData ? (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-100 text-center animate-fade-in">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800">GHÉP ĐÔI THÀNH CÔNG!</h2>
            <p className="text-sm text-slate-600 mt-2">
              Hệ thống đã liên kết xe với học sinh và sẵn sàng truyền dữ liệu thật.
            </p>

            {/* Thông tin đã liên kết */}
            <div className="mt-6 bg-slate-50 rounded-2xl p-4 text-left space-y-2 border border-slate-200 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Mã ID xe:</span>
                <span className="font-bold text-emerald-700 font-mono">{successData.device_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Họ và tên học sinh:</span>
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
              {successData.device_token && (
                <div className="flex justify-between items-center pt-1 border-t">
                  <span className="text-slate-500">Token thiết bị (Hardware):</span>
                  <span className="font-bold text-indigo-700 font-mono text-xs">{successData.device_token}</span>
                </div>
              )}
            </div>

            {/* Trạng thái nạp Token vào bộ nhớ Flash bo mạch */}
            <div className="mt-5 p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-left">
              <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Tự động lưu Token vào bộ nhớ Flash xe (NVS):
              </p>

              {hardwareStatus.tokenSynced ? (
                <div className="mt-2 p-3 rounded-xl bg-emerald-100/70 border border-emerald-300 text-xs text-emerald-900 font-bold flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Bo mạch ESP32 đã nạp Token thành công vào Flash! Xe đã kết nối Real-time.</span>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-700">
                  <p>
                    Bo mạch xe đang kết nối 4G sẽ tự động lấy Token lưu vào Flash NVS sau vài giây.
                  </p>
                  <p className="mt-1 font-bold text-indigo-800">
                    👉 Bạn cũng có thể bấm nút <strong>BOOT (Ghép đôi)</strong> trên xe một lần nữa để xe nạp Token ngay lập tức!
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <a
                href="/login"
                className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3.5 font-bold text-white hover:bg-emerald-700 transition shadow-lg"
              >
                Vào Bảng Radar Giám Sát
              </a>
              <button
                type="button"
                onClick={() => {
                  setSuccessData(null);
                  setStudentName('');
                  setStudentClass('');
                }}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3.5 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Kích hoạt xe khác
              </button>
            </div>
          </div>
        ) : (
          /* FORM NHẬP THÔNG TIN VÀ XÁC THỰC */
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

            {/* Mã ID Xe từ QR Code (Khóa chỉ đọc nếu quét từ QR) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                🏷️ Mã ID Xe (Từ mã QR thiết bị) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
                readOnly={isFromQR}
                placeholder="VD: TDM-2421 hoặc XE01..."
                required
                className={`w-full px-4 py-3 rounded-xl border font-mono font-bold text-slate-800 transition ${
                  isFromQR
                    ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 cursor-not-allowed'
                    : 'border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500'
                }`}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {isFromQR
                  ? 'Mã xe được khóa tự động theo mã QR in trên xe để bảo đảm tính xác thực.'
                  : 'Nhập chính xác mã ID xe nạp trong firmware.'}
              </p>
            </div>

            {/* Mã xác thực phần cứng (Khóa chỉ đọc nếu quét từ QR) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                🔑 Mã Xác Thực Phần Cứng (Từ 1 - 1.000.000.000) <span className="text-rose-500">*</span>
              </label>
              <input
                type={isFromQR ? 'password' : 'text'}
                inputMode="numeric"
                maxLength={10}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                readOnly={isFromQR}
                placeholder="VD: 9824 hoặc mã bí mật trên bo mạch"
                required
                className={`w-full px-4 py-3 rounded-xl border font-mono transition ${
                  isFromQR
                    ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 cursor-not-allowed'
                    : 'border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500'
                }`}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Mã xác thực duy nhất được nạp sẵn vào firmware của bo mạch xe.
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
                Số điện thoại nhận tin nhắn khẩn cấp khi xe vượt tốc độ hoặc không đội mũ bảo hiểm.
              </p>
            </div>

            {/* Nút bấm Submit - Chỉ mở khi thiết bị thực tế đang phát tín hiệu */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || (!hardwareStatus.pairingReady && !hardwareStatus.online)}
                className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold text-white shadow-lg transition ${
                  hardwareStatus.pairingReady || hardwareStatus.online
                    ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer focus:ring-4 focus:ring-emerald-200'
                    : 'bg-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Đang kết nối Real-time với xe...</span>
                  </>
                ) : hardwareStatus.pairingReady || hardwareStatus.online ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>XÁC NHẬN GHÉP ĐÔI REAL-TIME</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>BẬT NGUỒN VÀ BẤM NÚT BOOT TRÊN XE ĐỂ KÍCH HOẠT</span>
                  </>
                )}
              </button>

              {!hardwareStatus.pairingReady && !hardwareStatus.online && (
                <p className="text-[11px] text-center text-rose-600 font-semibold mt-2">
                  ⚠️ Nút xác nhận đang khóa vì chưa phát hiện tín hiệu 4G từ bo mạch xe.
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
