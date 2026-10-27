export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams).error?.slice(0, 300);
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10"><section className="w-full max-w-lg rounded-2xl border bg-white p-7 shadow-sm">
    <a href="/login" className="text-sm font-semibold text-emerald-700 hover:underline">← Đăng nhập</a>
    <h1 className="mt-5 text-2xl font-bold">Tạo tài khoản quản lý</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">Mỗi tài khoản có vùng dữ liệu riêng; học sinh, thiết bị, vị trí và cảnh báo không lẫn sang tài khoản khác.</p>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <form action="/api/auth/register" method="post" className="mt-6 space-y-4">
      <label className="grid gap-1 text-sm font-semibold">Tên đơn vị quản lý<input name="school_name" autoComplete="organization" required minLength={2} maxLength={160} className="form-input" placeholder="Ví dụ: Trường THCS ..." /></label>
      <label className="grid gap-1 text-sm font-semibold">Tên đăng nhập<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.-]+" className="form-input" placeholder="3–64 ký tự: chữ không dấu, số, . _ -" /></label>
      <label className="grid gap-1 text-sm font-semibold">Email liên hệ<input name="email" type="email" autoComplete="email" required maxLength={160} className="form-input" placeholder="ban@example.com" /></label>
      <label className="grid gap-1 text-sm font-semibold">Mật khẩu<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} className="form-input" placeholder="Tối thiểu 8 ký tự" /></label>
      <button className="button-primary w-full" type="submit">Tạo tài khoản</button>
    </form>
  </section></main>;
}
