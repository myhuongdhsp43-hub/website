'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Bike,
  Check,
  ChevronRight,
  CircleGauge,
  Copy,
  History,
  KeyRound,
  Link2,
  LoaderCircle,
  LogOut,
  MapPinned,
  Plus,
  QrCode,
  RadioTower,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { DeviceMap, type DeviceMarker, type TrailPoint } from './device-map';
import { HelmetSmsPanel } from './helmet-sms-panel';

type View = 'overview' | 'map' | 'students' | 'devices' | 'subaccounts' | 'alerts' | 'history' | 'statistics' | 'settings' | 'account';
type DashboardDevice = { helmet_worn: number | null; helmet_detection_enabled: number; id: string; device_id: string; current_speed: number | null; speed_limit: number; gps_valid: number; last_seen: string | null; network_signal: number | null; full_name: string | null; student_code: string | null; class_name: string | null; online: number; overspeed: number };
type DashboardData = { user: { displayName: string; email: string; role: string; schoolName: string; schoolId?: string; accountToken?: string | null }; stats: Record<'students' | 'devices' | 'online' | 'offline' | 'moving' | 'todayOverspeed' | 'weekOverspeed' | 'openAlerts', number>; devices: DashboardDevice[] };
type Student = { id: string; student_code: string; full_name: string; class_name: string; grade: string | null; academic_year?: string | null; vehicle_plate?: string | null; notes?: string | null; active: number; device_id: string | null };
type Device = { id: string; device_id: string; device_name: string; verify_code?: string | null; device_token?: string | null; student_id: string | null; enabled: number; last_seen: string | null; current_speed: number | null; speed_limit: number; speed_alert_enabled: number; buzzer_enabled: number; remote_alarm: number; version: number; full_name: string | null; student_code: string | null };
type SubAccount = { id: string; school_id: string; student_id: string | null; username: string; full_name: string; class_name: string; active: number; created_at: string; student_code: string | null; device_id: string | null; device_name: string | null };
type Alert = { type: string; helmet_sms_total: number; helmet_sms_accepted: number; id: string; title: string; message: string; status: string; created_at: string; full_name: string | null; class_name: string | null; device_id: string | null; max_speed: number | null; speed_limit: number | null; sms_sent: number | null };
type Contact = { id: string; name: string; relationship: string; phone: string; sms_enabled: number };
type StudentDetail = { student: Student & { device_name: string | null; current_speed: number | null; last_latitude: number | null; last_longitude: number | null; gps_valid: number; satellites: number | null; hdop: number | null; last_seen: string | null; network_signal: number | null; enabled: number | null; speed_limit: number | null; speed_alert_enabled: number | null; buzzer_enabled: number | null }; contacts: Contact[]; stats: { max_today: number; max_week: number; count_today: number; count_week: number; count_month: number }; events: Array<{ id: string; started_at: string; ended_at: string | null; max_speed: number; speed_limit: number; latitude: number | null; longitude: number | null; gps_valid: number; sms_sent: number; device_id: string }> };
type SettingsData = { sms_enabled: number; send_location: number; sms_cooldown_minutes: number; sms_template: string; telemetry_retention_days: number; helmet_detection_enabled: number; helmet_grace_seconds: number; helmet_min_speed_kmh: number };
type HistoryRow = { recorded_at?: string; started_at?: string; ended_at?: string | null; speed?: number; max_speed?: number; speed_limit?: number; latitude: number | null; longitude: number | null; gps_valid: number; satellites?: number | null; hdop?: number | null; network_signal?: number | null; overspeed_active?: number; sms_sent?: number; device_id: string; full_name: string | null; student_code: string | null; class_name: string | null };
type StatisticsData = { daily: Array<{ day: string; count: number }>; students: Array<{ id: string; full_name: string; student_code: string; class_name: string; count: number; max_speed: number }>; maxSpeed: number; devices: { total: number; online: number } };

const navigation: { view: View; label: string; icon: typeof CircleGauge }[] = [
  { view: 'overview', label: 'Tổng quan', icon: CircleGauge },
  { view: 'map', label: 'Bản đồ', icon: MapPinned },
  { view: 'students', label: 'Học sinh', icon: Users },
  { view: 'devices', label: 'Thiết bị', icon: Bike },
  { view: 'subaccounts', label: 'Tài khoản con', icon: KeyRound },
  { view: 'alerts', label: 'Cảnh báo', icon: Bell },
  { view: 'history', label: 'Lịch sử', icon: History },
  { view: 'statistics', label: 'Thống kê', icon: BarChart3 },
  { view: 'settings', label: 'Cài đặt', icon: Settings },
  { view: 'account', label: 'Tài khoản', icon: UserRound },
];

