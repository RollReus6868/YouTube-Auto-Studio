## YT Auto Studio 0.4.0

Làm việc với nhiều kênh qua YouTube Studio, theo đúng các thao tác bạn quay màn hình.

- **Tài khoản (bước 1):** đăng nhập từng tài khoản Google ngay trong tool, giống AI Automation Studio. Tool giữ trình duyệt thật của app, không giả trình duyệt khác. Danh sách kênh lấy từ menu "Chuyển đổi tài khoản". Tick các kênh để tool làm việc, tool tự chuyển kênh khi cần. Mật khẩu không bao giờ được lưu.
- **Tối ưu video:** quét video đã đăng của một kênh, đánh dấu video chưa tối ưu. Tool tối ưu theo mẫu:
  - danh sách phát, quảng cáo trả phí, nội dung AI, thẻ, vị trí, ngày quay, phối lại Shorts, màn hình kết thúc;
  - thích video, bình luận rồi **ghim**. Nếu chưa ghim được thì vẫn giữ bình luận và báo lại.
  Bạn soạn trước nội dung bình luận, có thể dùng `{tieu_de}`.
- **Mẫu mặc định:** thêm mục "Sau khi đăng: tối ưu bằng mẫu" để video đăng qua tool được tối ưu tự động.
- **Đăng bài:** đăng 6 loại bài lên tab Bài đăng của kênh: chữ, ảnh (tối đa 10), thăm dò văn bản, thăm dò hình ảnh, câu đố, chia sẻ video. Có thể đăng ngay hoặc **lên lịch**. Nội dung lấy từ thư mục `posts/`, xem HUONG-DAN.txt. Tool không đăng trùng bài đã có.
- **Trang chủ kênh:** dán link kênh mới và link danh sách phát, tick các kênh cũ. Tool thêm kênh vào "Kênh nổi bật", thêm "Danh sách phát đơn" (vị trí tùy chọn) rồi bấm Xuất bản.
- **Cộng đồng:** giờ chỉ dùng để trả lời bình luận, qua hộp thư bình luận của Studio (gồm bình luận dưới video, Shorts và bài đăng), lần lượt từng kênh. Gemini soạn trước, bạn duyệt, hoặc tool tự gửi lời cảm ơn.
- **Hướng dẫn API:** trang mới hướng dẫn từng bước lấy YouTube Data API và Gemini API, có nút mở thẳng trang cần làm.
- **Kết nối API theo từng kênh:** ở Cài đặt, chọn kênh trước khi đăng nhập. Tool kiểm tra bạn đã chọn đúng kênh trên trang Google.
- Icon mới cho tool.

Lần đầu dùng các chức năng mới: vào **Tài khoản** → **Đăng nhập**, đăng nhập Google trong khung bên phải, bấm **Xong, đóng lại**, rồi tick kênh.

Nếu tool bấm sai chỗ trên Studio, ảnh chụp và HTML của trang bị lỗi được lưu trong thư mục dữ liệu của tool (`loi-trang`). Gửi lại để sửa.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.4.0-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.

## Bản 0.3.0

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
