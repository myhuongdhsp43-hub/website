'use client';
import { useCallback, useEffect, useState } from 'react';

type Data = {
  devices: { id: string; device_id: string; firmware_version: string | null }[];
  jobs: { id: string; device_id: string; phone: string; message?: string; status: string; detail?: string | null; created_at: string }[];
};

const labels: Record<string, string> = {
  queued: 'Chờ xe nhận lệnh',
  dispatched: 'Xe đang gửi qua SIM',
  accepted: 'Nhà mạng đã chấp nhận',
  failed: 'Gửi thất bại',
  unknown: 'Chưa xác định kết quả',
  cancelled: 'Đã hủy',
  expired: 'Hết hạn chờ xe',
};

function isVersionSupported(version: string | null): boolean {
  if (!version) return false;
  const match = version.match(/^(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 4);
}

export function HelmetSmsPanel({ onMessage }: { onMessage: (message: { text: string; kind: 'success' | 'error' }) => void }) {
  const [data, setData] = useState<Data>({ devices: [], jobs: [] });
  const [saving, setSaving] = useState(false);
  const [testMessage, setTestMessage] = useState('TEST AN TOAN XE: Kiem tra tin nhan tu SIM tren xe. Canh bao mu bao hiem hoat dong tot.');

  const load = useCallback(async () => {
    const response = await fetch('/api/helmet-sms', { cache: 'no-store' });
    const result = await response.json() as Data & { error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message ?? 'Không thể đọc trạng thái SMS.');
    setData(result);
  }, []);

  useEffect(() => {
    void load().catch(error => onMessage({ text: error.message, kind: 'error' }));
    const timer = window.setInterval(() => void load().catch(() => {}), 5000);
    return () => window.clearInterval(timer);
  }, [load, onMessage]);

  async function test(form: FormData) {
    setSaving(true);
    try {
      const response = await fetch('/api/helmet-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: form.get('device_id'),
          phone: form.get('phone'),
          message: form.get('message'),
        }),
      });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? 'Không thể tạo lệnh SMS.');
      await load();
      onMessage({ text: 'Đã xếp lệnh SMS thử! Bo SIM trên xe sẽ nhận lệnh và gửi tin nhắn trong vài giây.', kind: 'success' });
    } catch (error) {
      onMessage({ text: error instanceof Error ? error.message : 'Lỗi gửi thử.', kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">SMS cảnh báo mũ qua SIM trên xe</h3>
        <span className="text-xs text-muted-foreground">Firmware hỗ trợ: v2.4 trở lên</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Hệ thống gửi tin nhắn trực tiếp qua module SIM (EG800K) gắn trên xe mà không phụ thuộc vào hạ tầng cloud SMS bên ngoài.
        Tin nhắn được chuẩn hóa không dấu (tối đa 160 ký tự GSM). Hãy đảm bảo SIM còn số dư và có sóng di động.
      </p>

      <form action={test} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Xe gửi thử
          <select name="device_id" required className="form-input" defaultValue="">
            <option value="" disabled>Chọn xe (firmware 2.4 trở lên)</option>
            {data.devices.map(device => {
              const supported = isVersionSupported(device.firmware_version);
              return (
                <option key={device.id} value={device.id}>
                  {device.device_id} · {device.firmware_version ? `v${device.firmware_version}` : 'chưa có dữ liệu'} {supported ? '✓ Sẵn sàng' : '(cần cập nhật fw)'}
                </option>
              );
            })}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          Số điện thoại nhận thử
          <input name="phone" type="tel" required placeholder="09xxxxxxxx hoặc +84xxxxxxxxx" className="form-input" />
        </label>

        <label className="grid gap-1 text-sm sm:col-span-2">
          <div className="flex justify-between">
            <span>Nội dung tin nhắn thử (tùy chọn)</span>
            <span className="text-xs text-muted-foreground">{testMessage.length}/160 ký tự</span>
          </div>
          <input
            name="message"
            type="text"
            maxLength={160}
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            placeholder="Nhập nội dung tin nhắn thử..."
            className="form-input"
          />
        </label>

        <button disabled={saving || !data.devices.length} className="button-primary sm:col-span-2">
          {saving ? 'Đang xếp lệnh…' : 'Gửi SMS thử bằng SIM xe (có tính cước SIM)'}
        </button>
      </form>

      <h4 className="mt-5 text-sm font-semibold">20 lệnh gần nhất · tự động cập nhật mỗi 5 giây</h4>
      <div className="mt-2 space-y-2">
        {data.jobs.length ? (
          data.jobs.map(job => (
            <div key={job.id} className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span><strong>{job.device_id}</strong> → <strong>{job.phone}</strong></span>
                <span className={`px-2 py-0.5 rounded font-medium ${job.status === 'accepted' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : job.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                  {labels[job.status] ?? job.status}
                </span>
              </div>
              {job.message && <p className="text-muted-foreground italic font-mono text-[11px] truncate">"{job.message}"</p>}
              {job.detail && <p className="text-muted-foreground text-[11px]">Chi tiết: {job.detail}</p>}
              <div className="text-[11px] text-muted-foreground">
                {new Date(job.created_at).toLocaleString('vi-VN')}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có lệnh SMS cảnh báo mũ.</p>
        )}
      </div>
    </section>
  );
}