export function DashboardApp() {
  const [view, setView] = useState<View>('overview');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshDashboard = useCallback(async () => {
    try {
      setDashboard(await api<DashboardData>('/api/dashboard'));
      setMessage(null);
    } catch (error) {
      setMessage({ text: getError(error), kind: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshDashboard(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refreshDashboard]);

  useEffect(() => {
    if (view !== 'overview') return;
    const timer = window.setInterval(() => void refreshDashboard(), 5_000);
    return () => window.clearInterval(timer);
  }, [view, refreshDashboard]);

  const userRole = dashboard?.user.role;
  const filteredNav = navigation.filter((item) => {
    if (userRole === 'student') {
      return ['overview', 'map', 'history', 'account'].includes(item.view);
    }
    return true;
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <Brand />
        <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Điều hướng chính">
          {filteredNav.map(({ view: itemView, label, icon: Icon }) => (
            <button
              key={itemView}
              onClick={() => setView(itemView)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                view === itemView
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
              {itemView === 'alerts' && dashboard?.stats.openAlerts ? (
                <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
                  {dashboard.stats.openAlerts}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <EducationNote />
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:px-8">
          <div>
            <p className="max-w-[60vw] truncate text-xs font-semibold uppercase tracking-[.16em] text-primary">
              {dashboard?.user.schoolName ?? 'Nhà trường'}
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {navigation.find((item) => item.view === view)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:flex">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />
              {userRole === 'student' ? 'Học sinh' : 'Quản lý'}
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initials(dashboard?.user.displayName)}
            </span>
          </div>
        </header>
        <div className="p-4 pb-28 md:p-8 lg:pb-8">
          {message ? <Notice text={message.text} kind={message.kind} onClose={() => setMessage(null)} /> : null}
          {loading ? (
            <LoadingScreen />
          ) : view === 'overview' ? (
            <Overview data={dashboard} onViewAlerts={() => setView('alerts')} />
          ) : null}
          {view === 'map' ? <MapView /> : null}
          {view === 'students' ? <StudentsView onMessage={setMessage} /> : null}
          {view === 'devices' ? <DevicesView onMessage={setMessage} /> : null}
          {view === 'subaccounts' ? (
            <SubaccountsView
              onMessage={setMessage}
              schoolId={dashboard?.user.schoolId ?? ''}
              schoolName={dashboard?.user.schoolName ?? 'Trường'}
            />
          ) : null}
          {view === 'alerts' ? <AlertsView onMessage={setMessage} onRefresh={refreshDashboard} /> : null}
          {view === 'history' ? <HistoryView onMessage={setMessage} /> : null}
          {view === 'statistics' ? <StatisticsView onMessage={setMessage} /> : null}
          {view === 'settings' ? <SettingsView onMessage={setMessage} /> : null}
          {view === 'account' ? <AccountView user={dashboard?.user ?? null} onSaved={refreshDashboard} /> : null}
        </div>
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t bg-background/95 px-2 py-2 backdrop-blur lg:hidden"
          aria-label="Điều hướng điện thoại"
        >
          {filteredNav.map(({ view: itemView, label, icon: Icon }) => (
            <button
              key={itemView}
              onClick={() => setView(itemView)}
              className={`flex min-w-20 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
                view === itemView ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <ShieldCheck className="h-6 w-6" />
      </span>
      <div>
        <p className="font-bold tracking-tight">An Toàn Xe Điện</p>
        <p className="text-xs text-muted-foreground">Giám sát học sinh</p>
      </div>
    </div>
  );
}

function EducationNote() {
  return (
    <div className="m-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4" /> Mục tiêu giáo dục
      </p>
      <p className="mt-2 text-xs leading-relaxed text-emerald-800">
        Cảnh báo sớm để xây dựng thói quen tham gia giao thông an toàn.
      </p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-80 place-items-center">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="h-5 w-5 animate-spin" /> Đang tải dữ liệu được phép truy cập…
      </p>
    </div>
  );
}

function Notice({ text, kind, onClose }: { text: string; kind: 'success' | 'error'; onClose: () => void }) {
  return (
    <output
      className={`mb-5 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
        kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
      }`}
    >
      <span>{text}</span>
      <button onClick={onClose} aria-label="Đóng thông báo">
        <X className="h-4 w-4" />
      </button>
    </output>
  );
}

function Overview({ data, onViewAlerts }: { data: DashboardData | null; onViewAlerts: () => void }) {
  const stats = data?.stats;
  const cards = [
    ['Học sinh', stats?.students, Users, 'blue'],
    ['Thiết bị online', stats?.online, RadioTower, 'green'],
    ['Thiết bị offline', stats?.offline, WifiOff, 'slate'],
    ['Vượt tốc hôm nay', stats?.todayOverspeed, TriangleAlert, 'red'],
  ] as const;

  return (
    <div className="space-y-7">
      <section className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 px-5 py-4 text-blue-950">
        <p className="flex items-start gap-3 text-sm leading-relaxed">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <strong>Hệ thống hỗ trợ giáo dục và an toàn giao thông.</strong> Dữ liệu chỉ phục vụ cảnh báo sớm, không dùng để
            trừng phạt hay giám sát bí mật.
          </span>
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon, tone]) => (
          <StatCard key={label} label={label} value={value ?? 0} icon={Icon} tone={tone} />
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.7fr)]">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-bold">Trạng thái xe gần nhất</h2>
              <p className="mt-1 text-sm text-muted-foreground">Làm mới mỗi 5 giây khi bạn ở trang Tổng quan</p>
            </div>
            <span className="text-xs text-muted-foreground">{data?.stats.devices ?? 0} thiết bị</span>
          </div>
          <DeviceTable rows={data?.devices ?? []} />
        </div>
        <div className="rounded-2xl border border-red-100 bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-bold">
                <TriangleAlert className="h-5 w-5 text-red-600" /> Cảnh báo cần xử lý
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Sự kiện vượt tốc cần được xem xét và nhắc nhở phù hợp.</p>
            </div>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-sm font-bold text-red-700">
              {stats?.openAlerts ?? 0}
            </span>
          </div>
          <div className="mt-6 rounded-xl bg-muted/60 p-4">
            <p className="text-3xl font-bold">{stats?.weekOverspeed ?? 0}</p>
            <p className="mt-1 text-sm text-muted-foreground">sự kiện vượt tốc trong 7 ngày gần đây</p>
          </div>
          <button
            onClick={onViewAlerts}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
          >
            Mở trung tâm cảnh báo <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Users; tone: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-emerald-100 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <span className={`grid h-12 w-12 place-items-center rounded-xl ${colors[tone]}`}>
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function DeviceTable({ rows }: { rows: DashboardDevice[] }) {
  if (!rows.length) return <Empty title="Chưa có thiết bị" detail="Thêm thiết bị, tạo token provisioning và gán cho học sinh ở mục Thiết bị." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-3">Học sinh</th>
            <th className="px-4 py-3">Thiết bị</th>
            <th className="px-4 py-3">Tốc độ</th>
            <th className="px-4 py-3">GPS / 4G</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-5 py-3 text-right">Cập nhật</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/30">
              <td className="px-5 py-4">
                <p className="font-semibold">{row.full_name ?? 'Chưa gán học sinh'}</p>
                <p className="text-xs text-muted-foreground">{row.student_code ?? '—'} · {row.class_name ?? '—'}</p>
              </td>
              <td className="px-4 py-4 font-medium">{row.device_id}</td>
              <td className={`px-4 py-4 text-base font-bold ${row.overspeed ? 'text-red-600' : ''}`}>
                {formatSpeed(row.current_speed)}
                <p className="text-xs font-normal text-muted-foreground">Giới hạn {row.speed_limit} km/h</p>
              </td>
              <td className="px-4 py-4">
                <p className={row.gps_valid ? 'text-emerald-700' : 'text-amber-700'}>
                  {row.gps_valid ? 'GPS tốt' : 'Mất GPS'}
                </p>
                <p className={row.online ? 'text-emerald-700' : 'text-slate-500'}>
                  {row.online ? '4G online' : 'Offline'}
                </p>
              </td>
              <td className="px-4 py-4">
                {row.helmet_detection_enabled ? (
                  <p className="mb-1 text-xs text-muted-foreground">
                    {!row.online ? 'Mũ: xe offline' : row.helmet_worn === 1 ? 'Mũ: đã nhận tín hiệu đội' : 'Mũ: chưa nhận tín hiệu đội'}
                  </p>
                ) : null}
                <StatusBadge online={Boolean(row.online)} over={Boolean(row.overspeed)} />
              </td>
              <td className="px-5 py-4 text-right text-xs text-muted-foreground">{formatDate(row.last_seen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ online, over }: { online: boolean; over: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        over ? 'bg-red-100 text-red-700' : online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {over ? 'Vượt tốc' : online ? 'An toàn' : 'Offline'}
    </span>
  );
}

function MapView() {
  const [data, setData] = useState<{ markers: DeviceMarker[]; trail: TrailPoint[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void api<{ markers: DeviceMarker[]; trail: TrailPoint[] }>('/api/map')
      .then(setData)
      .catch((reason) => setError(getError(reason)));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-xl font-bold">Bản đồ thời gian thực</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ghim và đường đi cập nhật mỗi 5 giây khi thiết bị gửi GPS hợp lệ.</p>
      </section>
      {error ? <Notice text={error} kind="error" onClose={() => setError(null)} /> : null}
      {data ? <DeviceMap markers={data.markers} trail={data.trail} /> : <LoadingScreen />}
    </div>
  );
}

function StudentsView({ onMessage }: { onMessage: (message: { text: string; kind: 'success' | 'error' }) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [contactsFor, setContactsFor] = useState<Student | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const refresh = () => setReload((value) => value + 1);

  useEffect(() => {
    void api<{ students: Student[] }>('/api/students')
      .then((data) => setStudents(data.students))
      .catch((error) => onMessage({ text: getError(error), kind: 'error' }));
  }, [reload, onMessage]);

  async function deleteStudent(student: Student) {
    if (!window.confirm(`Xóa học sinh ${student.full_name}?`)) return;
    try {
      await api(`/api/students?id=${encodeURIComponent(student.id)}`, { method: 'DELETE' });
      refresh();
      onMessage({ text: `Đã xóa học sinh ${student.full_name}.`, kind: 'success' });
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Danh sách học sinh"
        detail="Quản lý thông tin học sinh, lớp học và các liên hệ phụ huynh nhận cảnh báo."
        action={
          <button onClick={() => { setEditing(null); setShowForm(!showForm); }} className="button-primary">
            <Plus className="h-4 w-4" /> Thêm học sinh
          </button>
        }
      />
      {showForm ? (
        <StudentForm onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); refresh(); onMessage({ text: 'Đã thêm học sinh mới.', kind: 'success' }); }} onMessage={onMessage} />
      ) : null}
      {editing ? (
        <StudentForm student={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); onMessage({ text: 'Đã cập nhật học sinh.', kind: 'success' }); }} onMessage={onMessage} />
      ) : null}
      {contactsFor ? <ContactsManager student={contactsFor} onClose={() => setContactsFor(null)} onMessage={onMessage} /> : null}

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Học sinh</th>
              <th className="px-4 py-3">Mã định danh</th>
              <th className="px-4 py-3">Lớp</th>
              <th className="px-4 py-3">Biển số / Mã xe</th>
              <th className="px-5 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.length ? (
              students.map((st) => (
                <tr key={st.id} className="hover:bg-muted/30">
                  <td className="px-5 py-4 font-bold">{st.full_name}</td>
                  <td className="px-4 py-4 font-mono text-xs">{st.student_code}</td>
                  <td className="px-4 py-4">{st.class_name}</td>
                  <td className="px-4 py-4 font-mono">{st.vehicle_plate || '—'}</td>
                  <td className="px-5 py-4 text-right space-x-2">
                    <button onClick={() => setContactsFor(st)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                      Phụ huynh
                    </button>
                    <button onClick={() => setEditing(st)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                      Sửa
                    </button>
                    <button onClick={() => void deleteStudent(st)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
                      Xóa
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Chưa có học sinh nào. Bấm "+ Thêm học sinh" để bắt đầu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentForm({ student, onClose, onDone, onMessage }: { student?: Student; onClose: () => void; onDone: () => void; onMessage: (msg: { text: string; kind: 'success' | 'error' }) => void }) {
  const [saving, setSaving] = useState(false);
  async function submit(form: FormData) {
    setSaving(true);
    const body = {
      id: student?.id,
      student_code: form.get('student_code'),
      full_name: form.get('full_name'),
      class_name: form.get('class_name'),
      vehicle_plate: form.get('vehicle_plate') || undefined,
    };
    try {
      await api('/api/students', { method: student ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      onDone();
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormBox title={student ? `Sửa học sinh · ${student.full_name}` : 'Thêm học sinh'} onClose={onClose}>
      <form key={student?.id ?? 'new'} action={submit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Mã học sinh" name="student_code" defaultValue={student?.student_code} placeholder="HS-10A1-001" required />
        <Input label="Họ và tên" name="full_name" defaultValue={student?.full_name} placeholder="Nguyễn Văn A" required />
        <Input label="Lớp học" name="class_name" defaultValue={student?.class_name} placeholder="10A1" required />
        <Input label="Biển số / Mã xe tự chọn" name="vehicle_plate" defaultValue={student?.vehicle_plate ?? ''} placeholder="29MD1-12345" />
        <div className="sm:col-span-2 flex gap-3 pt-2">
          <button disabled={saving} className="button-primary">
            {saving ? 'Đang lưu…' : student ? 'Lưu cập nhật' : 'Thêm học sinh'}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">
            Hủy
          </button>
        </div>
      </form>
    </FormBox>
  );
}

function ContactsManager({ student, onClose, onMessage }: { student: Student; onClose: () => void; onMessage: (msg: { text: string; kind: 'success' | 'error' }) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((value) => value + 1);

  useEffect(() => {
    void api<{ contacts: Contact[] }>(`/api/parent-contacts?student_id=${encodeURIComponent(student.id)}`)
      .then((data) => setContacts(data.contacts))
      .catch((error) => onMessage({ text: getError(error), kind: 'error' }));
  }, [student.id, reload, onMessage]);

  async function deleteContact(contact: Contact) {
    if (!window.confirm(`Xóa số ${contact.phone}?`)) return;
    try {
      await api(`/api/parent-contacts?id=${encodeURIComponent(contact.id)}`, { method: 'DELETE' });
      refresh();
      onMessage({ text: 'Đã xóa liên hệ.', kind: 'success' });
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    }
  }

  async function submit(form: FormData) {
    try {
      await api('/api/parent-contacts', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          id: editing?.id,
          student_id: student.id,
          name: form.get('name'),
          relationship: form.get('relationship'),
          phone: form.get('phone'),
          sms_enabled: form.get('sms_enabled') === 'on',
        }),
      });
      setEditing(null);
      refresh();
      onMessage({ text: editing ? 'Đã cập nhật liên hệ.' : 'Đã thêm liên hệ phụ huynh.', kind: 'success' });
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    }
  }

  return (
    <FormBox title={`Phụ huynh · ${student.full_name}`} onClose={onClose}>
      <div className="space-y-3">
        {contacts.map((contact) => (
          <div key={contact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span>
              <strong>{contact.name}</strong> · {contact.relationship} · {contact.phone}
            </span>
            <div className="flex items-center gap-3">
              <span className={contact.sms_enabled ? 'text-emerald-700' : 'text-slate-500'}>
                {contact.sms_enabled ? 'Nhận SMS' : 'Tắt SMS'}
              </span>
              <button onClick={() => setEditing(contact)} className="font-semibold text-primary hover:underline">
                Sửa
              </button>
              <button onClick={() => void deleteContact(contact)} className="font-semibold text-red-700 hover:underline">
                Xóa
              </button>
            </div>
          </div>
        ))}
        <form key={editing?.id ?? 'new'} action={submit} className="grid gap-3 border-t pt-4 sm:grid-cols-4">
          <Input label="Tên" name="name" defaultValue={editing?.name} required />
          <Input label="Quan hệ" name="relationship" defaultValue={editing?.relationship} required />
          <Input label="Số điện thoại" name="phone" defaultValue={editing?.phone} required />
          <div className="flex items-end">
            <button className="button-primary w-full">{editing ? 'Lưu liên hệ' : 'Thêm số'}</button>
          </div>
          <div className="sm:col-span-4 flex items-center gap-4">
            <Toggle label="Nhận SMS" name="sms_enabled" defaultChecked={editing ? Boolean(editing.sms_enabled) : true} />
            {editing ? (
              <button type="button" onClick={() => setEditing(null)} className="text-sm font-semibold text-primary hover:underline">
                Hủy sửa
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </FormBox>
  );
}

function DevicesView({ onMessage }: { onMessage: (message: { text: string; kind: 'success' | 'error' }) => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [qrModalDevice, setQrModalDevice] = useState<Device | null>(null);
  const [accountToken, setAccountToken] = useState<string>('');
  const [reload, setReload] = useState(0);

  const refresh = () => setReload((value) => value + 1);

  useEffect(() => {
    void Promise.all([
      api<{ devices: Device[]; account_token?: string }>('/api/devices'),
      api<{ students: Student[] }>('/api/students'),
    ])
      .then(([dev, stu]) => {
        setDevices(dev.devices);
        if (dev.account_token) setAccountToken(dev.account_token);
        setStudents(stu.students);
      })
      .catch((error) => onMessage({ text: getError(error), kind: 'error' }));
  }, [reload, onMessage]);

  async function remoteAlarm(id: string) {
    if (!window.confirm('Thiết bị sẽ bíp tối đa 5 giây sau lần telemetry kế tiếp. Tiếp tục?')) return;
    try {
      const result = await api<{ message: string }>('/api/devices', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'remote_alarm' }),
      });
      onMessage({ text: result.message, kind: 'success' });
      refresh();
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    }
  }

  async function deleteDevice(device: Device) {
    if (
      !window.confirm(
        `Xóa vĩnh viễn ${device.device_id} và toàn bộ lịch sử vị trí, telemetry, cảnh báo liên quan? Hành động này không thể hoàn tác.`
      )
    )
      return;
    try {
      await api('/api/devices', { method: 'DELETE', body: JSON.stringify({ id: device.id }) });
      refresh();
      onMessage({ text: `Đã xóa thiết bị ${device.device_id}.`, kind: 'success' });
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Quản lý thiết bị"
        detail="Token provisioning được cấp tự động cho bo mạch lưu vào Flash; quét mã QR để ghép đôi học sinh."
        action={
          <button onClick={() => { setEditing(null); setShowForm(!showForm); }} className="button-primary">
            <Plus className="h-4 w-4" /> Thêm thiết bị
          </button>
        }
      />
      {showForm ? (
        <DeviceForm
          students={students}
          onClose={() => setShowForm(false)}
          onDone={(token) => { setShowForm(false); setProvisioning(token ?? null); refresh(); }}
          onMessage={onMessage}
        />
      ) : null}
      {editing ? (
        <DeviceForm
          device={editing}
          students={students}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); refresh(); onMessage({ text: 'Đã gửi cấu hình mới cho thiết bị.', kind: 'success' }); }}
          onMessage={onMessage}
        />
      ) : null}
      {provisioning ? (
        <Notice
          text={`Token thiết bị: ${provisioning}. Thiết bị sẽ tự động tải về bộ nhớ Flash khi nhấn nút BOOT.`}
          kind="success"
          onClose={() => setProvisioning(null)}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {devices.length ? (
          devices.map((device) => (
            <article key={device.id} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-bold">{device.device_id}</p>
                  <p className="text-sm text-muted-foreground">
                    {device.device_name} · {device.full_name ?? 'Chưa gán học sinh'}
                  </p>
                </div>
                <StatusBadge
                  online={Boolean(device.enabled)}
                  over={Boolean(device.current_speed && device.current_speed > device.speed_limit)}
                />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-3 text-center">
                <div>
                  <dt className="text-xs text-muted-foreground">Tốc độ</dt>
                  <dd className="font-bold">{formatSpeed(device.current_speed)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Giới hạn</dt>
                  <dd className="font-bold">{device.speed_limit} km/h</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cấu hình</dt>
                  <dd className="font-bold">v{device.version}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-blue-50 px-2 py-1 text-blue-800">
                  Cảnh báo: {device.speed_alert_enabled ? 'Bật' : 'Tắt'}
                </span>
                <span className="rounded bg-blue-50 px-2 py-1 text-blue-800">
                  Còi: {device.buzzer_enabled ? 'Bật' : 'Tắt'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                <button onClick={() => setEditing(device)} className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted">
                  Cấu hình
                </button>
                <button
                  onClick={() => setQrModalDevice(device)}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 flex items-center justify-center gap-1"
                >
                  <QrCode className="h-4 w-4" /> Mã QR
                </button>
                <button
                  onClick={() => void remoteAlarm(device.id)}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Phát còi
                </button>
                <button
                  onClick={() => void deleteDevice(device)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" /> Xóa
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty title="Chưa có thiết bị" detail="Thêm thiết bị mới để tạo mã xe và mã xác thực phần cứng." />
        )}
      </div>

      {qrModalDevice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border text-center">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800">Mã QR: {qrModalDevice.device_id}</h3>
              <button onClick={() => setQrModalDevice(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border flex flex-col items-center">
              <img
                src={
                  'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
                  encodeURIComponent(
                    (typeof window !== 'undefined' ? window.location.origin : 'https://antoanxe.edu.vn') +
                      `/activate?device_id=${encodeURIComponent(qrModalDevice.device_id)}&verify_code=${encodeURIComponent(qrModalDevice.verify_code || '')}${accountToken ? `&account_token=${encodeURIComponent(accountToken)}` : ''}`
                  )
                }
                alt={'QR Code ' + qrModalDevice.device_id}
                className="w-48 h-48 rounded-lg shadow-sm bg-white p-2"
              />
              <p className="mt-3 font-mono font-bold text-sm text-emerald-700">Mã ID xe: {qrModalDevice.device_id}</p>
              <p className="mt-1 font-mono text-xs text-indigo-700">
                Mã xác thực phần cứng: <span className="font-bold">{qrModalDevice.verify_code || 'Chưa gán'}</span>
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const url =
                    window.location.origin +
                    `/activate?device_id=${encodeURIComponent(qrModalDevice.device_id)}&verify_code=${encodeURIComponent(qrModalDevice.verify_code || '')}${accountToken ? `&account_token=${encodeURIComponent(accountToken)}` : ''}`;
                  navigator.clipboard.writeText(url);
                  onMessage({ text: 'Đã sao chép link kích hoạt của ' + qrModalDevice.device_id + '!', kind: 'success' });
                }}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Sao chép Link QR
              </button>
              <button
                onClick={() => setQrModalDevice(null)}
                className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeviceForm({ device, students, onClose, onDone, onMessage }: { device?: Device; students: Student[]; onClose: () => void; onDone: (token?: string) => void; onMessage: (msg: { text: string; kind: 'success' | 'error' }) => void }) {
  const [saving, setSaving] = useState(false);
  async function submit(form: FormData) {
    setSaving(true);
    const body = {
      id: device?.id,
      device_id: form.get('device_id'),
      device_name: form.get('device_name'),
      verify_code: form.get('verify_code') || undefined,
      student_id: form.get('student_id') || null,
      speed_limit: Number(form.get('speed_limit')),
      speed_alert_enabled: form.get('speed_alert_enabled') === 'on',
      buzzer_enabled: form.get('buzzer_enabled') === 'on',
      enabled: form.get('enabled') === 'on',
    };
    try {
      const data = await api<{ provisioning?: { device_token: string } }>('/api/devices', {
        method: device ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      onDone(data.provisioning?.device_token);
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormBox title={device ? `Cấu hình thiết bị · ${device.device_id}` : 'Thêm thiết bị'} onClose={onClose}>
      <form key={device?.id ?? 'new'} action={submit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Mã xe (device_id)" name="device_id" placeholder="XE001" defaultValue={device?.device_id} disabled={Boolean(device)} required />
        <Input label="Tên thiết bị" name="device_name" placeholder="Xe máy điện 001" defaultValue={device?.device_name} required />
        <Input label="Mã xác thực phần cứng (1 - 1 tỷ, bỏ trống sẽ tự sinh)" name="verify_code" placeholder="VD: 9824 hoặc để trống" defaultValue={device?.verify_code ?? ''} />
        <label className="grid gap-1 text-sm font-medium">
          Gán học sinh
          <select name="student_id" className="form-input" defaultValue={device?.student_id ?? ''}>
            <option value="">Chưa gán</option>
            {students.map((student) => (
              <option value={student.id} key={student.id}>
                {student.full_name} · {student.student_code}
              </option>
            ))}
          </select>
        </label>
        <Input label="Giới hạn (km/h)" name="speed_limit" type="number" min="10" max="80" defaultValue={device?.speed_limit ?? 40} required />
        <div className="flex flex-wrap gap-5 sm:col-span-2">
          <Toggle label="Bật cảnh báo vượt tốc" name="speed_alert_enabled" defaultChecked={device ? Boolean(device.speed_alert_enabled) : true} />
          <Toggle label="Bật còi trên xe" name="buzzer_enabled" defaultChecked={device ? Boolean(device.buzzer_enabled) : true} />
          <Toggle label="Thiết bị hoạt động" name="enabled" defaultChecked={device ? Boolean(device.enabled) : true} />
        </div>
        <div className="sm:col-span-2 flex gap-3 pt-2">
          <button disabled={saving} className="button-primary">
            {saving ? 'Đang lưu…' : device ? 'Lưu cấu hình' : 'Tạo thiết bị'}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Hủy
          </button>
        </div>
      </form>
    </FormBox>
  );
}

// 5. VIEW QUẢN LÝ TÀI KHOẢN HỌC SINH CON (SUBACCOUNTS VIEW)
function SubaccountsView({ onMessage, schoolId, schoolName }: { onMessage: (msg: { text: string; kind: 'success' | 'error' }) => void; schoolId: string; schoolName: string }) {
  const [accounts, setAccounts] = useState<SubAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = () => setReload((v) => v + 1);

  useEffect(() => {
    api<{ accounts: SubAccount[] }>('/api/subaccounts')
      .then((data) => setAccounts(data.accounts || []))
      .catch((err) => onMessage({ text: getError(err), kind: 'error' }));
  }, [reload, onMessage]);

  const studentLoginUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/login?school_id=${encodeURIComponent(schoolId)}&role=student`
      : `/login?school_id=${encodeURIComponent(schoolId)}&role=student`;

  async function deleteAccount(acc: SubAccount) {
    if (!window.confirm(`Xóa tài khoản con của học sinh ${acc.full_name} (${acc.username})?`)) return;
    try {
      await api(`/api/subaccounts?id=${encodeURIComponent(acc.id)}`, { method: 'DELETE' });
      refresh();
      onMessage({ text: `Đã xóa tài khoản học sinh con ${acc.username}.`, kind: 'success' });
    } catch (err) {
      onMessage({ text: getError(err), kind: 'error' });
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      await api('/api/subaccounts', {
        method: 'POST',
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
          full_name: form.get('full_name'),
          class_name: form.get('class_name'),
        }),
      });
      setShowForm(false);
      refresh();
      onMessage({ text: 'Đã tạo tài khoản học sinh con thành công!', kind: 'success' });
    } catch (err) {
      onMessage({ text: getError(err), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Quản lý tài khoản học sinh con"
        detail="Giáo viên có thể tạo nhiều tài khoản con cho học sinh trong trường. Học sinh đăng nhập bằng Username và Mật khẩu riêng, không lo trùng lặp với người dùng cá nhân."
        action={
          <button onClick={() => setShowForm(!showForm)} className="button-primary">
            <Plus className="h-4 w-4" /> Tạo tài khoản học sinh con
          </button>
        }
      />

      {/* Link đăng nhập học sinh */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-bold text-sm text-blue-950">
              <Link2 className="h-4 w-4 text-blue-700" /> Link đăng nhập dành riêng cho học sinh {schoolName}
            </p>
            <p className="mt-1 text-xs text-blue-800 break-all font-mono bg-white/70 p-2 rounded-lg border border-blue-100">
              {studentLoginUrl}
            </p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(studentLoginUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
              onMessage({ text: 'Đã sao chép link đăng nhập học sinh!', kind: 'success' });
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-blue-800 transition-colors"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Đã sao chép link' : 'Sao chép link đăng nhập'}
          </button>
        </div>
      </div>

      {showForm ? (
        <FormBox title="Tạo tài khoản học sinh con mới" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Input label="Họ và tên học sinh" name="full_name" placeholder="Ví dụ: Nguyễn Văn A" required />
            <Input label="Lớp học" name="class_name" placeholder="Ví dụ: 10A1" required />
            <Input
              label="Tên đăng nhập con (Username)"
              name="username"
              placeholder="Ví dụ: hocsinh1 (chữ không dấu, số, . _ -)"
              required
            />
            <Input label="Mật khẩu ban đầu" name="password" type="password" placeholder="Tối thiểu 6 ký tự" required />
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button disabled={saving} className="button-primary">
                {saving ? 'Đang tạo...' : 'Tạo tài khoản con'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Hủy
              </button>
            </div>
          </form>
        </FormBox>
      ) : null}

      {/* Danh sách tài khoản con */}
      {accounts.length ? (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Học sinh</th>
                <th className="px-4 py-3">Tên đăng nhập (Username)</th>
                <th className="px-4 py-3">Lớp</th>
                <th className="px-4 py-3">Xe liên kết</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-muted/30">
                  <td className="px-5 py-4 font-bold text-slate-800">{acc.full_name}</td>
                  <td className="px-4 py-4 font-mono font-semibold text-emerald-700">{acc.username}</td>
                  <td className="px-4 py-4">{acc.class_name}</td>
                  <td className="px-4 py-4 font-mono">
                    {acc.device_id || <span className="text-muted-foreground italic">Chưa gán</span>}
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{formatDate(acc.created_at)}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => void deleteAccount(acc)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Chưa có tài khoản học sinh con"
          detail="Bấm '+ Tạo tài khoản học sinh con' để cấp tên đăng nhập và mật khẩu cho học sinh trong trường."
        />
      )}
    </div>
  );
}

function AlertsView({ onMessage, onRefresh }: { onMessage: (message: { text: string; kind: 'success' | 'error' }) => void; onRefresh: () => Promise<void> }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [reload, setReload] = useState(0);

  const load = useCallback(
    () =>
      api<{ alerts: Alert[] }>('/api/alerts?status=open')
        .then((data) => setAlerts(data.alerts))
        .catch((error) => onMessage({ text: getError(error), kind: 'error' })),
    [onMessage]
  );

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load, reload]);

  async function resolve(id: string) {
    try {
      await api('/api/alerts', { method: 'PATCH', body: JSON.stringify({ id, status: 'resolved' }) });
      setReload((value) => value + 1);
      await onRefresh();
      onMessage({ text: 'Đã đánh dấu cảnh báo là đã xử lý.', kind: 'success' });
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeading title="Trung tâm cảnh báo" detail="Tự cập nhật mỗi 5 giây; xử lý bằng nhắc nhở, phối hợp và phòng ngừa." />
      {alerts.length ? (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <article key={alert.id} className="rounded-2xl border border-red-100 bg-card p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div>
                  <p className="flex items-center gap-2 font-bold text-red-800">
                    <TriangleAlert className="h-5 w-5" />
                    {alert.title}
                  </p>
                  <p className="mt-2 text-sm">
                    {alert.full_name ?? 'Chưa gán học sinh'} · {alert.class_name ?? '—'} · {alert.device_id ?? '—'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(alert.created_at)}</p>
                </div>
                <button
                  onClick={() => void resolve(alert.id)}
                  className="h-9 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  <Check className="mr-1 inline h-4 w-4" />
                  Đã xử lý
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="Không có cảnh báo mở" detail="Cảnh báo vượt tốc và thiếu tín hiệu đội mũ sẽ xuất hiện ở đây." />
      )}
    </div>
  );
}

function HistoryView({ onMessage }: { onMessage: (message: { text: string; kind: 'success' | 'error' }) => void }) {
  const [type, setType] = useState<'events' | 'telemetry'>('events');
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api<{ rows: HistoryRow[] }>(`/api/history?type=${type}`)
        .then((data) => setRows(data.rows))
        .catch((error) => onMessage({ text: getError(error), kind: 'error' }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [type, onMessage]);

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Lịch sử an toàn"
        detail="Dữ liệu dùng để phối hợp giáo dục và phòng ngừa, không dùng để bêu tên hoặc chấm điểm đạo đức."
      />
      <div className="flex gap-2">
        <button onClick={() => setType('events')} className={type === 'events' ? 'button-primary' : 'rounded-lg border px-3 py-2 text-sm font-semibold'}>
          Sự kiện vượt tốc
        </button>
        <button onClick={() => setType('telemetry')} className={type === 'telemetry' ? 'button-primary' : 'rounded-lg border px-3 py-2 text-sm font-semibold'}>
          Telemetry gần nhất
        </button>
      </div>
      {rows ? (
        rows.length ? (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Thiết bị</th>
                  <th className="px-4 py-3">Tốc độ</th>
                  <th className="px-4 py-3">GPS</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, index) => (
                  <tr key={`${row.device_id}-${row.recorded_at ?? row.started_at}-${index}`}>
                    <td className="px-4 py-3">{formatDate(row.recorded_at ?? row.started_at ?? null)}</td>
                    <td className="px-4 py-3">
                      <strong>{row.full_name ?? 'Chưa gán'}</strong>
                      <p className="text-xs text-muted-foreground">
                        {row.student_code ?? '—'} · {row.class_name ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">{row.device_id}</td>
                    <td className="px-4 py-3 font-semibold">
                      {formatSpeed(row.max_speed ?? row.speed ?? null)}
                      {row.speed_limit !== undefined ? (
                        <p className="text-xs font-normal text-muted-foreground">Giới hạn {row.speed_limit} km/h</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {row.gps_valid ? formatCoordinates(row.latitude, row.longitude) : 'Chưa xác định'}
                    </td>
                    <td className="px-4 py-3">
                      {type === 'events' ? `SMS: ${row.sms_sent ? 'đã gửi' : 'chưa gửi'}` : row.overspeed_active ? 'Đang vượt tốc' : 'Bình thường'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Chưa có dữ liệu lịch sử" detail="Dữ liệu sẽ xuất hiện khi thiết bị bắt đầu gửi telemetry." />
        )
      ) : (
        <LoadingScreen />
      )}
    </div>
  );
}

function StatisticsView({ onMessage }: { onMessage: (message: { text: string; kind: 'success' | 'error' }) => void }) {
  const [data, setData] = useState<StatisticsData | null>(null);

  useEffect(() => {
    void api<StatisticsData>('/api/statistics')
      .then(setData)
      .catch((error) => onMessage({ text: getError(error), kind: 'error' }));
  }, [onMessage]);

  if (!data) return <LoadingScreen />;
  const maxCount = Math.max(1, ...data.daily.map((item) => Number(item.count)));

  return (
    <div className="space-y-5">
      <SectionHeading title="Thống kê hỗ trợ nhắc nhở" detail="Theo dõi xu hướng để phối hợp cùng gia đình và xây dựng thói quen an toàn." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Tốc độ cao nhất ghi nhận" value={`${data.maxSpeed.toFixed(1)} km/h`} />
        <Metric label="Thiết bị đang online" value={`${data.devices.online}/${data.devices.total}`} />
        <Metric label="Sự kiện 30 ngày" value={`${data.daily.reduce((sum, item) => sum + Number(item.count), 0)} lượt`} />
      </div>
      <FormBox title="Số lượt vượt tốc theo ngày">
        <div className="flex min-h-52 items-end gap-2 overflow-x-auto pt-6">
          {data.daily.length ? (
            data.daily.map((item) => (
              <div key={item.day} className="flex min-w-12 flex-1 flex-col items-center gap-2">
                <span className="text-xs font-bold">{item.count}</span>
                <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(8, (Number(item.count) / maxCount) * 150)}px` }} />
                <span className="text-[11px] text-muted-foreground">{item.day.slice(5)}</span>
              </div>
            ))
          ) : (
            <p className="m-auto text-sm text-muted-foreground">Chưa có sự kiện trong 30 ngày.</p>
          )}
        </div>
      </FormBox>
      <FormBox title="Học sinh cần được nhắc nhở">
        <div className="space-y-2">
          {data.students.length ? (
            data.students.map((student) => (
              <div key={student.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-3">
                <span>
                  <strong>{student.full_name}</strong>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {student.student_code} · {student.class_name}
                  </span>
                </span>
                <span className="text-sm font-semibold">
                  {student.count} lượt · cao nhất {Number(student.max_speed).toFixed(1)} km/h
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có học sinh cần nhắc nhở.</p>
          )}
        </div>
      </FormBox>
    </div>
  );
}

function AccountView({ user }: { user: DashboardData['user'] | null; onSaved: () => Promise<void> }) {
  return (
    <div className="max-w-2xl space-y-5">
      <SectionHeading title="Tài khoản quản lý" detail="Mỗi tài khoản chỉ truy cập vùng dữ liệu đã đăng ký." />
      <FormBox title="Thông tin truy cập">
        <div className="space-y-4">
          <Info label="Người dùng" value={user?.displayName ?? '—'} />
          <Info label="Email" value={user?.email ?? '—'} />
          <Info label="Vùng dữ liệu" value={user?.schoolName ?? '—'} />
          <Info
            label="Vai trò"
            value={
              user?.role === 'admin'
                ? 'Quản trị viên / Giáo viên'
                : user?.role === 'student'
                ? 'Học sinh con'
                : user?.role === 'staff'
                ? 'Nhân viên'
                : 'Chỉ xem'
            }
          />
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted">
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
          </form>
        </div>
      </FormBox>
    </div>
  );
}

function SettingsView({ onMessage }: { onMessage: (message: { text: string; kind: 'success' | 'error' }) => void }) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<{ settings: SettingsData }>('/api/settings')
      .then((data) => setSettings(data.settings))
      .catch((error) => onMessage({ text: getError(error), kind: 'error' }));
  }, [onMessage]);

  async function submit(form: FormData) {
    setSaving(true);
    try {
      const payload = form.has('helmet_grace_seconds')
        ? {
            helmet_detection_enabled: form.get('helmet_detection_enabled') === 'on',
            helmet_grace_seconds: Number(form.get('helmet_grace_seconds')),
            helmet_min_speed_kmh: Number(form.get('helmet_min_speed_kmh')),
          }
        : {
            sms_enabled: form.get('sms_enabled') === 'on',
            send_location: form.get('send_location') === 'on',
            sms_cooldown_minutes: Number(form.get('sms_cooldown_minutes')),
            telemetry_retention_days: Number(form.get('telemetry_retention_days')),
            sms_template: form.get('sms_template'),
          };
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify(payload) });
      const refreshed = await api<{ settings: SettingsData }>('/api/settings');
      setSettings(refreshed.settings);
      onMessage({ text: 'Đã lưu cài đặt.', kind: 'success' });
    } catch (error) {
      onMessage({ text: getError(error), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <LoadingScreen />;

  return (
    <div className="max-w-3xl space-y-5">
      <SectionHeading title="Cài đặt hệ thống" detail="Thiết lập SMS, quyền riêng tư vị trí và thời hạn lưu telemetry." />
      <FormBox title="Cấu hình SMS">
        <form action={submit} className="space-y-5">
          <div className="flex flex-wrap gap-6">
            <Toggle label="Bật SMS cho tài khoản" name="sms_enabled" defaultChecked={Boolean(settings.sms_enabled)} />
            <Toggle label="Đính kèm vị trí GPS hợp lệ" name="send_location" defaultChecked={Boolean(settings.send_location)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Cooldown SMS (phút)" name="sms_cooldown_minutes" type="number" min="1" max="1440" defaultValue={settings.sms_cooldown_minutes} required />
            <Input label="Giữ telemetry (ngày)" name="telemetry_retention_days" type="number" min="7" max="365" defaultValue={settings.telemetry_retention_days} required />
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Mẫu SMS
            <textarea name="sms_template" className="form-input min-h-40" defaultValue={settings.sms_template} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button disabled={saving} className="button-primary">
              {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
            </button>
          </div>
        </form>
      </FormBox>
      <HelmetSmsPanel onMessage={onMessage} />
    </div>
  );
}

function SectionHeading({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
      {action}
    </section>
  );
}

function FormBox({ title, children, onClose }: { title: string; children: React.ReactNode; onClose?: () => void }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold">{title}</h3>
        {onClose ? (
          <button onClick={onClose} aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input {...props} className="form-input" />
    </label>
  );
}

function Toggle({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input {...props} type="checkbox" className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-48 place-items-center p-8 text-center">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

async function api<T = Record<string, never>>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });
  const payload = (await response.json()) as { success: boolean; error?: { message?: string } } & T;
  if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? 'Yêu cầu không thành công.');
  return payload;
}

function getError(error: unknown) {
  return error instanceof Error ? error.message : 'Có lỗi không xác định.';
}

function formatSpeed(value: number | null) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(1)} km/h`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có dữ liệu';
}

function formatCoordinates(latitude: number | null, longitude: number | null) {
  return latitude === null || longitude === null || latitude === undefined || longitude === undefined
    ? 'Vị trí chưa xác định'
    : `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
}

function initials(value: string | undefined) {
  return (
    (value ?? 'NT')
      .split(/[\s@._-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0])
      .join('')
      .toUpperCase() || 'NT'
  );
}
