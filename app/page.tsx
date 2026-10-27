export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-700 font-bold text-white">AT</span>
          <div>
            <p className="font-bold">An toàn xe điện học sinh</p>
            <p className="text-xs text-slate-500">Hỗ trợ giáo dục và an toàn giao thông</p>
          </div>
        </div>
        <nav aria-label="Tài khoản" className="flex flex-wrap gap-2">
          <a href="/login" className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Đăng nhập quản trị</a>
          <a href="/register" className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Tạo tài khoản</a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.2fr_0.8fr] md:items-center">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Nhà trường · Phụ huynh · Học sinh</p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">Xây dựng thói quen tham gia giao thông an toàn.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Hệ thống cảnh báo sớm tốc độ xe máy điện, giúp nhà trường phối hợp cùng gia đình nhắc nhở học sinh đúng lúc và tôn trọng quyền riêng tư.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/register" className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Tạo tài khoản quản trị</a>
            <a href="/register" className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-emerald-700 bg-white px-5 py-3 font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Tạo tài khoản mới</a>
            <a href="#nguyen-tac" className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold hover:bg-slate-100">Nguyên tắc hoạt động</a>
          </div>
        </div>

        <aside className="rounded-3xl border border-emerald-100 bg-white p-7 shadow-sm">
          <h2 className="text-xl font-bold">Thông tin được bảo vệ</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div><dt className="font-semibold">Chỉ quản trị viên được cấp quyền</dt><dd className="mt-1 text-slate-600">xem vị trí, lịch sử, liên hệ phụ huynh và cấu hình thiết bị.</dd></div>
            <div><dt className="font-semibold">Thiết bị vẫn cảnh báo khi mất mạng</dt><dd className="mt-1 text-slate-600">giới hạn tốc độ gần nhất được lưu trực tiếp trên xe.</dd></div>
            <div><dt className="font-semibold">Mục đích giáo dục</dt><dd className="mt-1 text-slate-600">dữ liệu hỗ trợ nhắc nhở và phòng ngừa, không dùng để bêu tên hay trừng phạt.</dd></div>
          </dl>
        </aside>
      </section>

      <section id="nguyen-tac" className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="text-2xl font-bold">Nguyên tắc bảo vệ học sinh</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl bg-slate-50 p-5"><h3 className="font-bold">Không công khai vị trí</h3><p className="mt-2 text-sm leading-6 text-slate-600">Bản đồ và dữ liệu cá nhân chỉ có trong khu vực quản trị đã đăng nhập.</p></article>
            <article className="rounded-2xl bg-slate-50 p-5"><h3 className="font-bold">Cảnh báo vừa đủ</h3><p className="mt-2 text-sm leading-6 text-slate-600">Một lần vượt tốc kéo dài chỉ tạo một sự kiện và một lần nhắn tin phù hợp.</p></article>
            <article className="rounded-2xl bg-slate-50 p-5"><h3 className="font-bold">Không can thiệp vận hành xe</h3><p className="mt-2 text-sm leading-6 text-slate-600">Thiết bị chỉ cảnh báo bằng còi, không khóa xe, không cắt động cơ.</p></article>
          </div>
        </div>
      </section>
    </main>
  );
}
