## YT Auto Studio 0.5.0

Đăng video không cần API YouTube nữa.

- **Đăng video bằng hộp thoại "Tải video lên" của YouTube Studio**, làm đúng các bước như clip hướng dẫn, trong cửa sổ chạy ngầm của tài khoản đã đăng nhập. Không cần Google Cloud, OAuth hay hạn mức API.
  - Tiêu đề lấy từ video.
  - Mô tả giữ đoạn mặc định của kênh, rồi cách một dòng và thêm mô tả của video.
  - Tải thumbnail lên, tích danh sách phát, chọn "Không dành cho trẻ em".
  - Bấm **Hiện thêm** để đặt các mục theo mẫu tối ưu của preset: quảng cáo trả tiền: Không; dùng AI: Có; thêm tiêu đề vào thẻ; ngày quay: hôm nay; vị trí: United States; không cho phối lại.
  - Màn hình kết thúc lấy từ video gần đây nhất.
  - Chọn chế độ hiển thị hoặc lên lịch, bấm "Vẫn xuất bản" nếu YouTube hỏi.
  - Tool chờ video tải lên xong 100% mới đóng.
- **Trang Đăng video:** có ô **Kênh đăng video**, chọn trong các kênh đã tick ở trang Tài khoản.
- **Gỡ bỏ:** phần "Kết nối YouTube API" trong Cài đặt và hướng dẫn tạo dự án Google Cloud. API Gemini vẫn giữ để viết mô tả và trả lời bình luận.
- Nếu một bước trong hộp thoại tải lên bấm trượt, tool lưu ảnh + HTML vào thư mục `loi-trang` để sửa nhanh.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.5.0-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
