# Mã nguồn web dành cho học sinh

Đọc tài liệu Word ở thư mục ngoài trước khi làm.

Đây là bản sao dùng học tập từ web phiên bản 5, đã tách mã dự án Sites cũ và chuyển cấu hình sang Cloudflare Workers cùng D1 riêng. Không chứa tài khoản, dữ liệu học sinh, token thiết bị hoặc quyền quản lý web gốc.

## Phiên bản

- Node.js 24 LTS, hoặc ít nhất 22.13.
- pnpm 10 dùng cho lockfile đang có: npm install -g pnpm@10.
- React 19.2.6, Vinext 1.0.0-beta.5, TypeScript 5.9.3, Wrangler 4.92.0; xem đầy đủ trong package.json và pnpm-lock.yaml.
- Các gói được cài bằng pnpm install --frozen-lockfile, không chép node_modules từ máy khác.

## Chạy local

Mở Command Prompt trong thư mục 03_WEB:

    pnpm install --frozen-lockfile
    pnpm exec wrangler d1 migrations apply DB --local --config wrangler.jsonc
    pnpm dev

Mở địa chỉ Local do terminal in ra. Giữ nguyên localhost khi đăng ký và đăng nhập.
Local chỉ chạy trên máy đang mở server; SIM ngoài Internet không thể truy cập localhost.
Nếu 5173 bận, terminal có thể chọn cổng khác; dùng cổng thực tế.

## Kiểm tra và build

    pnpm exec tsc --noEmit
    pnpm test
    pnpm build

## Đưa lên Cloudflare riêng

Cần tài khoản Cloudflare do giáo viên giám sát và kiểm tra phí/điều khoản.

    pnpm exec wrangler login
    pnpm exec wrangler d1 create antoanxe-hocsinh-db

Chép database_id được trả về vào wrangler.jsonc; database_name khớp cơ sở dữ liệu đã tạo, binding giữ DB. Đổi name thành tên Worker của nhóm.

    pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.jsonc
    pnpm build
    pnpm exec wrangler deploy --config dist/server/wrangler.json

Chỉ chạy --remote sau khi chắc chắn đây là D1 của nhóm. Quy trình xuất bản thực tế cần quyền Cloudflare và chưa được chạy lên tài khoản mới trong gói này.

Đăng ký tài khoản ứng dụng trên địa chỉ HTTPS mới, tạo lại học sinh, thiết bị và token. Đổi hai URL trong firmware theo tên miền mới rồi nạp lại. Tài khoản và token ở web cũ không tự tồn tại ở web mới.

## Khác với bản đang chạy

- Vite dùng wrangler.jsonc của thư mục này, không phụ thuộc project_id Sites của giáo viên.
- Ứng dụng, API và các SQL migration giữ logic của bản 5.
- SMS mũ đi qua SIM EG800K. SMS vượt tốc và nút Test SMS cũ vẫn đi qua lib/server/sms.ts, mặc định mô phỏng khi chưa cấu hình dịch vụ. Không gọi trạng thái mocked là đã gửi thật.
- Firmware chia sẻ đặt DEVICE_TOKEN rỗng và BUZZER_PIN=-1 cho tới khi giáo viên xác nhận mạch còi.
- Gói này không chứa cơ sở dữ liệu thật. Các tài khoản mới phải được tạo riêng.
