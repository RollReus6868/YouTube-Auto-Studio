## YT Auto Studio 0.7.3

### Đăng bài AI
- **Sửa lỗi bài lên lịch sai ngày** (bài sau lấy ngày của bài trước, vd muốn 18/11 nhưng YouTube ghi 16/11). Nguyên nhân: YouTube chỉ ghi nhận ngày bạn chọn khi giờ cũng được chọn lại. Khung soạn bài nhớ giờ 00:00 của bài trước, nên tool thấy giờ đã đúng và bỏ qua bước chọn giờ, và YouTube giữ ngày cũ. Giờ tool luôn chọn lại giờ sau khi chọn ngày, và kiểm tra lại ngày giờ YouTube ghi trên bài.
- **Sửa lỗi bài Câu đố báo "Quá 20 giây vẫn chưa thấy Câu trả lời 1"**. Nguyên nhân: khung trình duyệt bên phải quá hẹp (khoảng 400 px) nên YouTube chuyển sang bố cục hẹp, nút "Câu hỏi" bị che mất một nửa. Khi tool chạy trong khung hẹp, khung giờ hiển thị YouTube như trên màn hình rộng 1100 px rồi thu nhỏ cho vừa, nên mọi nút đều bấm được. Bạn tự dùng khung thì vẫn hiển thị bình thường.
- **Giờ đăng tính theo giờ Việt Nam (GMT+7)**: giờ đăng mỗi ngày, khoảng ngày và ngày giờ của từng bài đều theo giờ Việt Nam, kể cả khi máy đặt múi giờ khác.

## YT Auto Studio 0.7.2

### Cộng đồng: thả tim
- **Sửa lỗi thả tim báo "Quá 20 giây vẫn chưa thấy Chuyển đổi tài khoản" ở mọi kênh.** Nguyên nhân: cửa sổ tool bị thu nhỏ trong lúc thả tim. Khi cửa sổ thu nhỏ, YouTube Studio trong khung bên phải ngừng vẽ nên menu đổi kênh và bộ lọc hộp thư không mở được. Giờ nếu bạn thu nhỏ cửa sổ khi tool đang chạy, tool tự mở lại cửa sổ và ghi chú trong nhật ký. Trước mỗi lần đổi kênh, tool cũng kiểm tra trang có đang được vẽ không và mở lại cửa sổ nếu cần. Muốn làm việc khác trong lúc tool chạy, hãy để cửa sổ khác che lên cửa sổ tool thay vì thu nhỏ.

### Gemini trên trình duyệt
- **Gemini chạy trong khung trình duyệt bên phải**, giống các tính năng khác, không mở cửa sổ riêng nữa. Viết xong, khung tự trở lại trang YouTube Studio trước đó. Nếu Google hỏi đồng ý, bạn tự chọn ngay trong khung, tool chờ tối đa 5 phút. Tắt "Chạy trong khung trình duyệt của tool" ở Cài đặt thì Gemini chạy trong cửa sổ riêng như trước. Nút "Mở Gemini" vẫn mở cửa sổ riêng để đăng nhập.

## YT Auto Studio 0.7.1

### Gemini trên trình duyệt
- **Sửa lỗi "Ô nhập của Gemini không nhận đủ lời nhắc (nhận 0/… ký tự)".** Nguyên nhân: Google hiện khung hỏi "Kết nối những ứng dụng Google này với Gemini?" che cả trang, tool vẫn gõ vào ô nhập bị che. Giờ tool nhận ra khung này trước khi gõ, mở cửa sổ Gemini, ghi rõ trong nhật ký và **chờ bạn tự chọn** (tối đa 5 phút), xong thì chạy tiếp. Tool không tự bấm đồng ý thay bạn. Hộp thoại chặn khác (điều khoản, chọn quốc gia…) cũng được chờ như vậy.
- **Sửa lỗi báo nhầm "Gemini đang hiện hộp thoại chặn (lớp phủ che ô nhập)".** Đó chỉ là gợi ý nhỏ "Giao việc cần làm" của Gemini. Tool tự tắt gợi ý này (phím Esc / bấm ra ngoài), kể cả khi nó hiện giữa lúc Gemini đang trả lời.

