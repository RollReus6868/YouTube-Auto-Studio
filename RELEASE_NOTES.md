## YT Auto Studio 0.4.1

Sửa lỗi và gọn giao diện theo góp ý sau khi dùng thử 0.4.0.

- **Sửa lỗi thẻ khi tối ưu video:** lỗi "Quá 20 giây vẫn chưa thấy thẻ …". Studio chỉ tạo thẻ khi bấm phím Enter, giờ tool bấm Enter sau mỗi thẻ (không được thì thử dấu phẩy).
- **Tối ưu video:**
  - chỉ quét **10 video mới nhất** của kênh;
  - thêm mục **Mô tả**: tool chỉ điền mô tả cho video **chưa có mô tả**, video đã có mô tả thì giữ nguyên. Dùng được `{tieu_de}`, `{link}`, `{ten_kenh}`.
- **Tài khoản:** mỗi kênh hiện **ảnh đại diện** (lấy từ menu chuyển kênh của YouTube).
- **Mẫu mặc định:** mỗi mẫu có đủ các mục Studio giống trang Tối ưu video (danh sách phát, quảng cáo trả phí, thẻ, vị trí, ngày quay, phối lại Shorts, bình luận, màn hình kết thúc, thích, bình luận ghim). Các mục này luôn hiện, lưu chung nút **Lưu mẫu**. Bật "Sau khi đăng: tối ưu bằng mẫu" để tool tự làm sau khi video công khai.
- **Giao diện gọn hơn:** các nút nhỏ lại và nằm ở **góc trên bên phải** mỗi trang. **Nhật ký** luôn nằm ở dưới cùng (dòng mới nhất ở cuối), có nút thu gọn.
- **Bỏ trang Bình luận** vì trùng với **Cộng đồng**. Trả lời bình luận giờ chỉ làm ở trang Cộng đồng, nên không còn nguy cơ trả lời một bình luận hai lần.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.4.1-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
