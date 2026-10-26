## YT Auto Studio 0.3.0

Giai đoạn 3: trả lời bình luận dưới video bằng Gemini.

- **Trang Bình luận:** bấm **Lấy bình luận mới** (tool cũng tự kiểm tra mỗi 10 phút khi đang mở). Gemini soạn sẵn câu trả lời theo giọng văn trong Cài đặt và phân loại: khen, câu hỏi, góp ý, nhạy cảm, spam.
- **Duyệt tay (mặc định):** sửa câu trả lời rồi bấm **Gửi**, hoặc **Viết lại** / **Bỏ qua**.
- **Tự gửi:** chỉ tự gửi lời cảm ơn cho bình luận khen ngắn; câu hỏi, góp ý, nhạy cảm luôn chờ bạn duyệt.
- Tự bỏ qua bình luận có link, chứa từ bạn liệt kê, bình luận của chính kênh và bình luận kênh đã trả lời. Không trả lời lại hai lần.
- Giới hạn số trả lời mỗi giờ (Cài đặt), mỗi trả lời tốn 50 đơn vị hạn mức API.

## Bản 0.2.0

Giai đoạn 2: đăng video thật qua YouTube Data API.

- **Đăng nhập kênh** (Cài đặt → Kết nối YouTube API): nhập file OAuth client loại Desktop app, bấm **Đăng nhập kênh**, cho phép trong trình duyệt. Phiên đăng nhập lưu mã hóa trên máy.
- **Đăng video:** bấm **Đăng N video** hoặc **Đăng video này**. Tool tải lên (tải tiếp được khi rớt mạng), đặt thumbnail, thêm vào playlist (tự tạo nếu chưa có), thêm phụ đề .srt, lên lịch theo mẫu. Xong thì chuyển thư mục vào `da-dang/` kèm `ket-qua.txt` có link video.
- **Không đăng trùng:** thư mục đã đăng nhưng chưa chuyển được vẫn bị chặn.
- **Gemini viết mô tả:** mở một video, bấm **Gemini viết mô tả**, sửa nếu cần rồi lưu vào info.txt.
- Báo lỗi rõ ràng khi hết hạn mức API, phiên đăng nhập hết hạn, kênh chưa xác minh (thumbnail), hoặc video bị khóa Riêng tư do dự án chưa qua kiểm duyệt API.
- Sửa: video không có thẻ bị báo "còn biến chưa điền" vì biến `{hashtag}` rỗng.
- Sửa: trang Cài đặt xóa mất chữ đang gõ.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.3.0-windows-setup.exe` |
| Mac chip Apple (M1 trở lên) | `YTAutoStudio-0.3.0-mac-arm64.zip` |
| Mac chip Intel | `YTAutoStudio-0.3.0-mac-x64.zip` |

Cách mở lần đầu xem ở README.