### Đăng bài AI
- **Kênh bị YouTube khoá đăng bài ("Channel owner needs to verify")**: tool báo lỗi ngay, ghi rõ chủ sở hữu kênh cần tự xác minh (YouTube Studio → Cài đặt → Kênh → Điều kiện sử dụng tính năng), đóng hộp thoại và **dừng các bài còn lại của kênh đó**. Trước đây mỗi bài chờ 45 giây rồi báo "không thấy dấu hiệu đăng xong". Tool không tự xác minh thay bạn.
- **Chọn ngày lên lịch bằng cách bấm ô ngày trong lịch** (như bạn tự làm), không còn chỉ gõ ngày vào ô nhập. Không bấm được thì mới gõ ngày như cũ.
- **Kiểm tra giờ YouTube ghi trên bài sau khi lên lịch**: đọc được cả "Scheduled for Nov 12, 2026, 12:00 AM" lẫn "00:00 12 thg 11, 2026". Bản 0.7.0 so sai định dạng nên bài đúng giờ cũng bị cảnh báo "khác giờ mong muốn", và có thể đọc nhầm giờ của bài khác trong danh sách. Nay nếu YouTube ghi giờ khác giờ bạn chọn, bài được đánh dấu lỗi kèm giờ YouTube ghi, để bạn sửa trong tab Đã lên lịch của kênh.

## YT Auto Studio 0.7.0

### Gemini trên trình duyệt (không cần API key)
- **Đăng bài AI** và **Gemini viết mô tả** (trang Đăng video) giờ mặc định dùng Gemini trên trình duyệt (gemini.google.com), không tốn tiền API. Tool mở một cửa sổ Gemini riêng bằng tài khoản Google ở trang Tài khoản, tự gõ yêu cầu, chờ Gemini trả lời rồi lấy chữ hoặc ảnh về. Cửa sổ này tách khỏi khung Studio, nên vẫn viết được trong lúc đang đăng video.
- Cài đặt → Gemini: chọn "Trình duyệt" (mặc định) hoặc "API key", chọn tài khoản Google dùng cho Gemini, nút "Mở Gemini" để đăng nhập hoặc kiểm tra. Có thêm tuỳ chọn "Dùng API khi trình duyệt lỗi".
- Vẽ ảnh bằng Gemini trên trình duyệt cần tài khoản Google đã đăng nhập. Nếu Gemini đòi đăng nhập, đồng ý điều khoản hay báo hết lượt, tool hiện cửa sổ Gemini và nút "Mở Gemini" để bạn xử lý.
- Trả lời bình luận (Cộng đồng) vẫn dùng API key như cũ.

### Tối ưu video
- **Tự tối ưu sau khi đăng không còn chen ngang việc khác.** Tool chỉ tự chạy khi rảnh hẳn: không có việc nào đang chạy hay xếp hàng, và bạn không thao tác trong 5 phút.
- Trang Tối ưu video có thêm thẻ "Tự tối ưu sau khi đăng": công tắc bật/tắt, danh sách video đang chờ kèm giờ sẽ chạy, nút "Chạy ngay" và "Bỏ khỏi hàng chờ".

### Đăng bài AI
- **Sửa lỗi không đổi được ngày tháng** của bài và của Từ ngày / Đến ngày. Ô chọn ngày và giờ giờ giống trang Đăng video (lịch kiểu Studio, giờ theo mốc 15 phút).

### Đăng video
- **Sửa được tiêu đề từng video** ngay trên thẻ video, có bộ đếm 100 ký tự và nút "Về tiêu đề gốc". Tiêu đề được lưu vào file .txt của video, quét lại vẫn giữ. Gemini viết mô tả cũng dùng tiêu đề mới.

## YT Auto Studio 0.6.3

### Đăng bài và Đăng bài AI
- **Sửa lỗi "Không chọn được giờ … (ô giờ đang là 12:00 AM)"** khi lên lịch bài đăng. Danh sách giờ của YouTube có lúc không nhận cú bấm chuột của tool. Tool giờ chờ danh sách mở xong rồi mới bấm và kiểm tra lại ô giờ. Nếu cú bấm không có tác dụng, tool tự chọn giờ bằng hai cách dự phòng, và nhật ký ghi rõ đã dùng cách nào.
- Đọc được giờ dạng mới của YouTube ("9:00 AM" có khoảng trắng hẹp).

## YT Auto Studio 0.6.2

### Đăng bài và Đăng bài AI
- **Sửa lỗi "Không thấy khung soạn bài ở tab Bài đăng".** Khung soạn bài vẫn hiện trên YouTube nhưng tool không nhận ra được, vì youtube.com chặn cách tool cài mã dò khung soạn bài (chế độ bảo mật Trusted Types). Lỗi này làm mọi bài (cả trang Đăng bài lẫn Đăng bài AI) không đăng được. Tool giờ không dùng cách bị chặn đó nữa. Ô chữ mới của YouTube ("Bạn đang nghĩ gì?") cũng đã được nhận ra.
- **Bài có giờ đăng đã qua** hiện dòng nhắc "Giờ đăng đã qua: bấm Đăng thì bài này được đăng ngay". Nếu muốn lên lịch thì đổi giờ trước khi bấm Đăng.

