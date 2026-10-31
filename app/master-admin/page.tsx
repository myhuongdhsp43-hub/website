'use client';

import React, { useState, useEffect } from 'react';

type MasterDevice = {
  id: string;
  device_id: string;
  device_name: string;
  verify_code: string | null;
  device_token?: string | null;
  account_token?: string | null;
  enabled: number;
  last_seen: string | null;
  paired_at: string | null;
  device_token_hash: string;
  created_at: string;
  student_name: string | null;
  student_code: string | null;
  class_name: string | null;
  school_name: string | null;
  school_id: string | null;
};

type MasterUser = {
  id: string;
  username: string | null;
  email: string;
  role: string;
  active: number;
  created_at: string;
  school_name: string | null;
};

type MasterSchool = {
  id: string;
  name: string;
  address: string | null;
  account_token?: string | null;
  created_at: string;
};

export default function MasterAdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [devices, setDevices] = useState<MasterDevice[]>([]);
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [schools, setSchools] = useState<MasterSchool[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'devices' | 'users' | 'generator'>('devices');

  // Bộ sinh mã ngẫu nhiên
  const [generatedCode, setGeneratedCode] = useState('');
  const [customDeviceId, setCustomDeviceId] = useState('');
  const [customDeviceName, setCustomDeviceName] = useState('');
  const [targetSchoolId, setTargetSchoolId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [createdDeviceResult, setCreatedDeviceResult] = useState<{
    device_id: string;
    verify_code: string;
    device_token: string;
  } | null>(null);

  // Tìm kiếm
  const [searchTerm, setSearchTerm] = useState('');
  const [qrModalDevice, setQrModalDevice] = useState<MasterDevice | null>(null);

  // Khôi phục phiên từ sessionStorage
  useEffect(() => {
    const savedKey = sessionStorage.getItem('master_admin_key');
    if (savedKey) {
      // The server is the only place that checks the key.
      setAdminKey(savedKey);
      loadMasterData(savedKey).then((ok) => {
        if (ok) setIsAuthenticated(true);
        else sessionStorage.removeItem('master_admin_key');
      });
    }
  }, []);

  const loadMasterData = async (key: string): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await fetch('/api/master-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GET_DATA', master_key: key }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || 'Không thể tải dữ liệu master admin.');
      }
      setDevices(data.data.devices || []);
      setUsers(data.data.users || []);
      setSchools(data.data.schools || []);
      if (data.data.schools?.length > 0 && !targetSchoolId) {
        setTargetSchoolId(data.data.schools[0].id);
      }
    } catch (err: any) {
      console.error('Lỗi master admin:', err);
      setLoginError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    sessionStorage.setItem('master_admin_key', adminKey);
    const ok = await loadMasterData(adminKey);
    if (!ok) {
      sessionStorage.removeItem('master_admin_key');
      return;
    }
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('master_admin_key');
    setIsAuthenticated(false);
    setAdminKey('');
  };

  // Nút sinh mã ngẫu nhiên từ 1 đến 1 tỷ
  const handleGenerateRandomCode = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/master-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GENERATE_RANDOM_CODE', master_key: adminKey }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedCode(data.generated_code);
        setCustomDeviceId(data.suggested_device_id);
        setCustomDeviceName(`Thiết bị ${data.suggested_device_id}`);
      }
    } catch (err) {
      console.error('Lỗi sinh mã:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Nút tạo thiết bị xuất xưởng
  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDeviceId || !generatedCode) return;
    setLoading(true);
    try {
      const res = await fetch('/api/master-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_DEVICE',
          master_key: adminKey,
          device_id: customDeviceId,
          verify_code: generatedCode,
          school_id: targetSchoolId,
          device_name: customDeviceName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || 'Lỗi tạo thiết bị');
      }
      setCreatedDeviceResult(data.device);
      await loadMasterData(adminKey);
    } catch (err: any) {
      alert(err.message || 'Lỗi tạo thiết bị.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (id: string, devId: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn thiết bị ${devId} khỏi hệ thống?`)) return;
    try {
      const res = await fetch('/api/master-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_DEVICE', master_key: adminKey, id }),
      });
      const data = await res.json();
      if (data.success) {
        await loadMasterData(adminKey);
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi xóa thiết bị');
    }
  };

  // Lọc thiết bị tìm kiếm
  const filteredDevices = devices.filter((d) => {
    const s = searchTerm.toLowerCase();
    return (
      d.device_id.toLowerCase().includes(s) ||
      (d.verify_code && d.verify_code.includes(s)) ||
      (d.student_name && d.student_name.toLowerCase().includes(s)) ||
      (d.class_name && d.class_name.toLowerCase().includes(s)) ||
      (d.school_name && d.school_name.toLowerCase().includes(s))
    );
  });

  // Màn hình đăng nhập Admin Key
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">CỔNG QUẢN TRỊ TỔNG HỆ THỐNG</h1>
            <p className="text-xs text-slate-400 mt-1">Master Factory & Registry Portal (Nhập mã quản trị)</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs font-medium">
                {loginError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Mật Mã Quản Trị Cấp Cao
              </label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Nhập mã quản trị..."
                required
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              ĐĂNG NHẬP MASTER ADMIN
            </button>
          </form>
          <div className="mt-6 text-center">
            <a href="/" className="text-xs text-slate-500 hover:text-slate-300 transition">
              ← Quay về trang chủ
            </a>
          </div>
        </div>
      </main>
    );
  }

  // Màn hình Quản trị Cấp Cao
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-2xl flex items-center justify-center font-black">
              M
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                MASTER ADMIN REGISTRY
                <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Super Admin
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Theo dõi toàn bộ Tài khoản · Token · ID Xe · Dải mã xác thực (1 - 1 Tỷ)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadMasterData(adminKey)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition cursor-pointer"
            >
              🔄 Làm Mới
            </button>
            <button
              onClick={handleLogout}
              className="px-3.5 py-2 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Đăng Xuất
            </button>
          </div>
        </header>

        {/* Thống kê nhanh */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase">Tổng Số Thiết Bị</p>
            <p className="text-2xl sm:text-3xl font-black text-amber-400 mt-1">{devices.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase">Đã Kích Hoạt / Nối Xe</p>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">
              {devices.filter((d) => d.student_name).length}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase">Chờ Kích Hoạt / Xuất Xưởng</p>
            <p className="text-2xl sm:text-3xl font-black text-blue-400 mt-1">
              {devices.filter((d) => !d.student_name).length}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase">Tài Khoản Quản Trị / Trường</p>
            <p className="text-2xl sm:text-3xl font-black text-purple-400 mt-1">{users.length}</p>
          </div>
        </section>

        {/* Thanh chuyển Tab */}
        <div className="flex border-b border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTab === 'devices'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 Quản Lý Thiết Bị & Mã Xác Thực ({devices.length})
          </button>
          <button
            onClick={() => setActiveTab('generator')}
            className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTab === 'generator'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🎲 Sinh Mã Ngẫu Nhiên & Xuất Xưởng
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTab === 'users'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            👥 Tài Khoản & Trường Học ({users.length})
          </button>
        </div>

        {/* TAB 1: DANH SÁCH THIẾT BỊ & MÃ XÁC THỰC */}
        {activeTab === 'devices' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-200">Bảng Tra Cứu Toàn Bộ Thiết Bị Trong Hệ Thống</h2>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 Tìm theo ID xe, mã xác thực (1-1 tỷ), học sinh..."
                className="w-full sm:w-80 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-3">Mã ID Xe</th>
                    <th className="py-3 px-3">Mã Xác Thực (1 - 1 Tỷ)</th>
                    <th className="py-3 px-3">Học Sinh Sở Hữu</th>
                    <th className="py-3 px-3">Trường Học</th>
                    <th className="py-3 px-3">Trạng Thái</th>
                    <th className="py-3 px-3">Token Hash</th>
                    <th className="py-3 px-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredDevices.length > 0 ? (
                    filteredDevices.map((dev) => (
                      <tr key={dev.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3 font-mono font-bold text-amber-400">{dev.device_id}</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 font-mono font-bold text-indigo-300">
                            {dev.verify_code || 'Chưa gán'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {dev.student_name ? (
                            <div>
                              <p className="font-semibold text-white">{dev.student_name}</p>
                              <p className="text-[11px] text-slate-400">Lớp {dev.class_name}</p>
                            </div>
                          ) : (
                            <span className="text-amber-500/80 font-medium italic">Chờ kích hoạt QR</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-300">{dev.school_name || 'Mặc định'}</td>
                        <td className="py-3 px-3">
                          {dev.student_name ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Đã nối xe
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Xuất xưởng
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[10px] text-slate-500">
                          {dev.device_token_hash ? dev.device_token_hash.slice(0, 12) + '...' : '-'}
                        </td>
                        <td className="py-3 px-3 text-right space-x-1.5">
                          <button
                            onClick={() => setQrModalDevice(dev)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition cursor-pointer"
                          >
                            Mã QR
                          </button>
                          <button
                            onClick={() => handleDeleteDevice(dev.id, dev.device_id)}
                            className="px-2.5 py-1 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 font-medium transition cursor-pointer"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Không tìm thấy thiết bị nào khớp với tìm kiếm.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SINH MÃ NGẪU NHIÊN & TẠO THIẾT BỊ XUẤT XƯỞNG */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form tạo thiết bị xuất xưởng */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  🎲 CÔNG CỤ XUẤT XƯỞNG THIẾT BỊ RỜI
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Sinh mã xác thực ngẫu nhiên từ 1 đến 1.000.000.000 và gán cho ID xe trước khi đóng hộp bàn giao.
                </p>
              </div>

              <div className="p-4 bg-slate-800/60 border border-slate-700/80 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Mã Xác Thực Ngẫu Nhiên (1 - 1 Tỷ)</p>
                  <p className="text-2xl font-mono font-black text-amber-400 tracking-wider mt-0.5">
                    {generatedCode || '----------'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateRandomCode}
                  disabled={generating}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  {generating ? 'Đang tạo...' : '🎲 Sinh Mã Ngẫu Nhiên'}
                </button>
              </div>

              <form onSubmit={handleCreateDevice} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Mã Thiết Bị (Device ID)
                  </label>
                  <input
                    type="text"
                    value={customDeviceId}
                    onChange={(e) => setCustomDeviceId(e.target.value.toUpperCase())}
                    placeholder="VD: XE01 hoặc XE_NAM_9A"
                    required
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Mã Xác Thực Gán Vào Thiết Bị (1 - 1.000.000.000)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={generatedCode}
                    onChange={(e) => setGeneratedCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                    placeholder="Bấm nút 'Sinh Mã Ngẫu Nhiên' ở trên hoặc gõ tay..."
                    required
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-amber-400 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Trường Học Liên Kết (Mặc định)
                  </label>
                  <select
                    value={targetSchoolId}
                    onChange={(e) => setTargetSchoolId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading || !customDeviceId || !generatedCode}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
                >
                  XÁC NHẬN TẠO THIẾT BỊ XUẤT XƯỞNG
                </button>
              </form>
            </div>

            {/* Kết quả tạo thiết bị & Code .ino + QR */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">📦 THÔNG TIN XUẤT XƯỞNG & CODE NẠP .INO</h2>
              {createdDeviceResult ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-950/40 border border-emerald-800 rounded-2xl text-emerald-300 text-xs">
                    ✅ Đã tạo thiết bị <strong>{createdDeviceResult.device_id}</strong> thành công trong hệ thống!
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      1. Copy đoạn cấu hình này dán vào file <code>TDM2421_FINAL.ino</code>:
                    </p>
                    <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-amber-300 overflow-x-auto">
{`#define DEVICE_ID "${createdDeviceResult.device_id}"
#define VERIFY_SECRET "${createdDeviceResult.verify_code}"`}
                    </pre>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      2. Mã QR in dán lên vỏ hộp để học sinh quét kích hoạt:
                    </p>
                    <div className="p-4 bg-white rounded-2xl inline-block">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                          typeof window !== 'undefined'
                            ? `${window.location.origin}/activate?device_id=${createdDeviceResult.device_id}&verify_code=${createdDeviceResult.verify_code}`
                            : `/activate?device_id=${createdDeviceResult.device_id}&verify_code=${createdDeviceResult.verify_code}`
                        )}`}
                        alt="QR Code"
                        className="w-36 h-36"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Chưa có thiết bị nào vừa được tạo. Hãy bấm <strong>Sinh Mã Ngẫu Nhiên</strong> và nhấn <strong>Xác nhận</strong> để nhận code .ino và tem mã QR!
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: DANH SÁCH TÀI KHOẢN & TRƯỜNG HỌC */}
        {activeTab === 'users' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-200">Danh Sách Tài Khoản Trong Hệ Thống ({users.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-3">Tên Đăng Nhập</th>
                    <th className="py-3 px-3">Email</th>
                    <th className="py-3 px-3">Vai Trò</th>
                    <th className="py-3 px-3">Trường Học</th>
                    <th className="py-3 px-3">Ngày Tạo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-bold text-amber-400">{u.username || '(Chưa đặt)'}</td>
                      <td className="py-3 px-3 text-slate-300">{u.email}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 font-semibold uppercase text-[10px]">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{u.school_name || 'Mặc định'}</td>
                      <td className="py-3 px-3 text-slate-500 text-[11px]">{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Xem Mã QR của thiết bị */}
        {qrModalDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 text-center shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-1">Mã QR Thiết Bị: {qrModalDevice.device_id}</h3>
              <p className="text-xs text-slate-400 mb-4">
                Mã xác thực: <span className="font-mono text-amber-400 font-bold">{qrModalDevice.verify_code || 'Chưa gán'}</span>
              </p>
              <div className="p-4 bg-white rounded-2xl inline-block mx-auto mb-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                    typeof window !== 'undefined'
                      ? `${window.location.origin}/activate?device_id=${qrModalDevice.device_id}${
                          (qrModalDevice.verify_code ? `&verify_code=${qrModalDevice.verify_code}` : '') +
                          (qrModalDevice.account_token ? `&account_token=${qrModalDevice.account_token}` : '')
                        }`
                      : `/activate?device_id=${encodeURIComponent(qrModalDevice.device_id)}${qrModalDevice.verify_code ? `&verify_code=${encodeURIComponent(qrModalDevice.verify_code)}` : ''}`
                  )}`}
                  alt="QR Code"
                  className="w-44 h-44"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/activate?device_id=${qrModalDevice.device_id}${
                      (qrModalDevice.verify_code ? `&verify_code=${qrModalDevice.verify_code}` : '') +
                      (qrModalDevice.account_token ? `&account_token=${qrModalDevice.account_token}` : '')
                    }`;
                    navigator.clipboard.writeText(url);
                    alert('Đã sao chép link kích hoạt!');
                  }}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Sao chép Link
                </button>
                <button
                  onClick={() => setQrModalDevice(null)}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
