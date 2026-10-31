# Bản sửa thử nghiệm: lệnh còi và kết nối

Đây là bản sửa từ ZIP bạn cung cấp. Chưa biên dịch firmware, chưa build/deploy
website, chưa kiểm thử trên modem EG800K hoặc bo mạch thật. Không dùng bản này
làm chức năng bảo vệ an toàn duy nhất; kiểm thử khi xe đứng yên.

## Các thay đổi

- Telemetry của firmware mới mang nhãn `alarm-ack-v1`. Lệnh còi dùng thời điểm
  yêu cầu làm ID và giữ trên server đến khi nhận xác nhận đúng ID hoặc hết hạn
  120 giây. Firmware ghi ID gần nhất vào NVS trước khi kích GPIO, tránh kêu
  lặp khi mất ACK hoặc khởi động lại. Nếu mất điện ngay giữa lúc ghi ID và kích
  GPIO, lệnh đó có thể không kêu. Đây là đánh đổi, không bảo đảm 100%.
- ACK cũ không được xóa lệnh mới. Firmware cũ vẫn được server trả lệnh theo cơ
  chế cũ xóa ngay khi gửi, nhưng ACK cũ không mang ID không còn ghi xác nhận.
  Phải nâng cấp firmware để có đầy đủ cơ chế mới.
- Đọc trọn dòng `+QHTTPPOST` và đợi kết quả `+QHTTPREAD` trước khi dùng phản
  hồi. Không khẳng định đã thử trên modem.
- Xử lý tín hiệu `CSQ=99` thành không xác định thay vì từ chối telemetry.
- Không phát lệnh AT khác khi đang chờ kết quả SMS.
- Web gọi đó là xác nhận kích hoạt GPIO, không khẳng định có âm thanh thật.

## Triển khai

1. Sao lưu mã web, firmware, cấu hình và CSDL hiện tại. Đây không phải bản đã
   được triển khai. Xác nhận phiên bản Arduino ESP32, loại bo và chân còi theo
   sơ đồ, không đổi dây hoặc nối ba chân GPIO vào nhau.
2. Thử build web trong môi trường phát triển hiện có (`pnpm install`, sau đó
   `pnpm test`, `pnpm run build`). Bộ test gốc có một bài tìm firmware ở đường
   dẫn ngoài ZIP, cần cập nhật đường dẫn test hoặc đặt bản firmware vào đúng
   chỗ trước khi chạy. Chỉ deploy qua quy trình của bạn sau khi xem kỹ thay đổi.
   Bản này không thêm migration CSDL.
3. Triển khai web thử nghiệm trước. Trong giai đoạn chuyển tiếp firmware cũ vẫn
   dùng giao thức cũ, xác nhận của nó không còn được ghi như trước.
4. Sao lưu bản `.ino` cũ, mở file `.ino` mới trong Arduino IDE, chọn đúng bo và
   phiên bản lõi ESP32 bạn đã dùng, biên dịch trước khi nạp. Firmware mới không
   điều khiển còi qua web cũ vì web cũ không trả ID lệnh. Cần cả hai bản mới.
   Không dùng lệnh `clear-flash` để thử, vì nó xóa cấu hình ghép đôi.
5. Trên bàn thử, kiểm tra tiếng bíp khi khởi động, telemetry và nút còi; thử
   mất mạng, kết nối lại, bấm lại sau 120 giây và nguồn ngoài. Quan sát Serial
   115200. Xác nhận thực tế âm thanh và nguồn, không chỉ dựa vào log GPIO.

Các phép thử mã nguồn/SQLite có thể chạy bằng
`node --test tests/remote-alarm-patch.test.mjs`; chúng không giả lập modem,
Cloudflare D1, hệ thống điện hay còi thực tế.

## Những điều còn tồn tại

- Ba chân GPIO 5/6/7, mức kích còi, mạch công suất và nguồn được giữ nguyên
  vì chưa có sơ đồ mạch. Cần xác nhận trước khi thử.
- Code cũ vẫn chứa thông tin ghép đôi, có thể in token ra Serial và chưa xác
  minh chứng chỉ HTTPS. Không chia sẻ log hoặc ZIP công khai; thay token/mã đã
  lộ và xử lý các rủi ro này trước khi dùng thật.
- Màn hình real-status cũ có thể coi thiết bị hoạt động trong vòng một giờ là
  gần đây, không phải bằng chứng online thời gian thực.
- Chưa sửa toàn bộ lỗi tiềm ẩn, chưa kiểm chứng chống sụt nguồn, GPS, BLE,
  SMS, thời gian đáp ứng và tương thích các phiên bản Arduino ESP32.
