// Chỉ dùng với web local và thiết bị thử do học sinh tự tạo.
// Không cần thư viện npm bổ sung. Chạy bằng Node.js 24.
const origin = new URL(process.env.DEMO_ORIGIN ?? 'http://localhost:5173');
if (!['localhost', '127.0.0.1'].includes(origin.hostname) || origin.protocol !== 'http:') {
  throw Error('Chỉ cho phép http://localhost hoặc http://127.0.0.1. Không gửi mô phỏng lên web thật.');
}
const token = process.env.DEVICE_TOKEN?.trim();
if (!token || token.length < 24) throw Error('Chưa có biến DEVICE_TOKEN. Đọc chương mô phỏng trong hướng dẫn.');
const deviceId = process.env.DEVICE_ID ?? 'XE01';
const worn = process.argv.includes('--doi-mu');
const stopped = process.argv.includes('--dung');
const overspeed = process.argv.includes('--vuot-toc');
const samples = worn || stopped ? 3 : 7;
const intervalMs = 15000;
console.log('DỮ LIỆU GIẢ LẬP CHỈ TRÊN MÁY HỌC SINH', origin.origin);
console.log('Xe:', deviceId, '| Đội mũ:', worn, '| Tốc độ:', stopped ? 0 : overspeed ? 45 : 12);
for (let i = 0; i < samples; ++i) {
  const body = {
    device_id: deviceId,
    sample_id: 'demo-' + crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    speed: stopped ? 0 : overspeed ? 45 : 12,
    gps_valid: true,
    latitude: 16.00000, longitude: 108.00000,
    satellites: 9, hdop: 1.2, network_signal: 20,
    overspeed_active: overspeed && !stopped,
    helmet_worn: worn,
    firmware_version: 'demo-local-1.0',
  };
  const response = await fetch(new URL('/api/device/telemetry', origin), {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw Error('HTTP ' + response.status + ': ' + JSON.stringify(result.error));
  console.log(new Date().toLocaleTimeString('vi-VN'), '| Mẫu', i + 1, '/', samples, '| Web đã nhận');
  if (i + 1 < samples) await new Promise(resolve => setTimeout(resolve, intervalMs));
}
console.log('Xong. Mở Tổng quan và Cảnh báo. Tọa độ trên là tọa độ giả cho bài học.');
