'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  Bluetooth,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Lock,
  ArrowRight,
  UserCheck,
  RefreshCw,
  Copy,
  Check,
  LogIn,
  School as SchoolIcon,
  User as UserIcon,
  Cpu,
  KeyRound,
  ExternalLink,
} from 'lucide-react';

type School = {
  id: string;
  name: string;
  address?: string;
  account_token?: string;
};

type AuthUser = {
  id: string;
  displayName: string;
  fullName: string | null;
  username: string | null;
  email: string;
  role: string;
  schoolId: string | null;
  schoolName: string | null;
  accountType: 'school' | 'personal';
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

// Bluetooth BLE UUIDs đồng bộ với firmware ESP32-C3
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_CHAR_READ_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const BLE_CHAR_WRITE_UUID = 'cba1d466-344c-4be3-ab3f-189f80dd7518';

export default function ActivatePage() {
  // Auth state
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  // Pairing mode: 'wifi_4g' vs 'bluetooth'
  const [pairingMode, setPairingMode] = useState<'wifi_4g' | 'bluetooth'>('wifi_4g');

  // Input states
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

  // Bluetooth state
  const [bleDevice, setBleDevice] = useState<any>(null);
  const [bleServer, setBleServer] = useState<any>(null);
  const [bleConnecting, setBleConnecting] = useState(false);
  const [bleConnected, setBleConnected] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);
  const [bleWriteChar, setBleWriteChar] = useState<any>(null);

  // Hardware Status state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingHardware, setCheckingHardware] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedApiUrl, setCopiedApiUrl] = useState(false);

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
    telemetry_url?: string;
    student_name: string;
    student_class: string;
    school_name: string;
    paired_at: string;
    viaBluetooth?: boolean;
  } | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Kiểm tra trạng thái đăng nhập người dùng
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data: any) => {
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user);
          if (data.user.schoolId) {
            setSchoolId(data.user.schoolId);
          }
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthChecking(false));
  }, []);

  // 2. Lấy thông tin từ QR Code trên URL
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

    // Tải danh sách trường học
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

  // 3. Kiểm tra tín hiệu thực tế của phần cứng xe qua API real-status (chế độ WiFi/4G)
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
        const isReady =
          dev.pairing_pending === 1 ||
          Boolean(dev.seconds_since_button_press !== null && dev.seconds_since_button_press < 900);
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

  // Polling trạng thái thiết bị mỗi 3 giây trong chế độ 4G
  useEffect(() => {
    if (pairingMode !== 'wifi_4g' || (!deviceId && !verifyCode)) return;

    checkRealHardwareStatus(deviceId, verifyCode);

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      checkRealHardwareStatus(deviceId, verifyCode);
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [deviceId, verifyCode, waitingTokenSync, pairingMode]);

  // 4. Kết nối Web Bluetooth API với ESP32
  const handleConnectBluetooth = async () => {
    setBleError(null);
    if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
      setBleError(
        'Trình duyệt này không hỗ trợ Web Bluetooth API. Vui lòng mở trang này trên Google Chrome (Android, Windows, macOS, Linux) hoặc Microsoft Edge.'
      );
      return;
    }

    setBleConnecting(true);
    try {
      // Tìm thiết bị có tên bắt đầu bằng "TDM2421" hoặc chứa service UUID
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: 'TDM2421' }],
        optionalServices: [BLE_SERVICE_UUID],
      });

      setBleDevice(device);

      const server = await device.gatt.connect();
      setBleServer(server);

      const service = await server.getPrimaryService(BLE_SERVICE_UUID);

      // Đọc Characteristic chứa Device ID & Verify Code
      try {
        const readChar = await service.getCharacteristic(BLE_CHAR_READ_UUID);
        const value = await readChar.readValue();
        const decoder = new TextDecoder('utf-8');
        const jsonStr = decoder.decode(value);
        const parsed = JSON.parse(jsonStr);

        if (parsed.device_id) {
          setDeviceId(parsed.device_id);
        }
        if (parsed.verify_code) {
          setVerifyCode(String(parsed.verify_code));
        }
      } catch (readErr) {
        console.warn('Không đọc được JSON từ characteristic, dùng ID từ tên thiết bị:', readErr);
        if (device.name && device.name.includes('-')) {
          const parts = device.name.split('-');
          if (parts[1]) setDeviceId(parts[1].trim());
        }
      }

      // Lấy Characteristic ghi để đẩy Token & URL xuống Flash
      try {
        const writeChar = await service.getCharacteristic(BLE_CHAR_WRITE_UUID);
        setBleWriteChar(writeChar);
      } catch (writeErr) {
        console.warn('Chưa tìm thấy characteristic ghi config:', writeErr);
      }

      setBleConnected(true);
      setError(null);
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setBleError(err.message || 'Không thể kết nối Bluetooth tới thiết bị xe.');
      }
    } finally {
      setBleConnecting(false);
    }
  };

  // 5. Gửi Form kích hoạt
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentUser) {
      setError('Vui lòng đăng nhập tài khoản trước khi ghép nối.');
      return;
    }
    if (!deviceId.trim()) {
      setError('Thiếu mã ID xe.');
      return;
    }
    if (!verifyCode.trim()) {
      setError('Thiếu mã xác thực phần cứng (verify code).');
      return;
    }
    if (
      !/^[0-9]{1,10}$/.test(verifyCode.trim()) ||
      BigInt(verifyCode.trim()) < 1n ||
      BigInt(verifyCode.trim()) > 1000000000n
    ) {
      setError('Mã xác thực phần cứng phải là số nguyên từ 1 đến 1.000.000.000.');
      return;
    }

    // Nếu ở chế độ 4G, yêu cầu thiết bị phải online hoặc đã bấm nút
    if (pairingMode === 'wifi_4g' && !hardwareStatus.pairingReady && !hardwareStatus.online) {
      setError(
        'Không thể ghép đôi! Thiết bị xe chưa bật nguồn hoặc chưa bấm nút Ghép đôi (BOOT). Hãy cấp nguồn cho xe và nhấn nút BOOT để xe gửi tín hiệu thực tế qua 4G.'
      );
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
          school_id: schoolId || currentUser?.schoolId || undefined,
          student_name: studentName.trim(),
          student_class: studentClass.trim(),
          parent_phone: parentPhone.trim() || undefined,
          pairing_mode: pairingMode,
        }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(
          resData?.error?.message || resData?.message || 'Kích hoạt thất bại. Mã xác thực phần cứng không khớp!'
        );
      }

      const returnedData = resData.data;

      // NẾU GHÉP NỐI QUA BLUETOOTH -> GHI TRỰC TIẾP TOKEN VÀ TELEMETRY_URL XUỐNG ESP32 FLASH
      let wroteBle = false;
      if (pairingMode === 'bluetooth' && bleWriteChar) {
        try {
          const payload = JSON.stringify({
            device_token: returnedData.device_token,
            telemetry_url: returnedData.telemetry_url,
            paired: true,
          });
          const encoder = new TextEncoder();
          await bleWriteChar.writeValue(encoder.encode(payload));
          wroteBle = true;
        } catch (bleWriteError) {
          console.warn('Không ghi được qua BLE, thiết bị vẫn có thể sync qua 4G:', bleWriteError);
        }
      }

      setSuccessData({
        ...returnedData,
        viaBluetooth: wroteBle,
      });

      if (!wroteBle) {
        setWaitingTokenSync(true);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi xử lý kích hoạt thiết bị.');
    } finally {
      setLoading(false);
    }
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/activate';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white shadow-md">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Ghép đôi & Kích hoạt xe</h1>
              <p className="text-xs text-slate-500">Hệ thống an toàn xe điện học sinh 2026</p>
            </div>
          </div>
          <a href="/admin" className="text-xs font-semibold text-emerald-700 hover:underline">
            Vào Dashboard →
          </a>
        </div>

        {/* BẮT BUỘC: Kiểm tra trạng thái Đăng nhập */}
        {authChecking ? (
          <div className="mb-6 rounded-2xl border bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-600" />
            Đang kiểm tra tài khoản đăng nhập...
          </div>
        ) : !currentUser ? (
          <div className="mb-6 overflow-hidden rounded-3xl border border-amber-300 bg-amber-50/90 p-6 shadow-md">
            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-amber-950">Yêu cầu đăng nhập trước khi kích hoạt</h2>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  Để thiết bị xe được gắn kết an toàn vào tài khoản của nhà trường, giáo viên hoặc cá nhân phụ huynh, bạn
                  cần <strong>đăng nhập trước</strong> khi tiến hành ghép nối.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <a
                    href={`/login?return_to=${encodeURIComponent(currentUrl)}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-amber-800 transition-colors"
                  >
                    <LogIn className="h-4 w-4" /> Đăng nhập ngay
                  </a>
                  <a
                    href={`/register?return_to=${encodeURIComponent(currentUrl)}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-700 bg-white px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
                  >
                    Đăng ký tài khoản
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-white">
                {currentUser.accountType === 'personal' ? <UserIcon className="h-5 w-5" /> : <SchoolIcon className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-xs font-semibold text-emerald-800">
                  Đã đăng nhập: <strong className="text-emerald-950">{currentUser.displayName}</strong>
                </p>
                <p className="text-[11px] text-emerald-700">
                  {currentUser.schoolName} ({currentUser.accountType === 'personal' ? 'Cá nhân' : 'Giáo viên/Trường'})
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-900">
              Sẵn sàng liên kết
            </span>
          </div>
        )}

        {/* Success View */}
        {successData ? (
          <section className="rounded-3xl border bg-white p-7 shadow-xl">
            <div className="flex items-center gap-3 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
              <div>
                <h2 className="text-xl font-bold">Kích hoạt thành công!</h2>
                <p className="text-xs text-slate-500">Mã xe {successData.device_id} đã kết nối vào hệ thống</p>
              </div>
            </div>

            {successData.viaBluetooth ? (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
                <p className="font-bold flex items-center gap-1.5 text-blue-950">
                  <Bluetooth className="h-4 w-4 text-blue-600" /> Đã nạp Token & Link API vào Flash qua Bluetooth thành công!
                </p>
                <p className="mt-1">
                  Bo mạch ESP32 đã lưu cấu hình vào bộ nhớ Flash (NVS) và sẵn sàng truyền dữ liệu an toàn.
                </p>
              </div>
            ) : null}

            <div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4 border text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Học sinh:</span>
                <span className="font-bold text-slate-800">{successData.student_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lớp:</span>
                <span className="font-bold text-slate-800">{successData.student_class}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trường/Đơn vị:</span>
                <span className="font-bold text-slate-800">{successData.school_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mã xe:</span>
                <span className="font-mono font-bold text-emerald-700">{successData.device_id}</span>
              </div>
              {successData.device_token ? (
                <div className="border-t pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Device Token (Phần cứng):</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(successData.device_token || '');
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                    >
                      {copiedToken ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedToken ? 'Đã sao chép' : 'Sao chép token'}
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-700 break-all bg-white p-2 rounded-lg border">
                    {successData.device_token}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <a
                href="/admin"
                className="button-primary flex-1 py-3 text-center text-sm font-bold shadow"
              >
                Vào Bảng điều khiển theo dõi xe
              </a>
              <button
                onClick={() => {
                  setSuccessData(null);
                  setDeviceId('');
                  setVerifyCode('');
                  setStudentName('');
                  setStudentClass('');
                }}
                className="rounded-xl border px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Kích hoạt xe khác
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border bg-white p-7 shadow-xl">
            {/* LỰA CHỌN CHẾ ĐỘ GHÉP NỐI: WIFI 4G VS BLUETOOTH */}
            <div className="mb-6">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Chế độ ghép nối</label>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 border">
                <button
                  type="button"
                  onClick={() => setPairingMode('wifi_4g')}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
                    pairingMode === 'wifi_4g'
                      ? 'bg-white text-emerald-800 shadow-sm border'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Wifi className="h-4 w-4" />
                  Ghép nối Wifi / 4G
                </button>
                <button
                  type="button"
                  onClick={() => setPairingMode('bluetooth')}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
                    pairingMode === 'bluetooth'
                      ? 'bg-white text-emerald-800 shadow-sm border'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Bluetooth className="h-4 w-4" />
                  Ghép nối Bluetooth (BLE)
                </button>
              </div>
            </div>

            {/* Chi tiết từng chế độ ghép nối */}
            {pairingMode === 'bluetooth' ? (
              <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-xs text-blue-950">
                <p className="font-bold flex items-center gap-1.5 text-blue-900">
                  <Bluetooth className="h-4 w-4 text-blue-600" /> Ghép nối trực tiếp qua Bluetooth Low Energy (BLE)
                </p>
                <p className="mt-1 leading-relaxed">
                  Trình duyệt sẽ kết nối không dây tới thiết bị ESP32 trên xe để tự đọc mã xác thực và nạp cấu hình token
                  xuống bộ nhớ Flash, không cần chờ sóng 4G.
                </p>

                {bleError ? (
                  <p className="mt-2.5 rounded-lg border border-red-300 bg-red-50 p-2.5 text-red-700 font-semibold">
                    {bleError}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={bleConnecting}
                    onClick={handleConnectBluetooth}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Bluetooth className="h-4 w-4" />
                    {bleConnecting
                      ? 'Đang dò Bluetooth...'
                      : bleConnected
                      ? '✓ Đã kết nối xe (' + (bleDevice?.name || 'TDM2421') + ')'
                      : '🔍 Quét & Kết nối Bluetooth'}
                  </button>
                  {bleConnected ? (
                    <span className="text-[11px] font-bold text-emerald-700">Đã nhận ID & Code!</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-700">
                <p className="font-bold flex items-center gap-1.5 text-slate-900">
                  <Radio className="h-4 w-4 text-emerald-600" /> Ghép nối qua đường truyền 4G / LTE
                </p>
                <p className="mt-1 leading-relaxed">
                  1. Cấp nguồn cho bo mạch xe. 2. Nhấn nút <strong>BOOT (GPIO9)</strong> trên bo mạch ESP32. 3. Quét mã QR
                  hoặc bấm xác nhận bên dưới.
                </p>

                {/* Trạng thái phần cứng thực tế */}
                <div className="mt-3 rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Trạng thái xe:</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        hardwareStatus.pairingReady
                          ? 'bg-emerald-100 text-emerald-800'
                          : hardwareStatus.online
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {hardwareStatus.statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{hardwareStatus.message}</p>
                </div>
              </div>
            )}

            {error ? (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-bold text-slate-700">
                  Mã xe (Device ID)
                  <input
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value.toUpperCase().trim())}
                    required
                    placeholder="VD: XE01"
                    className="form-input font-mono uppercase"
                  />
                </label>

                <label className="grid gap-1 text-xs font-bold text-slate-700">
                  Mã xác thực phần cứng (Verify Code)
                  <input
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.trim())}
                    required
                    placeholder="Số 1 - 1 tỷ (VD: 9824)"
                    className="form-input font-mono"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-bold text-slate-700">
                  Họ và tên học sinh
                  <input
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    required
                    placeholder="Nguyễn Văn A"
                    className="form-input"
                  />
                </label>

                <label className="grid gap-1 text-xs font-bold text-slate-700">
                  Lớp học
                  <input
                    value={studentClass}
                    onChange={(e) => setStudentClass(e.target.value.toUpperCase())}
                    required
                    placeholder="10A1"
                    className="form-input uppercase"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-xs font-bold text-slate-700">
                Số điện thoại phụ huynh nhận SMS cảnh báo (Tùy chọn)
                <input
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value.trim())}
                  placeholder="0912345678"
                  className="form-input"
                />
              </label>

              <button
                type="submit"
                disabled={loading || !currentUser}
                className="button-primary mt-2 w-full py-3 text-sm font-bold shadow-md disabled:opacity-50"
              >
                {loading
                  ? 'Đang xác thực & gửi API...'
                  : pairingMode === 'bluetooth'
                  ? 'Xác nhận & Nạp Token vào Flash qua Bluetooth'
                  : 'Xác nhận & Ghép nối xe'}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
