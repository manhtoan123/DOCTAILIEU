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
