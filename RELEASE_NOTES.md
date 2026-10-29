## YT Auto Studio 0.6.0

### Tối ưu video
- **Gộp quét và tối ưu thành một nút.** Bấm "Quét và tối ưu" (một kênh) hoặc "Quét và tối ưu toàn bộ" (mọi kênh đã tick): tool quét xong kênh nào thì tối ưu luôn các video còn thiếu của kênh đó, không phải bấm quét rồi bấm tối ưu nữa. Nút "Tối ưu lại đã chọn" vẫn còn để làm lại vài video mà không quét.
- **Video Công chiếu giờ được thích, bình luận và ghim**, kể cả khi chưa tới giờ công chiếu. Video lên lịch thường (còn riêng tư) vẫn chờ tới khi công khai.

### Cộng đồng
- **Nút "Quét và thả tim":** tool mở hộp thư bình luận của từng kênh đã tick (mọi bình luận, kể cả bình luận đã trả lời) và thả tim cho bình luận của người xem chưa có tim. Tool không trả lời gì.
  - Bình luận đã có tim thì không bấm, vì bấm lại là bỏ tim. Tool cũng nhớ các bình luận đã thả tim để lần sau không bấm lại.
  - Nếu bấm 2 lần mà trang không cho thấy tim đã được thả, tool dừng ngay để không bấm nhầm.
  - Mỗi lần xem tối đa 100 bình luận mới nhất mỗi kênh. Bấm Dừng để dừng giữa chừng.

## YT Auto Studio 0.5.9

### Đăng video
- **Sửa lỗi "Đã bấm Lưu nhưng hộp thoại tải lên không đóng" khi lên lịch.** Khi bạn lên lịch lúc Studio còn đang kiểm tra video, Studio hiện bảng "Chúng tôi vẫn đang kiểm tra nội dung của bạn" chỉ có nút "Đã hiểu". Giờ tool tự bấm "Đã hiểu" rồi chờ hộp thoại tải lên đóng.

## YT Auto Studio 0.5.8

### Cộng đồng
- **Sửa lỗi kênh đã bỏ tick vẫn bị quét và trả lời.** Kênh bỏ tick ở trang Cộng đồng hoặc trang Tài khoản giờ không bị đọc hộp thư, không tự trả lời, không gửi bằng "Gửi hết", và bình luận của kênh đó cũng ẩn khỏi danh sách.
- Trước khi gửi, tool kiểm tra Studio có đang ở đúng kênh của bình luận không. Nếu sai kênh thì không gửi.

### Đăng video
- **Chế độ hiển thị riêng cho từng video:** mở thẻ video, chọn ở ô "Chế độ hiển thị". Có các lựa chọn: Theo mẫu, Riêng tư, Không công khai, Công khai, Công khai · Công chiếu ngay, Lên lịch.
  - Khi chọn Lên lịch, bạn chọn ngày giờ và có thể tick "Công chiếu".
  - Video có giờ riêng không chiếm khung giờ trong lịch của mẫu.
  - Tool nhớ lựa chọn này cho tới khi video được đăng.

- **Tải video lên:**
  - Tool không tự giới hạn tốc độ tải lên. Tool cũng giảm số lần đọc tiến độ (2 giây một lần thay vì 1 giây) để trang Studio đỡ bận.
  - Cứ 30 giây, nhật ký ghi tốc độ tải lên (MB/s) và thời gian còn lại, để bạn so với khi tải tay trên Chrome.

### Gemini viết mô tả
- **Ô "Yêu cầu của bạn cho Gemini"** trong hộp thoại Gemini viết mô tả, ví dụ "viết 3 đoạn bằng tiếng Anh, cuối mời đọc ebook". Bấm "Viết theo yêu cầu này", Gemini sẽ làm theo yêu cầu của bạn trước.
- Yêu cầu mặc định nằm ở **Cài đặt → Mô tả video**. Trong hộp thoại cũng có nút "Dùng làm mặc định".

## YT Auto Studio 0.5.7

### Tối ưu video
- **Sửa lỗi video công chiếu / đã lên lịch:** sau khi video đã công chiếu xong hoặc đã công khai, tool vẫn báo "Video đang Công chiếu / Đã lên lịch" và không thích, bình luận, ghim. Nguyên nhân là tool dùng chế độ hiển thị cũ từ lần quét trước. Giờ lúc tối ưu, tool đọc lại chế độ hiển thị ngay trên trang Chi tiết video và cập nhật lại dòng của video.

### Cộng đồng
- **Nhanh hơn nhiều:**
  - Mỗi kênh chỉ chuyển kênh một lần: tool đọc hộp thư, Gemini soạn 4 bình luận cùng lúc, rồi gửi ngay trên hộp thư đang mở.
  - Các lần gửi cách nhau 2–5 giây thay vì 20–60 giây như trước.
- **Nút "Gửi hết (N)":** gửi tất cả trả lời đang hiện, đúng chữ bạn đã sửa trên từng thẻ. Mỗi kênh chỉ mở hộp thư một lần.
- **Nút Dừng dừng thật:**
  - Tool dừng ngay việc đang làm, kể cả các trả lời đang xếp hàng gửi.
  - Tool không tự lấy bình luận mỗi 10 phút nữa cho tới khi bạn bấm "Lấy bình luận mới" hoặc "Bật lại tự động".
  - Nút Dừng hiện cả lúc tool đang gửi trả lời.

## YT Auto Studio 0.5.6

Sửa tiếp lỗi đăng video "Bạn đã có quyền sử dụng tính năng này rồi. Hãy thử làm mới trang".

### Nguyên nhân
Ảnh và HTML tool lưu lúc lỗi cho thấy kênh **đã có** quyền đăng video dài. Nhưng tool chọn file ngay khi hộp thoại tải lên vừa hiện, và lúc đó trang Studio đang **bị ẩn, không được vẽ**. Khả năng cao là Studio chưa đọc xong quyền của kênh nên tưởng kênh chưa có quyền, rồi hiện hộp thoại này.

### Đã sửa
- Tool chọn file như người thật: chờ hộp thoại tải lên mở xong rồi bấm nút **"Chọn tệp"**. Lần đầu tool chờ 2,5 giây, mỗi lần thử lại chờ lâu hơn (6, 10, 15 giây).
- Trước khi chọn file, tool kiểm tra trang Studio có đang được vẽ không. Nếu cửa sổ tool đang thu nhỏ, tool tự mở lại cửa sổ (không cướp bàn phím) và ghi vào nhật ký.
- Nếu bạn thu nhỏ cửa sổ khi tool đang chạy, nhật ký sẽ nhắc. Để cửa sổ khác che lên thì vẫn được, chỉ đừng thu nhỏ.

### Cài đặt
- Sửa lỗi chữ vừa gõ trong Cài đặt (ví dụ phần mô tả mặc định) đôi khi bị xoá mất nếu gõ ngay sau khi bấm "Lưu cài đặt".

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