### Cộng đồng
- **"Lấy bình luận mới" và "Quét và thả tim" đều bật bộ lọc "Trạng thái phản hồi: Chưa phản hồi" trước khi đọc.** Tool chỉ đọc danh sách sau khi thấy bộ lọc này hiện trên Studio. Nếu Studio không nhận bộ lọc, tool tải lại hộp thư và thử lại một lần. Vẫn không được thì tool báo lỗi ở kênh đó và không đọc, không thả tim.
- "Quét và thả tim" giờ chỉ thả tim bình luận chưa phản hồi (trước đây xem cả bình luận kênh đã trả lời). Bình luận vừa thả tim mà rời khỏi danh sách "Chưa phản hồi" vẫn được tính là đã thả tim, tool không dừng nhầm.

## YT Auto Studio 0.6.1

### Đăng video
- **Sửa lỗi video lên lịch bị treo ở "Đang tải lên 100%".** Trước đây tool thấy chữ "Đã tải được 100%" là coi như xong, bấm Lên lịch rồi chuyển sang việc khác ngay. Lúc đó trình duyệt còn đang gửi phần cuối và chờ YouTube xác nhận, nên video bị kẹt ở 100% / "Đang chờ xử lý". Giờ tool chờ tới khi Studio hiện "Đã hoàn tất quá trình tải lên … Quá trình xử lý sẽ sớm bắt đầu" rồi mới bấm Lên lịch / Lưu.
- **Sửa lỗi hộp thoại tải lên tự biến mất khi đặt giờ lên lịch.** Ô giờ của Studio nằm trong một biểu mẫu chỉ có một ô nhập, nên bấm Enter ở đó có thể làm trang Studio tải lại và mất video đang tải. Giờ tool không bấm Enter ở ô giờ nữa, và trong lúc video đang tải lên thì tool chặn mọi lần trang Studio tự chuyển hoặc tải lại.
- Nếu hộp thoại tải lên vẫn biến mất giữa chừng, tool báo rõ ngay (video dừng ở bao nhiêu %, cần xoá bản nháp rồi đăng lại) thay vì báo "Quá 20 giây vẫn chưa thấy Lưu".

### Đăng bài AI (trang mới)
- **Gemini tự viết và đăng bài Cộng đồng.** Bạn chỉ chọn kênh, loại bài, số bài, khoảng ngày và giờ đăng. Gemini viết nội dung, tool lên lịch sẵn trên YouTube bằng "Lên lịch đăng bài", nên tới giờ không cần mở tool.
  - Loại bài: chữ, ảnh, thăm dò, câu đố (có đáp án đúng và giải thích), thăm dò ảnh. Chọn nhiều loại thì tool xoay vòng.
  - **Mỗi kênh một khung yêu cầu cho Gemini**: nội dung kênh, đối tượng, giọng văn, chủ đề nên viết hay nên tránh. Mỗi kênh có thể chọn ngôn ngữ riêng.
  - Ảnh: Gemini vẽ ảnh (cần key có quyền tạo ảnh), hoặc lấy ảnh chưa dùng trong thư mục ảnh của từng kênh, hoặc không dùng ảnh. Vẽ ảnh lỗi thì bài ảnh thành bài chữ, không dừng cả loạt.
  - Tool rải đều số bài vào các ngày và giờ đã chọn (mốc 15 phút, bỏ giờ đã qua). Có nút nhanh: hôm nay, 7 / 14 / 30 ngày, 2 hoặc 3 lần mỗi ngày.
  - **Duyệt trước khi đăng** (mặc định bật): xem, sửa chữ, sửa lựa chọn, đổi đáp án đúng, đổi giờ, viết lại hoặc xoá từng bài, rồi bấm "Đăng N bài". Tắt duyệt thì bấm một nút là Gemini viết và tool đăng luôn.
  - Tool nhớ các bài đã đăng của từng kênh và gửi cho Gemini để không viết lặp lại. Gemini cũng được biết tên các video gần đây của kênh (từ lần quét ở trang Tối ưu video).
  - Danh sách bài vẫn còn khi mở lại tool.

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
