## YT Auto Studio 0.4.2

Sửa lỗi Tối ưu video.

- **Sửa lỗi "Quá 20 giây vẫn chưa thấy mục Vị trí video":** trên Studio thật, một số chữ tiếng Việt (như "Vị trí video") được mã hóa khác cách thường gặp nên tool so chữ không khớp. Tool giờ chuẩn hóa chữ trước khi so, áp dụng cho mọi trang tool thao tác trên Studio và YouTube.
- **Một mục lỗi không làm hỏng cả video nữa:** nếu tool không làm được một mục (ví dụ danh sách phát, vị trí, màn hình kết thúc), tool bỏ qua mục đó, ghi cảnh báo và vẫn lưu các mục còn lại. Ảnh chụp của mục lỗi được lưu trong thư mục `loi-trang`. Chạy lại sẽ chỉ làm những mục còn thiếu.
- **Vị trí video:** nếu không có gợi ý đúng tên, tool trả lại vị trí cũ thay vì để chữ gõ dở trong ô.
- Kiểm tra từng mục của trang Chi tiết video, hộp thoại danh sách phát, màn hình kết thúc, trang xem video và danh sách Nội dung trên HTML thật của Studio.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.4.2-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
