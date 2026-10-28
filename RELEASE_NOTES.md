## YT Auto Studio 0.5.2

Sửa các lỗi khi tối ưu nhiều kênh liên tiếp (theo nhật ký chạy thử ngày 28/10).

### Tối ưu video
- **Sửa lỗi "Quá 20 giây vẫn chưa thấy Chuyển đổi tài khoản":** lỗi này không do giao diện từng kênh. Nó xảy ra ở kênh ngay sau một kênh vừa thích và bình luận xong. Khi đó cửa sổ chạy ngầm bị ẩn đi, và trên Windows cửa sổ ẩn không vẽ trang nên menu của Studio không mở. Giờ cửa sổ chạy ngầm luôn mở ở dạng trong suốt (bạn không thấy, không bấm nhầm được), nên chuyển kênh không bị kẹt nữa.
- **Sửa lỗi "Quá 20 giây vẫn chưa thấy hộp thoại Danh sách phát"** ở kênh ngay sau kênh bị lỗi chuyển kênh. Nguyên nhân giống lỗi trên và đã sửa cùng lúc.
- **Không còn đăng bình luận trùng:** tool chờ các bình luận cũ tải xong rồi mới kiểm tra xem kênh đã bình luận chưa.
- **Bỏ cảnh báo thừa** "Đã bấm Bình luận nhưng không thấy…" khi tải lại trang đã thấy bình luận.

### Lưu ý
- Lúc 10:31 kênh **Dark Bible Stories** bị Google hỏi "Xác minh danh tính của bạn". Đây là yêu cầu thật của Google nên tool không tự làm thay. Nếu hộp thoại này còn hiện, bạn mở trang **Tài khoản** trong tool, xác minh một lần rồi chạy lại.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.5.2-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
