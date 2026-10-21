# Chỉ mục tài liệu

Đọc [HANDOFF hiện hành](../../HANDOFF.md) trước, sau đó chọn đúng chủ đề bên dưới. Ngày và kết quả kiểm thử trong từng tài liệu chỉ áp dụng cho lần kiểm được ghi; không phải bằng chứng bản hiện tại đã được kiểm lại.

## Hướng dẫn sử dụng và phát triển

- [Chạy ứng dụng](../README.md), [bản đồ code](../src/README.md), [scripts](../scripts/README.md).
- [Hướng dẫn sử dụng](USER-GUIDE.md), [hướng dẫn học dự án](PROJECT-LEARNING-GUIDE.md).
- [Quy tắc làm việc](../../AGENTS.md), [chỉ mục phạm vi](../../WEB-READER-IMPLEMENTATION-PLAN.md).

## Tra cứu theo tính năng

| Chủ đề | Tài liệu đầu vào | Tài liệu chi tiết khi cần |
|---|---|---|
| Cài đặt, prompt và thao tác tủ sách | [Thống nhất cài đặt](SETTINGS-UNIFIED-UX-PLAN.md) | [Danh sách prompt](PROMPT-LIST-1.md), [giao diện AI](AI-UNIFIED-UI-1.md) |
| Tên truyện, chương và tên file TXT | [Lưu tên hiển thị](TXT-PERSISTED-TITLES-PLAN.md) | [Bổ sung chương từ TXT](TXT-APPEND-1.md), [chia chương](CHAPTER-SPLIT-2.md) |
| Sửa/xóa chương tại mục lục | [Thiết kế sửa, xóa và khôi phục](CHAPTER-EDIT-DELETE-DESIGN.md) | Đã triển khai bản tối giản 21/10; giữ chương để khôi phục, xem hợp đồng trong thiết kế |
| Nhập nhiều file và thư mục | [Kho truyện lớn](BULK-LIBRARY-PLAN.md) | [Bộ chia chương](CHAPTER-REPAIR-M0.md) |
| Một TXT chứa nhiều truyện | [Nhập tuyển tập](ANTHOLOGY-IMPORT-1.md) | Xem/sửa mốc truyện rồi chia chương trong từng truyện |
| EPUB | [Nhập EPUB](EPUB-IMPORT-2.md) | [Reader EPUB](EPUB-READER-3.md), [file lớn](EPUB-LARGE-1.md), [bìa](EPUB-COVER-1.md) |
| Convert và Name | [Name STV](NAME-STV-2.md) | [Đồng bộ Name](NAME-SYNC-1.md), [hình ảnh Name](NAME-IMAGE-1.md), [Convert → AI](CONVERT-AI-NEXT-1.md) |
| Dịch AI | [Kế hoạch dịch](AI-TRANSLATION-PLAN.md), [dịch song song](AI-PARALLEL-PLAN.md) | [Dịch cả chương](AI-WHOLE-1.md), [hybrid](AI-HYBRID-HALVES-PLAN.md), [prompt nửa sau](AI-HYBRID-PROMPT-2.md) |
| Lỗi dịch, streaming và key | [Retry UX](AI-RETRY-UX-PLAN.md) | [Stream](AI-ACTIVITY-STREAM-1.md), [phục hồi](AI-RECOVERY-3.md), [pool key](AI-KEY-POOL-PLAN.md) |
| Tiến độ đọc và dịch sẵn | [Tiến độ AI](AI-READING-PROGRESS-1.md) | [Dịch sẵn](AI-READING-PRELOAD.md) |
| Nghe sách | [Hoàn thiện TTS](TTS-COMPLETION-PLAN.md) | [Gateway](TIKTOK-TTS-GATEWAY.md), [giữ phiên nền](TTS-MEDIA-KEEPALIVE-M0.md), [mất mạng](TTS-NETWORK-RESUME-1.md), [phục hồi phát](TTS-PLAYBACK-RECOVERY-1.md) |
| Reader và điều hướng | [Reader UX](UI-READER-UX-PLAN.md) | [Reader tối giản](READER-MINIMAL-2-PLAN.md) |
| Đồng bộ, lưu trữ và sao lưu | [Đồng bộ chỉnh sửa](SYNC-ALL-1.md), [giảm đọc D1](D1-DELTA-1.md) | [Sao lưu](BACKUP-GUIDE.md), [kiểm TTS và khôi phục](TTS-BACKUP-STABILITY-1.md), [checkpoint lưu trữ](STORAGE2-IMPLEMENTATION-CHECKPOINT.md), [R2](R2-SETUP.md) |
| Triển khai | [Hướng dẫn AI](AI-DEPLOY-GUIDE.md) | [Checklist phát hành](RELEASE-CHECKLIST.md); kiểm tra cấu hình thực tế trước khi dùng lệnh cũ |

## Trạng thái cần phân biệt

- **Hiện hành:** [HANDOFF](../../HANDOFF.md) ghi trạng thái triển khai và giới hạn mới nhất; [AGENTS](../../AGENTS.md) quy định cách làm việc.
- **Kế hoạch gần nhất:** [Settings](SETTINGS-UNIFIED-UX-PLAN.md) đã triển khai theo ghi nhận 18/10; [tên TXT](TXT-PERSISTED-TITLES-PLAN.md) đã triển khai theo ghi nhận 17/10. Đây là hồ sơ thực hiện, không phải backlog tự chạy lại.
- **Còn kiểm thực tế:** TTS khóa màn hình Android và zoom thủ công theo [kế hoạch Settings](SETTINGS-UNIFIED-UX-PLAN.md). Giả lập viewport không thay thế Android thật.
- **Lịch sử:** [STATUS.md](STATUS.md), [ưu tiên STV cũ](../../STV-FEATURE-PARITY-PLAN.md), audit/validation có ngày và các bản trong `archive/`. Chỉ đọc khi cần truy nguyên.
- **Nhật ký chuẩn:** [HANDOFF-LOG ở gốc](../../HANDOFF-LOG.md), [DECISIONS ở gốc](../../DECISIONS.md). Các file cùng tên trong `docs/` giữ lịch sử cũ.

## Đặt tài liệu mới

1. Bổ sung tài liệu hiện có nếu cùng tính năng; tránh tạo thêm một kế hoạch tổng hợp trùng nội dung.
2. Tài liệu tính năng ghi ngày, phạm vi, trạng thái, bằng chứng và giới hạn. Thêm liên kết vào bảng trên khi cần một điểm vào mới.
3. Log/output/screenshot tạm đặt trong `../.dsh-tmp/<tác-vụ>/`; chỉ đưa fixture tổng hợp và bằng chứng cần lưu lâu dài vào Git.
4. Chỉ chuyển tài liệu vào `archive/` khi đã xác nhận bị thay thế và sửa các liên kết liên quan. Không di chuyển nhật ký chỉ để làm đẹp cây thư mục.

## Nguồn tài liệu hiện hành

HANDOFF, HANDOFF-LOG và DECISIONS chính thức nằm ở **gốc repository** (hai cấp phía trên thư mục này). Các file cùng tên trong `private-novel/docs/` do lượt triển khai trước tạo chỉ là ghi chép cũ; không tiếp tục append ở đó. Đọc trạng thái sửa undo/dịch song song tại [AI-PARALLEL-PLAN.md](AI-PARALLEL-PLAN.md); không dùng tuyên bố hoàn tất cũ thay kết quả kiểm checkout hiện tại.
