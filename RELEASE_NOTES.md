## YT Auto Studio 0.5.4

Bỏ giới hạn 2 MB của thumbnail và cập nhật Gemini lên các model mới nhất.

### Đăng video
- **Thumbnail không còn giới hạn 2 MB:** YouTube đã bỏ giới hạn này, nên ảnh thumbnail lớn hơn 2 MB không còn bị báo lỗi đỏ và vẫn đăng được.

### Gemini
- **Model mới** (theo trang tài liệu Gemini API của Google, 28/10/2026):
  - Gemini 3.8 Flash: trợ giúp toàn diện. Đây là model mặc định.
  - Gemini 3.5 Flash-Lite: nhanh nhất, rẻ nhất.
  - Gemini 3.1 Pro: suy luận nâng cao, đang là bản xem trước.
  - Gemini 4 Argon: dành cho nhiệm vụ phức tạp, model mới.
- **Cài đặt cũ tự đổi sang model mới:** Gemini 2.5 Flash thành 3.8 Flash, 2.5 Flash-Lite thành 3.5 Flash-Lite, 2.5 Pro thành 3.1 Pro.
- **Cấp độ tư duy:** chọn Thấp, Trung bình hoặc Cao trong Cài đặt, giống app Gemini. Mặc định là Thấp, nhanh và tiết kiệm hạn mức.
- **Nút "Tải danh sách model mới nhất":** hỏi Google các model mà API key của bạn dùng được. Google ra model mới thì bạn chọn được ngay, không cần chờ bản tool mới.
- Tool không còn gửi `temperature` cho các model mới, vì Google đã bỏ thông số này.

Đang dùng bản cũ: mở tool, vào **Cập nhật**, bấm **Tải và cài**.

### Tải bản nào?

| Máy của bạn | File |
|---|---|
| Windows 10/11 | `YTAutoStudio-0.5.4-windows-setup.exe` |

Bản này chỉ build cho Windows. Bản macOS sẽ build khi cần.
