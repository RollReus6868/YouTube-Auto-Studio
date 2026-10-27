## YT Auto Studio 0.4.3

Sửa và thêm tính năng cho Tối ưu video.

- **Biết video nào đã tối ưu:** khi quét 10 video mới nhất, tool mở từng video (chỉ đọc, không sửa) để xem đã điền đủ theo mẫu chưa. Video đủ hiện **Đã tối ưu**; video còn thiếu hiện các nhãn **Thiếu: …** (ví dụ danh sách phát, thẻ, ngày quay, vị trí, thích, bình luận, ghim).
- **Danh sách phát tự điền:** ngoài các danh sách đã chọn trong mẫu, tool tự tích 3 danh sách phát đầu tiên hiện ra trong hộp thoại. Số lượng chỉnh được trong mẫu (0–5, đặt 0 để tắt).
- **Ngày quay:** tool gõ ngày vào ô "Nhập ngày"; nếu Studio không nhận, tool bấm chọn ngày trên lịch như người dùng.
- **Vị trí video:** kiểm lại cách chọn gợi ý trên HTML thật (gợi ý nằm sau dòng "Không có").
- **Thích, bình luận, ghim không còn báo thành công giả:** sau khi làm, tool tải lại trang xem video và chỉ báo thành công khi thấy thật (đã thích, có bình luận của kênh, có huy hiệu "đã ghim"). Nếu chưa được, video vẫn hiện **Thiếu: ghim** (hoặc thích, bình luận) để lần sau làm tiếp, kèm lý do (ví dụ đang đăng nhập nhầm kênh, video đang công chiếu, bình luận bị tắt).
- **Nhật ký ra file:** mọi dòng nhật ký được ghi vào `nhat-ky.txt` trong thư mục dữ liệu (nút **Mở thư mục dữ liệu**), cùng thư mục ảnh lỗi `loi-trang`, để gửi khi cần kiểm tra lỗi.
- Thao tác bấm nhanh hơn (bớt thời gian chờ sau mỗi lần bấm).

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.4.3-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
