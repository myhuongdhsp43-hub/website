# HƯỚNG DẪN TRIỂN KHAI LÊN CLOUDFLARE WORKERS TỪ A-Z
**Dành cho Dự án An Toàn Xe Điện (Thư mục `03_WEB`)**

---

Toàn bộ hệ thống website đã được tích hợp hoàn chỉnh và đóng gói sẵn sàng cho **Cloudflare Workers** + **Cloudflare D1 (Cơ sở dữ liệu SQLite đám mây)**.

Bạn chỉ cần thực hiện 5 bước đơn giản dưới đây từ cửa sổ dòng lệnh (Terminal/Command Prompt) tại thư mục `03_WEB`:

---

### 📌 Bước 1: Đăng nhập vào Cloudflare
Mở Command Prompt trong thư mục `03_WEB` và chạy:
```bash
pnpm exec wrangler login
```
*(Trình duyệt sẽ tự động mở trang web Cloudflare để bạn xác nhận đăng nhập).*

---

### 🗄️ Bước 2: Tạo Cơ sở dữ liệu Cloudflare D1
Chạy lệnh tạo database mới trên tài khoản Cloudflare của bạn:
```bash
pnpm exec wrangler d1 create antoanxe-hocsinh-db
```

Sau khi tạo xong, Wrangler sẽ in ra thông tin cấu hình tương tự như sau:
```json
{
  "binding": "DB",
  "database_name": "antoanxe-hocsinh-db",
  "database_id": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

👉 Hãy mở file [`wrangler.jsonc`](file:///d:/khkt/tài%20liệu/BO_HOC_TAP_AN_TOAN_XE_2026-10-21/03_WEB/wrangler.jsonc) và dán mã `database_id` vừa nhận được vào dòng số 11. Đổi `name` ở dòng 3 thành tên Worker của bạn nếu muốn (ví dụ: `"antoanxedien-thcs"`).

---

### 📦 Bước 3: Đẩy cấu trúc bảng dữ liệu (Migrations) lên Cloudflare
Chạy lệnh áp dụng toàn bộ 6 bản migration (tạo bảng thiết bị, tài khoản, mã xác thực 1 - 1 tỷ, học sinh, v.v.):
```bash
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.jsonc
```
*(Hệ thống sẽ hỏi xác nhận `yes/no`, bạn gõ `y` rồi nhấn Enter).*

---

### 🚀 Bước 4: Đóng gói và Xuất bản (Build & Deploy)
Chạy 2 lệnh sau để đưa website lên Internet:
```bash
pnpm run build
pnpm run deploy
```

Ngay sau khi lệnh chạy xong, Cloudflare sẽ cung cấp cho bạn một đường dẫn HTTPS công khai toàn cầu, ví dụ:
```text
https://antoanxedien-thcs.ten-tai-khoan.workers.dev
```

---

### 🌐 Bước 5: Kiểm tra các tính năng trên Cloudflare
Truy cập vào tên miền Workers vừa nhận được:
1. **Trang chủ:** `https://<ten-worker>.workers.dev`
2. **Kích hoạt mã QR học sinh:** `https://<ten-worker>.workers.dev/activate`
3. **Cổng Master Admin:** `https://<ten-worker>.workers.dev/master-admin` (Nhập mã `Admin123@`)
4. **Bảng radar trường học:** `https://<ten-worker>.workers.dev/login`

---

### 📡 Cập nhật vào Firmware Bo Xe ([`TDM2421_FINAL.ino`](file:///d:/khkt/tài%20liệu/BO_HOC_TAP_AN_TOAN_XE_2026-10-21/01_ESP_XE/TDM2421_FINAL/TDM2421_FINAL.ino))
Sau khi có tên miền Cloudflare chính thức, hãy mở file firmware bo xe và thay thế 3 đường dẫn URL:
```cpp
#define TELEMETRY_URL        "https://<ten-worker>.workers.dev/api/device/telemetry"
#define REMOTE_ALARM_ACK_URL "https://<ten-worker>.workers.dev/api/device/acknowledge-remote-alarm"
#define PAIR_REQUEST_URL     "https://<ten-worker>.workers.dev/api/device/pair-request"
```
Nạp lại code vào bo xe là toàn bộ hệ thống IoT từ bo mạch tới đám mây Cloudflare sẽ kết nối thông suốt 100%!
