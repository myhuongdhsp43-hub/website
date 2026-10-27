'use client';
import { useCallback, useEffect, useState } from 'react';

type Data = {
  devices: { id: string; device_id: string; firmware_version: string | null }[];
  jobs: { id: string; device_id: string; phone: string; status: string; created_at: string }[];
};
const labels: Record<string, string> = { queued: 'Chờ xe nhận', dispatched: 'Xe đang xử lý', accepted: 'Nhà mạng đã chấp nhận', failed: 'Gửi thất bại', unknown: 'Chưa xác định kết quả — không tự gửi lại', cancelled: 'Đã hủy', expired: 'Hết hạn chờ xe' };

export function HelmetSmsPanel({ onMessage }: { onMessage: (message: { text: string; kind: 'success' | 'error' }) => void }) {
  const [data, setData] = useState<Data>({ devices: [], jobs: [] });
  const [saving, setSaving] = useState(false);
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
      const response = await fetch('/api/helmet-sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: form.get('device_id'), phone: form.get('phone') }) });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? 'Không thể tạo lệnh SMS.');
      await load();
      onMessage({ text: 'Đã xếp lệnh. Chờ xe nhận và kiểm tra kết quả bên dưới.', kind: 'success' });
    } catch (error) { onMessage({ text: error instanceof Error ? error.message : 'Lỗi gửi thử.', kind: 'error' }); }
    finally { setSaving(false); }
  }
  return <section className="rounded-2xl border bg-card p-5 shadow-sm">
    <h3 className="font-bold">SMS cảnh báo mũ qua SIM trên xe</h3>
    <p className="mt-2 text-sm text-muted-foreground">Thêm số phụ huynh ở mục Học sinh, gán học sinh cho xe và bật SMS. SIM phải gửi được SMS, còn tài khoản; nhà mạng tính phí tin nhắn. Tin dùng tiếng Việt không dấu để gọn trong một SMS. Trạng thái nhà mạng chấp nhận chưa phải xác nhận điện thoại đã nhận.</p>
    <form action={test} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Xe gửi thử<select name="device_id" required className="form-input" defaultValue=""><option value="" disabled>Chọn xe đã nạp firmware 2.4</option>{data.devices.map(device => <option key={device.id} value={device.id}>{device.device_id} · {device.firmware_version ?? 'chưa có phiên bản'}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Số điện thoại nhận thử<input name="phone" type="tel" required placeholder="09xxxxxxxx" className="form-input" /></label>
      <button disabled={saving || !data.devices.length} className="button-primary sm:col-span-2">{saving ? 'Đang xếp lệnh…' : 'Gửi SMS thử bằng SIM xe (có tính phí)'}</button>
    </form>
    <h4 className="mt-5 text-sm font-semibold">20 lệnh gần nhất · cập nhật mỗi 5 giây</h4>
    <div className="mt-2 space-y-2">{data.jobs.length ? data.jobs.map(job => <p key={job.id} className="rounded-lg bg-muted/50 p-3 text-xs"><strong>{job.device_id}</strong> · {job.phone} · {labels[job.status] ?? job.status}<br />{new Date(job.created_at).toLocaleString('vi-VN')}</p>) : <p className="text-sm text-muted-foreground">Chưa có lệnh SMS cảnh báo mũ.</p>}</div>
  </section>;
}
