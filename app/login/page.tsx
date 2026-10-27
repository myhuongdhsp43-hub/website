export const dynamic = 'force-dynamic';

type LoginPageProps = { searchParams: Promise<{ error?: string; logged_out?: string; registered?: string; return_to?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.return_to);
  const error = params.error?.slice(0, 240);
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10"><section className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-sm">
    <a href="/" className="text-sm font-semibold text-emerald-700 hover:underline">← Trang chủ</a>
    <h1 className="mt-5 text-2xl font-bold">Đăng nhập quản trị</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">Mỗi đơn vị chỉ xem được dữ liệu thuộc tài khoản của mình.</p>
    <form action="/register" method="get" className="mt-4"><button type="submit" className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-emerald-600 px-4 py-3 text-center text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Chưa có tài khoản? Đăng ký</button></form>
    <p className="mt-2 text-center text-xs text-slate-500">Nếu nút không chuyển trang, mở trực tiếp <a href="/register" className="font-semibold text-emerald-700 underline">/register</a>.</p>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {params.logged_out === '1' ? <output className="mt-4 block rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Bạn đã đăng xuất.</output> : null}
    {params.registered === '1' ? <output className="mt-4 block rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Tài khoản đã được tạo. Hãy đăng nhập bằng thông tin vừa đăng ký.</output> : null}
    <form action="/api/auth/login" method="post" className="mt-6 space-y-4"><input type="hidden" name="return_to" value={returnTo} />
      <label className="grid gap-1 text-sm font-semibold">Tên đăng nhập<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.-]+" className="form-input" placeholder="Tên đăng nhập" /></label>
      <label className="grid gap-1 text-sm font-semibold">Mật khẩu<input name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={200} className="form-input" placeholder="Nhập mật khẩu" /></label>
      <button className="button-primary w-full" type="submit">Đăng nhập</button>
    </form>
  </section></main>;
}

function safeReturnTo(value?: string) { if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/admin'; try { const url = new URL(value, 'https://local.invalid'); return url.origin === 'https://local.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/admin'; } catch { return '/admin'; } }
