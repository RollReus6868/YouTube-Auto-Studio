# YT Auto Studio

Tool desktop (Windows / macOS) giúp đăng video YouTube theo mẫu mặc định, đăng bài cộng đồng và trả lời bình luận bằng Gemini.

- Video, tiêu đề, mô tả, thẻ, lịch, playlist, thumbnail: qua **YouTube Data API v3** (OAuth, chạy trên máy bạn).
- Bài cộng đồng và bình luận tab Cộng đồng: API không hỗ trợ, nên tool thao tác trên **YouTube Studio nhúng trong cửa sổ** (bạn tự đăng nhập, tool không lưu mật khẩu).
- Giao diện theo phong cách [Youwee](https://github.com/vanloctech/youwee) (MIT).

## Cài đặt

Tải file ở trang [Releases](https://github.com/RollReus6868/youtube-auto-studio/releases/latest):

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
    2026-10-29_bai-1/
      noidung.txt
      anh1.jpg ...               tối đa 10 ảnh
  da-dang/                       việc đã xong được chuyển vào đây
```

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

## Lưu ý về API YouTube

- Video tải lên từ dự án Google Cloud **chưa qua kiểm duyệt** (YouTube API Services Audit) bị khóa ở chế độ Riêng tư.
- Hạn mức mặc định 10.000 đơn vị/ngày, mỗi video khoảng 1.600 đơn vị (khoảng 6 video/ngày).
- Để OAuth app ở "In production" để đăng nhập không hết hạn sau 7 ngày.

## Dữ liệu và nhật ký

Cài đặt, khóa (đã mã hóa) và phiên đăng nhập Studio nằm ở `%APPDATA%\YTAutoStudio` (Windows) hoặc `~/Library/Application Support/YTAutoStudio` (macOS). Lỗi khi khởi động ghi vào `error.log` trong thư mục đó.

## Phát triển

```bash
npm install && npm --prefix ui install
npm run build:ui            # giao diện -> ui_dist (được commit để CI không phải build)
npm start                   # chạy app
npm test                    # kiểm thử phần xử lý + tự cập nhật
xvfb-run -a node tests/e2e-app.js   # chạy app thật với Studio giả lập
```
