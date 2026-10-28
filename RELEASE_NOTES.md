## YT Auto Studio 0.5.3

Sửa tiếp các lỗi trong nhật ký chạy thử 28/10: không chuyển được kênh, danh sách phát báo lỗi, treo sau khi xác minh danh tính.

### Nguyên nhân chính
Trên Windows, khi cửa sổ Studio chạy ngầm bị cửa sổ khác che (ví dụ cửa sổ chính của tool), Chromium coi nó là "đang ẩn" và ngừng vẽ trang. Lúc đó menu tài khoản và hộp thoại Danh sách phát của Studio không mở ra, và tool cũng không chụp được ảnh lỗi. Bản này tắt cơ chế đó, nên cửa sổ chạy ngầm luôn được vẽ.

### Tối ưu video
- **Chuyển kênh:** nếu menu tài khoản không mở, tool tải lại Studio và thử lại một lần. Vẫn không được thì tool chuyển kênh qua trang chọn kênh của YouTube, không cần mở menu. Khi lỗi, nhật ký ghi rõ menu đang hiện gì và trang có được vẽ không.
- **Danh sách phát:** nếu hộp thoại không mở, tool bấm lại một lần. Kênh có 1 hoặc 2 danh sách phát thì tool chọn đủ 1 hoặc 2 danh sách đó, không bắt buộc phải có 3.
- **Màn hình kết thúc:** trình chỉnh sửa đã có thành phần (dòng "Đăng ký: …", "Video: …", "Danh sách phát: …" trên dòng thời gian) thì tính là đã có, kể cả khi trình chỉnh sửa còn đang tải. Tool không báo lỗi trường hợp này nữa.
- Ảnh lỗi trong thư mục `loi-trang` giờ luôn kèm file HTML, kể cả khi không chụp được ảnh.

### Xác minh danh tính
- **Sửa lỗi treo ở "Đang xử lý. Vui lòng đợi":** Google mở một cửa sổ đăng nhập riêng để xác minh rồi báo kết quả về Studio. Trước đây tool mở trang đó ngay trong khung Studio nên Google không báo kết quả về được. Giờ tool mở đúng một cửa sổ Google riêng, xác minh xong cửa sổ tự đóng và Studio chạy tiếp. Bạn vào trang **Tài khoản**, chọn kênh, rồi xác minh lại một lần.

### Khác
- Nhật ký ghi số phiên bản mỗi lần mở tool.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.5.3-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
