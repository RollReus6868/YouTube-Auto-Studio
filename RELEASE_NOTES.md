## YT Auto Studio 0.2.0

Giai đoạn 2: đăng video thật qua YouTube Data API.

- **Đăng nhập kênh** (Cài đặt → Kết nối YouTube API): nhập file OAuth client loại Desktop app, bấm **Đăng nhập kênh**, cho phép trong trình duyệt. Phiên đăng nhập lưu mã hóa trên máy.
- **Đăng video:** bấm **Đăng N video** hoặc **Đăng video này**. Tool tải lên (tải tiếp được khi rớt mạng), đặt thumbnail, thêm vào playlist (tự tạo nếu chưa có), thêm phụ đề .srt, lên lịch theo mẫu. Xong thì chuyển thư mục vào `da-dang/` kèm `ket-qua.txt` có link video.
- **Không đăng trùng:** thư mục đã đăng nhưng chưa chuyển được vẫn bị chặn.
- **Gemini viết mô tả:** mở một video, bấm **Gemini viết mô tả**, sửa nếu cần rồi lưu vào info.txt.
- Báo lỗi rõ ràng khi hết hạn mức API, phiên đăng nhập hết hạn, kênh chưa xác minh (thumbnail), hoặc video bị khóa Riêng tư do dự án chưa qua kiểm duyệt API.
- Sửa: video không có thẻ bị báo "còn biến chưa điền" vì biến `{hashtag}` rỗng.
- Sửa: trang Cài đặt xóa mất chữ đang gõ.

Đang dùng bản 0.1.0: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.2.0-windows-setup.exe` |
| Mac chip Apple (M1 trở lên) | `YTAutoStudio-0.2.0-mac-arm64.zip` |
| Mac chip Intel | `YTAutoStudio-0.2.0-mac-x64.zip` |

Cách mở lần đầu xem ở README.
