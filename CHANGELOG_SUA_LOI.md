# Changelog bản sửa lỗi (2.7.0)

## Web
- Khóa quản trị master đưa vào secret `MASTER_ADMIN_KEY` (không còn trong mã nguồn). Cần đặt secret trên Cloudflare trước khi deploy.
- Trang master admin kiểm tra khóa ở máy chủ, không còn so sánh khóa trong trình duyệt.
- Mã xác minh thiết bị sinh bằng `crypto.getRandomValues` thay cho `Math.random`.
- Thiết bị được coi là online trong 2 phút (trước là 1 giờ).
- Bật còi từ trang cấu hình thiết bị giờ cũng cập nhật mã lệnh, nên lệnh không bị coi là cũ.

## Firmware (.ino)
- Phiên bản 2.7.0, khớp với tiêu đề và tài liệu.
- Không in toàn bộ token thiết bị ra Serial (chỉ in 4 ký tự đầu).
- Khi đang chờ SMS, vòng lặp chỉ xử lý còi và SMS, không chạm vào modem bằng nút ghép đôi hay đồng bộ token.

## Còn lại (cần làm thêm)
- Phát còi hiện vẫn dùng `delay()` khoảng 1,75 giây; có thể chuyển sang không chặn sau khi có thử nghiệm phần cứng.
- Chưa bật xác minh chứng chỉ TLS: cần upload CA vào modem trước.
- Chưa biên dịch firmware trong môi trường này: hãy build bằng Arduino IDE/CLI trước khi nạp.
