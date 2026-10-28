'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { School, User, ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error')?.slice(0, 300);
  const returnTo = searchParams.get('return_to') || '/admin';

  const [accountType, setAccountType] = useState<'school' | 'personal'>('school');

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border bg-white p-7 shadow-xl">
        <a href={`/login?return_to=${encodeURIComponent(returnTo)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Đăng nhập
        </a>

        <div className="mt-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Đăng ký tài khoản</h1>
            <p className="text-xs text-slate-500">Hệ thống giám sát an toàn giao thông xe điện học sinh</p>
          </div>
        </div>

        {errorParam ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorParam}
          </p>
        ) : null}

        {/* Chuyển đổi loại tài khoản: Giáo viên / Trường học vs Cá nhân (Personal) */}
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 border">
          <button
            type="button"
            onClick={() => setAccountType('school')}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
              accountType === 'school'
                ? 'bg-white text-emerald-800 shadow-sm border'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <School className="h-4 w-4" />
            Giáo viên / Trường
          </button>
          <button
            type="button"
            onClick={() => setAccountType('personal')}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
              accountType === 'personal'
                ? 'bg-white text-emerald-800 shadow-sm border'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="h-4 w-4" />
            Cá nhân (Personal)
          </button>
        </div>

        {/* Thông tin giải thích quyền lợi loại tài khoản */}
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-900">
          {accountType === 'school' ? (
            <p className="leading-relaxed">
              <strong>Tài khoản Giáo viên / Nhà trường:</strong> Quản lý toàn bộ xe trong trường, phân quyền lớp học, và <strong>tạo nhiều tài khoản con cho học sinh</strong> với link đăng nhập riêng biệt.
            </p>
          ) : (
            <p className="leading-relaxed">
              <strong>Tài khoản Cá nhân (Personal):</strong> Dành cho phụ huynh hoặc cá nhân theo dõi riêng phương tiện của con em hoặc bản thân. Vùng dữ liệu độc lập, thao tác nhanh gọn.
            </p>
          )}
        </div>

        <form action="/api/auth/register" method="post" className="mt-5 space-y-4">
          <input type="hidden" name="account_type" value={accountType} />
          <input type="hidden" name="return_to" value={returnTo} />

          {accountType === 'school' ? (
            <label className="grid gap-1 text-sm font-semibold text-slate-800">
              Tên trường hoặc đơn vị quản lý
              <input
                name="school_name"
                autoComplete="organization"
                required
                minLength={2}
                maxLength={160}
                className="form-input"
                placeholder="Ví dụ: Trường THCS Nguyễn Tri Phương"
              />
            </label>
          ) : null}

          <label className="grid gap-1 text-sm font-semibold text-slate-800">
            {accountType === 'school' ? 'Họ và tên giáo viên phụ trách' : 'Họ và tên cá nhân / phụ huynh'}
            <input
              name="full_name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={160}
              className="form-input"
              placeholder={accountType === 'school' ? 'Thầy Nguyễn Văn A' : 'Nguyễn Văn B (Phụ huynh)'}
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-800">
            Tên đăng nhập
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={3}
              maxLength={64}
              pattern="[A-Za-z0-9_.-]+"
              className="form-input"
              placeholder="3–64 ký tự: chữ không dấu, số, . _ -"
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-800">
            Email liên hệ
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={160}
              className="form-input"
              placeholder="email@example.com"
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-800">
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={200}
              className="form-input"
              placeholder="Tối thiểu 8 ký tự"
            />
          </label>

          <button className="button-primary w-full py-3 text-base font-bold shadow-md" type="submit">
            {accountType === 'school' ? 'Đăng ký tài khoản Giáo viên / Trường' : 'Đăng ký tài khoản Cá nhân (Personal)'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Đã có tài khoản?{' '}
          <a href={`/login?return_to=${encodeURIComponent(returnTo)}`} className="font-semibold text-emerald-700 underline">
            Đăng nhập ngay
          </a>
        </p>
      </section>
    </main>
  );
}
