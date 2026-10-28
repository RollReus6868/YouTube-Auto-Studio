## YT Auto Studio 0.5.5

Theo dõi tool chạy ngay trong khung trình duyệt, mô tả mặc định cho mọi video, Gemini viết mô tả theo kịch bản, và sửa lỗi đăng video dài.

### Chạy trong khung trình duyệt của tool
- Mọi thao tác tự động (đăng video, tối ưu, thích / bình luận / ghim, đăng bài…) giờ chạy ngay trong khung trình duyệt bên phải để bạn theo dõi. Khi tool đang chạy, khung hiện ở mọi trang kèm dòng "Tool đang chạy: …".
- Lúc tool đang chạy, bạn chỉ xem, đừng bấm vào khung. Các nút đổi tài khoản / kênh của khung tạm ẩn.
- Các việc chạy lần lượt từng việc một. Muốn chạy ngầm như trước (nhiều tài khoản cùng lúc), tắt "Chạy trong khung trình duyệt của tool" trong **Cài đặt**.

### Đăng video
- **Sửa lỗi "Bạn đã có quyền sử dụng tính năng này rồi. Hãy thử làm mới trang"** (video dài, kênh vừa xác minh). Tool thử lần lượt 3 cách:
  1. Tải lại Studio.
  2. Xoá bộ nhớ đệm của Studio, vẫn giữ đăng nhập.
  3. Mở trang Tính năng của kênh để YouTube cập nhật quyền.
  
  Mỗi lần thử, tool chờ lâu hơn trước khi chọn lại file. Nếu vẫn lỗi thì có thể Google cần vài giờ sau khi xác minh: bạn thử lại sau.
- **Phần mô tả mặc định:** trong **Cài đặt → Mô tả video**, bạn viết vài dòng mà video nào đăng lên cũng có, ví dụ link donate hoặc ebook. Bạn chọn để phần Gemini viết (hoặc mô tả riêng của video) nằm **trên** hay **dưới** phần mặc định.
  - Khi có phần mặc định, tool thay mô tả Studio tự điền bằng mô tả ghép, nên không bị lặp dòng.
  - Trang Đăng video hiện đúng "Mô tả sẽ đăng".
- **Gemini viết mô tả theo kịch bản:**
  - Đặt file kịch bản cạnh video, ví dụ `Tên video.kich-ban.txt` hoặc `Tên video - kịch bản.docx`. Tool nhận .txt, .md và .docx.
  - Hoặc bấm "Đính kèm kịch bản" để chọn file bằng tay. Bản này nhận thêm .srt.
  - Gemini viết mô tả bám đúng nội dung kịch bản. File kịch bản được chuyển vào `da-dang` cùng video.

### Tối ưu video
- **Quét bỏ qua video đã tối ưu ở lần trước:** video đã có nhãn xanh "Đã tối ưu" không bị mở lại để đọc, nên quét nhanh hơn nhiều.
- Muốn đọc lại một video, bấm "Quét lại" dưới nhãn của video đó.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.5.5-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
