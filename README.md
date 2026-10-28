# YT Auto Studio

Tool desktop (Windows / macOS) cho nhiều kênh YouTube: đăng video theo mẫu mặc định, tối ưu video đã đăng (kèm bình luận ghim), đăng bài, thêm kênh và danh sách phát vào trang chủ các kênh, trả lời bình luận bằng Gemini (trang Cộng đồng).

- Mọi việc trên YouTube (đăng video, tối ưu trong Studio, ghim bình luận, đăng bài, trang chủ kênh, hộp thư bình luận): tool thao tác trên **YouTube Studio** trong cửa sổ chạy ngầm, như bạn tự bấm. Video đăng bằng chính hộp thoại **Tải video lên** của Studio, không cần Google Cloud / YouTube Data API. Mỗi tài khoản Google đăng nhập một lần ở trang **Tài khoản**, tool tự chuyển giữa các kênh. Tool không lưu mật khẩu.
- Gemini (viết mô tả, trả lời bình luận): cần Gemini API key, xem trang **Hướng dẫn** trong tool.
- Giao diện theo phong cách [Youwee](https://github.com/vanloctech/youwee) (MIT).

## Cài đặt

Tải file ở trang [Releases](https://github.com/RollReus6868/YouTube-Auto-Studio/releases/latest):

| Máy | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-<phiên bản>-windows-setup.exe` |
| Mac chip Apple | `YTAutoStudio-<phiên bản>-mac-arm64.zip` |
| Mac chip Intel | `YTAutoStudio-<phiên bản>-mac-x64.zip` |

**Windows:** SmartScreen báo "Unknown publisher" vì tool chưa ký số. Bấm **More info → Run anyway**.

**macOS:** giải nén, kéo `YTAutoStudio.app` vào Applications, mở lần đầu sẽ bị chặn: vào **System Settings → Privacy & Security → Open Anyway**. Nếu vẫn báo "bị hỏng", chạy trong Terminal: `xattr -dr com.apple.quarantine /Applications/YTAutoStudio.app`.

Các bản sau tự cập nhật: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

## Thư mục đầu vào

### Video (trang Đăng video)

Chọn **một thư mục** ở trang Đăng video. Mỗi video là một file, ảnh thumbnail **cùng tên** nằm cạnh. Không cần thư mục con, không cần info.txt:

```
Video cần đăng/
  Bí ẩn rừng sâu tập 1.mp4       video; tiêu đề = tên file
  Bí ẩn rừng sâu tập 1.jpg       thumbnail cùng tên (.jpg .jpeg .png .webp), dưới 2 MB
  Bí ẩn rừng sâu tập 1.vi.srt    tùy chọn: phụ đề (.srt / .vi.srt / .en.srt ...)
  Bí ẩn rừng sâu tập 1.txt       tùy chọn: mô tả riêng (nút "Gemini viết mô tả" lưu vào đây)
  Hậu trường.mov
  Hậu trường.png
  da-dang/                       tool chuyển video + ảnh + file kèm theo vào đây sau khi đăng (kèm "<tên>.ket-qua.txt")
```

Mô tả, thẻ, danh sách phát, chế độ hiển thị và lịch đăng lấy từ **Mẫu mặc định**. Chế độ hiển thị giống bước cuối của hộp thoại tải lên trong Studio: **Lưu hoặc xuất bản** (Riêng tư / Không công khai / Công khai, có thể **Đặt ở chế độ Công chiếu ngay**) hoặc **Lên lịch** (ngày, giờ theo mốc 15 phút, **Đặt làm video Công chiếu**; nhiều video thì cách nhau N giờ hoặc theo khung giờ mỗi ngày). File `.txt` cùng tên viết như info.txt (`Tiêu đề:`, `Thẻ:`, `Giờ đăng:`, `Hiển thị:`, rồi `---` và mô tả) để ghi đè riêng cho video đó.

Kiểu cũ vẫn đọc được: thư mục con chứa file video (kèm `thumbnail.jpg`, `info.txt`), hoặc `videos/2026-10-28_ten-video/` trong thư mục gốc.

### Thư mục gốc (trang Đăng bài)

```
YouTube-DangBai/
  posts/
    2026-10-29_19h00_bai-anh/    có giờ trong tên = lên lịch; chỉ có ngày = đăng ngay
      noidung.txt
      1.jpg 2.png ...            tối đa 10 ảnh, tỷ lệ 2:5 đến 5:2
    2026-10-30_tham-do/          noidung.txt + binhchon.txt          -> thăm dò văn bản
    2026-10-30_tham-do-anh/      noidung.txt + binhchon.txt + 1.jpg 2.jpg -> thăm dò ảnh
    2026-10-31_do-vui/           noidung.txt + cauhoi.txt            -> đố vui
    2026-11-01_gioi-thieu/       noidung.txt có dòng "Video: <URL>"  -> chia sẻ video
  da-dang/                       bài đã đăng được chuyển vào đây
```

Chưa chọn thư mục video riêng thì trang Đăng video dùng thư mục gốc.

### Bài đăng (tab Bài đăng của kênh)

Tool mở `youtube.com/channel/<UC…>/posts` bằng tài khoản Google của kênh và đăng như người dùng. Loại bài tự đoán theo file trong thư mục, hoặc ghi rõ ở phần đầu `noidung.txt`:

```
Loại: thăm dò ảnh             văn bản | ảnh | thăm dò | thăm dò ảnh | đố vui | video
Giờ đăng: 2026-10-30 08:00    ghi đè giờ trong tên thư mục; để trống = đăng ngay
Video: https://youtu.be/xxxxxxxxxxx
Kênh: @tenkenh                bỏ trống = kênh chọn ở trang Đăng bài
---
Bạn thích bìa nào cho tập tiếp theo?
```

- `binhchon.txt`: mỗi dòng một lựa chọn (2–4). Thăm dò văn bản tối đa 65 ký tự mỗi dòng; thăm dò ảnh tối đa 36 ký tự, ảnh `1.jpg` cho dòng 1, `2.jpg` cho dòng 2 (hoặc viết `anh3.jpg | Bìa C`).
- `cauhoi.txt` (đố vui): mỗi dòng một câu trả lời (2–4), dấu `*` trước câu đúng duy nhất, `Đa-vít | 3.jpg` để gắn ảnh, dòng `Giải thích: …` tùy chọn. Câu hỏi là nội dung `noidung.txt`.
- Trước khi đăng, tool xem các bài ĐÃ ĐĂNG / ĐÃ LÊN LỊCH: có bài trùng chữ thì không đăng lại. Đăng xong, thư mục chuyển vào `da-dang/` kèm `ket-qua.txt`.

Ví dụ `info.txt`:

```
Tiêu đề: {ten_video} | Tập {so_tap}
Thẻ: phim hay, review
Giờ đăng: 2026-10-28 19:00
Hiển thị: công khai
Preset: Shorts
Khách mời: Lan
---
Phần mô tả viết từ đây. Dòng "Khách mời" ở trên dùng được thành biến {khach_moi}.
```

Biến dùng trong mẫu: `{ten_video}` `{tieu_de}` `{so_tap}` `{ngay}` `{ten_kenh}` `{hashtag}` `{playlist}` và mọi khóa trong info.txt.

## Kết nối kênh YouTube (làm một lần)

1. Trang **Tài khoản**: thêm tài khoản Google, đăng nhập trong khung Studio, tick các kênh tool được dùng.
2. Trang **Đăng video**: chọn kênh ở ô **Kênh đăng video**. Tool mở hộp thoại tải lên của Studio, điền tiêu đề, mô tả (nối sau mô tả mặc định của kênh), hình thu nhỏ, danh sách phát, các mục trong **Hiện thêm** theo **Mẫu Studio** của mẫu mặc định, màn hình kết thúc, chế độ hiển thị hoặc lịch đăng, rồi chờ tải lên xong.
3. Kênh chưa xác minh số điện thoại thì không đặt được hình thu nhỏ: xác minh tại [youtube.com/verify](https://youtube.com/verify). YouTube giới hạn số video tải lên mỗi ngày; chạm giới hạn thì tool dừng hàng đợi.
4. Video dài hơn 15 phút: nếu Studio hiện **"Bạn đã hoàn tất… Hãy thử làm mới trang"**, tool bấm **Đã hiểu**, làm mới Studio và chọn lại file (tối đa 2 lần). Nếu Google đòi **xác minh danh tính**, tool dừng và báo; bạn tự xác minh trong khung Studio ở trang **Tài khoản** rồi đăng lại. Tool không tự xác minh.

Gemini API key lấy ở [Google AI Studio](https://aistudio.google.com/apikey), dán vào **Cài đặt → Gemini API**.

## Dữ liệu và nhật ký

Cài đặt, khóa (đã mã hóa) và phiên đăng nhập Studio nằm ở `%APPDATA%\YTAutoStudio` (Windows) hoặc `~/Library/Application Support/YTAutoStudio` (macOS). Lỗi khi khởi động ghi vào `error.log` trong thư mục đó. Nhật ký đầy đủ ghi vào `nhat-ky.txt` (quá 2 MB thì chuyển thành `nhat-ky.old.txt`), ảnh + HTML trang lúc lỗi nằm trong `loi-trang/`. Mở nhanh thư mục này bằng nút **Mở thư mục dữ liệu** ở trang Nhật ký.

## Phát triển

```bash
npm install && npm --prefix ui install
npm run build:ui            # giao diện -> ui_dist (được commit để CI không phải build)
npm start                   # chạy app
npm test                    # kiểm thử phần xử lý + tự cập nhật
xvfb-run -a node tests/e2e-app.js   # chạy app thật với Studio giả lập
```
