## YT Auto Studio 0.5.1

Tối ưu video chính xác hơn, thêm nút Quét toàn bộ, sửa lỗi đăng video.

### Tối ưu video
- **Danh sách phát:** video đã có danh sách phát thì tính là xong, không mở hộp thoại, không báo vàng nữa. Kênh chưa có danh sách phát nào cũng không còn bị chờ 20 giây.
- **Chỉ làm mục còn thiếu:** khi tối ưu, tool chỉ làm các mục màu vàng mà lần quét báo thiếu. Mục đã điền sẵn thì bỏ qua và tính là thành công.
- **Quét chính xác hơn,** kiểm trên HTML thật của Studio tiếng Việt và tiếng Anh. Tool đọc thêm cả màn hình kết thúc. Video đang xử lý thì báo rõ ngay, không chờ hết giờ.
- **Ghim bình luận:** kênh không ghim được thì ghi "đã thích và bình luận - chưa ghim" và tính là **Đã tối ưu**. Tool thử ghim lại một lần sau khi tải lại trang.
- **Bình luận** trên video có phần phát lại trò chuyện trực tiếp không còn bị dừng giữa chừng.
- **Hộp thoại "Xác minh danh tính của bạn":** tool dừng và báo bạn tự xác minh trong trang Tài khoản. Tool không bấm gì trong hộp thoại đó.
- **Nút mới "Quét toàn bộ":** quét 2 video mới nhất của mọi kênh đang tick, xếp kết quả theo từng kênh. Có nút tối ưu các mục còn thiếu cho tất cả kênh hoặc từng kênh.

### Đăng video
- **Sửa lỗi "Quá 60 giây vẫn chưa thấy trang Chi tiết":** với video dài trên 15 phút, YouTube có thể bật hộp thoại "Bạn đã hoàn tất – Hãy thử làm mới trang". Giờ tool bấm "Đã hiểu", làm mới trang rồi chọn file lại (tối đa 2 lần).
- **Chỉ cần một thư mục:** để video và thumbnail **cùng tên** trong một thư mục, ví dụ `Tên video.mp4` + `Tên video.jpg`. Tên file là tiêu đề. Không bắt buộc tạo thư mục con hay info.txt. Video đăng xong được chuyển vào `da-dang`.
- **Chế độ hiển thị đầy đủ như Studio:** Riêng tư / Không công khai / Công khai, "Đặt ở chế độ Công chiếu ngay", và Lên lịch theo đúng kiểu của YouTube: chọn ngày trên lịch, giờ theo bước 15 phút, nút Múi giờ, "Đặt làm video Công chiếu".
- Chạy được với Studio tiếng Việt và tiếng Anh.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.5.1-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
