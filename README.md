# Thư Phòng — Private Novel Reader

Ứng dụng đọc TXT/EPUB, Convert, dịch AI, nghe sách và đồng bộ. Mã ứng dụng nằm trong **[private-novel/](private-novel/README.md)**.

## Bắt đầu từ đâu

| Cần làm gì | Đọc ở đây |
|---|---|
| Chạy ứng dụng và kiểm thử | [README ứng dụng](private-novel/README.md) |
| Xem trạng thái hiện hành, bản triển khai và giới hạn | [HANDOFF.md](HANDOFF.md) |
| Tìm tài liệu của một tính năng | [Chỉ mục tài liệu](private-novel/docs/README.md) |
| Tìm code cần sửa | [Bản đồ mã nguồn](private-novel/src/README.md) |
| Chọn script kiểm tra/vận hành | [Hướng dẫn scripts](private-novel/scripts/README.md) |
| Làm việc trong repository | [AGENTS.md](AGENTS.md) |
| Học kiến trúc và React/TypeScript | [Hướng dẫn học dự án](private-novel/docs/PROJECT-LEARNING-GUIDE.md) |

## Các nhóm tính năng

| Nhóm | Phần hiện có | Điểm tra cứu |
|---|---|---|
| Tủ sách và nhập truyện | Album tác giả → series → truyện → chương; ba kiểu xem, TXT/EPUB, bổ sung chương | [Bản đồ code](private-novel/src/README.md#module-theo-nghiệp-vụ) |
| Reader và vị trí đọc | URL số theo vị trí mục lục, định vị chương hiện tại, bookmark tách dịch sẵn | [Reader UX](private-novel/docs/UI-READER-UX-PLAN.md), [URL số](private-novel/docs/NUMERIC-READER-URL-M0.md) |
| Dịch AI | Dịch cả/chia phần, tiến độ và lý do chia, tối đa hai key cùng chương, tự phục hồi/Dừng | [Chỉ mục AI](private-novel/docs/README.md#tra-cứu-theo-tính-năng) |
| Name và Convert | Kho chung theo Album tác giả, thêm Name từ đoạn AI, tra cụm qua server/cache/local fallback | [Kho Name](private-novel/docs/ALBUM-NAMES-M0.md), [Convert server](private-novel/docs/SERVER-CONVERT-FREE-M0.md) |
| Nghe sách | CapCut v2, 10 giọng Việt, bộ đệm tối đa ba request, cache audio riêng và giữ mốc | [TTS hiện hành và giới hạn](private-novel/docs/TTS-AUTONOMY-M0.md), [kết nối phiên](private-novel/docs/CAPCUT-TTS-SETUP.md) |
| Dữ liệu và đồng bộ | File nguồn, backup/restore, CAS, xung đột và khôi phục chương | [Chỉ mục dữ liệu](private-novel/docs/README.md#tra-cứu-theo-tính-năng) |

Trạng thái từng đợt, bằng chứng và việc chưa làm nằm trong [HANDOFF](HANDOFF.md). Đăng nhập lại CapCut từ điện thoại và nghe nền Android thật chưa được nghiệm thu; không coi các đề xuất trong kế hoạch là tính năng đã hoàn thành.

## Cấu trúc workspace

```text
DOCTAILIEU/
  README.md                        điểm bắt đầu
  AGENTS.md                        quy tắc làm việc
  HANDOFF.md                       trạng thái hiện hành, ngắn gọn
  HANDOFF-LOG.md                    lịch sử công việc, chỉ ghi thêm
  DECISIONS.md                     quyết định kỹ thuật, chỉ ghi thêm
  WEB-READER-IMPLEMENTATION-PLAN.md  chỉ mục phạm vi làm việc
  private-novel/                   ứng dụng, backend, tests và tài liệu
  .github/workflows/               CI
  .dsh-tmp/                        kết quả cục bộ, không đưa vào Git
```

Các kế hoạch cũ ở gốc là tài liệu tham chiếu; trạng thái trong đó không thay thế `HANDOFF.md`. Nhật ký lịch sử trong `private-novel/docs/` được giữ tại đường dẫn cũ để bảo toàn tham chiếu; ghi mới vào nhật ký ở gốc.

Log mới đặt tại `private-novel/.dsh-tmp/<tên-tác-vụ>/`. Những log cũ đã được tài liệu hoặc script tham chiếu vẫn giữ đường dẫn hiện có. Log chưa được tham chiếu và chưa được Git theo dõi có thể xem trong `.dsh-tmp/project-organization/legacy-logs/`; manifest cùng thư mục ghi đường dẫn gốc và SHA-256.


## Lưu mã riêng tư

Repository: https://github.com/manhtoan123/DOCTAILIEU (Private). Git lưu mã nguồn, migration, kiểm thử và tài liệu; không lưu truyện, bản sao lưu cá nhân, dữ liệu trình duyệt, secrets, log và output tạm. Cấu hình Cloudflare chứa định danh tài nguyên; secrets được quản lý riêng ở môi trường triển khai. Xem `.gitignore` trước khi thêm file; không dùng Git thay cho backup dữ liệu ứng dụng.
