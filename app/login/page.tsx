import { env } from 'cloudflare:workers';
import { safeReturnTo } from '@/lib/server/http';
import { School, User, GraduationCap, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    logged_out?: string;
    registered?: string;
    return_to?: string;
    school_id?: string;
    role?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.return_to);
  const error = params.error?.slice(0, 300);
  const schoolId = params.school_id?.trim();
  const isStudentDefault = params.role === 'student' || Boolean(schoolId);

  let schoolInfo: { id: string; name: string } | null = null;
  if (schoolId) {
    try {
      schoolInfo = await env.DB.prepare('SELECT id, name FROM schools WHERE id = ?').bind(schoolId).first();
    } catch {}
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border bg-white p-7 shadow-xl">
        <a href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
          ← Trang chủ
        </a>

        <div className="mt-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Đăng nhập</h1>
            <p className="text-xs text-slate-500">
              {schoolInfo ? `Cổng đăng nhập trường: ${schoolInfo.name}` : 'Hệ thống an toàn xe điện học sinh'}
            </p>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {params.logged_out === '1' ? (
          <output className="mt-4 block rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Bạn đã đăng xuất thành công.
          </output>
        ) : null}

        {params.registered === '1' ? (
          <output className="mt-4 block rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Tài khoản đã được tạo. Hãy đăng nhập bằng tên đăng nhập và mật khẩu vừa đăng ký.
          </output>
        ) : null}

        {/* Tab chuyển đổi mục đích đăng nhập */}
        <div className="mt-5 rounded-2xl bg-slate-100 p-1.5 border flex text-xs sm:text-sm font-bold">
          <a
            href={`/login?role=admin${returnTo !== '/admin' ? `&return_to=${encodeURIComponent(returnTo)}` : ''}`}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all ${
              !isStudentDefault ? 'bg-white text-emerald-800 shadow-sm border' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <School className="h-4 w-4" />
            Giáo viên / Cá nhân
          </a>
          <a
            href={`/login?role=student${schoolId ? `&school_id=${encodeURIComponent(schoolId)}` : ''}${
              returnTo !== '/admin' ? `&return_to=${encodeURIComponent(returnTo)}` : ''
            }`}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all ${
              isStudentDefault ? 'bg-white text-emerald-800 shadow-sm border' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="h-4 w-4" />
            Học sinh con
          </a>
        </div>

        {schoolInfo ? (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900">
            <p>
              🏫 <strong>Trường liên kết:</strong> {schoolInfo.name}
            </p>
            <p className="mt-1 text-blue-700">
              Đăng nhập bằng <strong>Username</strong> và <strong>Mật khẩu</strong> do giáo viên cấp.
            </p>
          </div>
        ) : isStudentDefault ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Học sinh đăng nhập bằng <strong>Username</strong> và <strong>Mật khẩu con</strong> do giáo viên quản lý trường cấp.
          </div>
        ) : null}

        <form action="/api/auth/login" method="post" className="mt-5 space-y-4">
          <input type="hidden" name="return_to" value={returnTo} />
          {schoolId ? <input type="hidden" name="school_id" value={schoolId} /> : null}

          <label className="grid gap-1 text-sm font-semibold text-slate-800">
            {isStudentDefault ? 'Tên đăng nhập học sinh con (Username)' : 'Tên đăng nhập hoặc Email'}
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
              placeholder={isStudentDefault ? 'Ví dụ: hocsinh1' : 'Tên đăng nhập hoặc email'}
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-800">
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              maxLength={200}
              className="form-input"
              placeholder="Nhập mật khẩu"
            />
          </label>

          <button className="button-primary w-full py-3 text-base font-bold shadow-md" type="submit">
            {isStudentDefault ? 'Đăng nhập Học sinh' : 'Đăng nhập Quản lý'}
          </button>
        </form>

        <form action="/register" method="get" className="mt-6 border-t pt-4 text-center">
          <input type="hidden" name="return_to" value={returnTo} />
          <p className="text-xs text-slate-500">Chưa có tài khoản Giáo viên hoặc Cá nhân?</p>
          <button
            type="submit"
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            Chưa có tài khoản? Đăng ký (Giáo viên / Cá nhân)
          </button>
        </form>
      </section>
    </main>
  );
}
