# Private Novel

15/11/2026. [Chỉ mục dự án](private-novel/docs/README.md) · [Quy tắc](AGENTS.md).

## Production

[Thư Phòng](https://thu-phong-private.pages.dev/) chạy Pages `e5ec48c7`, source `7e6615b` trên `master`, service worker `f9706e36c60e8bc5`. Rollback `97962f61`. Domain chính khớp SHA-256 cho worker và 11 tệp offline. Edge production 4/4 bằng dữ liệu tổng hợp và API chặn.

## Cải tiến web

- Cache offline xác minh từng tệp bằng SHA-256 và loại nội dung trước khi kích hoạt. Truyện đã lưu trên máy đọc được offline sau khi cài xong.
- Kệ lớn cập nhật vị trí khi vùng chứa co giãn. Tủ sách hiện ngay khi ô tìm trống. Ca kệ dịch vị trí tái hiện lỗi trên Pages cũ và đạt trên bản mới.
- Album, tìm gần đúng và parser packed được đối chiếu với code và kiểm thử theo phạm vi. Kết quả và các mốc trước/sau ở [báo cáo cho AI](private-novel/docs/WEB-CODE-CHANGELOG-AI-CHECK-2026-11-14.md).
- Giới hạn kiểm chứng gồm Edge desktop và dữ liệu tổng hợp cho smoke. Full unit lần ghi nhận gần nhất còn 83 lỗi và chưa chạy lại trong lượt này.
