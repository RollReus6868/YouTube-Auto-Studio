# YT Auto Studio

Tool desktop (Windows / macOS) cho nhiều kênh YouTube: đăng video theo mẫu mặc định, tối ưu video đã đăng (kèm bình luận ghim), đăng bài, thêm kênh và danh sách phát vào trang chủ các kênh, trả lời bình luận bằng Gemini (trang Cộng đồng).

- Video, tiêu đề, mô tả, thẻ, lịch, playlist, thumbnail: qua **YouTube Data API v3** (OAuth, chạy trên máy bạn). Cách lấy API xem trang **Hướng dẫn API** trong tool.
- Những việc API không làm được (tối ưu trong Studio, ghim bình luận, đăng bài, trang chủ kênh, hộp thư bình luận): tool thao tác trên **YouTube Studio ngay trong cửa sổ**. Mỗi tài khoản Google đăng nhập một lần ở trang **Tài khoản**, tool tự chuyển giữa các kênh. Tool không lưu mật khẩu.
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

```
YouTube-DangBai/
  videos/
    2026-10-28_ten-video/        tên bắt đầu bằng ngày để tool tự xếp lịch (có thể thêm giờ: 2026-10-28_19h00_ten)
      video.mp4                  bắt buộc
      thumbnail.jpg              tùy chọn, dưới 2 MB
      info.txt                   tùy chọn, ghi đè mẫu mặc định
      phude.vi.srt               tùy chọn
  posts/
    2026-10-29_19h00_bai-anh/    có giờ trong tên = lên lịch; chỉ có ngày = đăng ngay
      noidung.txt
      1.jpg 2.png ...            tối đa 10 ảnh, tỷ lệ 2:5 đến 5:2
    2026-10-30_tham-do/          noidung.txt + binhchon.txt          -> thăm dò văn bản
    2026-10-30_tham-do-anh/      noidung.txt + binhchon.txt + 1.jpg 2.jpg -> thăm dò ảnh
    2026-10-31_do-vui/           noidung.txt + cauhoi.txt            -> đố vui
    2026-11-01_gioi-thieu/       noidung.txt có dòng "Video: <URL>"  -> chia sẻ video
  da-dang/                       việc đã xong được chuyển vào đây
```

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

1. Vào [Google Cloud Console](https://console.cloud.google.com/), tạo dự án mới (ví dụ `tool-dang-youtube`).
2. **APIs & Services → Library**: tìm **YouTube Data API v3**, bấm **Enable**.
3. **APIs & Services → OAuth consent screen**: chọn **External**, điền tên app và email, thêm email của bạn vào **Test users**. Sau đó bấm **Publish app** (chuyển sang *In production*) để đăng nhập không hết hạn sau 7 ngày.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, loại **Desktop app**, tải file JSON.
5. Trong tool: **Cài đặt → Kết nối YouTube API → Nhập file JSON**, rồi **Đăng nhập kênh**. Google báo "ứng dụng chưa được xác minh" thì bấm **Nâng cao → Đi tới ... (không an toàn)**, vì đây là app của chính bạn.
6. Muốn video đăng lên được để Công khai: nộp đơn [YouTube API Services Audit](https://support.google.com/youtube/contact/yt_api_form) cho dự án này.

Gemini API key lấy ở [Google AI Studio](https://aistudio.google.com/apikey), dán vào **Cài đặt → Gemini API**.

## Lưu ý về API YouTube

- Video tải lên từ dự án Google Cloud **chưa qua kiểm duyệt** (YouTube API Services Audit) bị khóa ở chế độ Riêng tư.
- Hạn mức mặc định 10.000 đơn vị/ngày, mỗi video khoảng 1.600 đơn vị (khoảng 6 video/ngày).
- Để OAuth app ở "In production" để đăng nhập không hết hạn sau 7 ngày.

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
