# Private Novel
14/11/2026. Chỉ mục: [docs/README.md](private-novel/docs/README.md). Quy tắc hiện hành: [AGENTS.md](AGENTS.md).

## Production
`https://thu-phong-private.pages.dev/` — Pages production `1c0d940e`, source `75a0e26` (`master`), PWA shell `1839862ac648a243`. App shell và truyện local đã lưu đọc được offline sau khi cài shell; API, AI, TTS, cloud cần mạng. Chưa kiểm cập nhật worker khi tab cũ còn mở. Xem [PWA-OFFLINE-SHELL-M0.md](private-novel/docs/PWA-OFFLINE-SHELL-M0.md).

## Thay đổi gần đây
- Packed dictionary dùng chung `parseEntry`; regression 5/5, đã deploy. Chi tiết [DICTIONARY-PACKED-CACHE.md](private-novel/docs/DICTIONARY-PACKED-CACHE.md).
- Album grouping gom sách một lượt theo mọi Album tổ tiên, giữ path/thứ tự; đã kiểm unit/E2E/build. Benchmark synthetic 5k sách: 1.139 → 17 ms, không đại diện browser/Android. [ALBUM-GROUPING-PERF.md](private-novel/docs/ALBUM-GROUPING-PERF.md).
- Virtualization danh sách lớn (>300) đã code và kiểm production build/E2E local; chưa deploy. 1k/5k sách: desktop 11.039/55.039 → 320 DOM elements; 5k vẫn có long task 164 ms và search ~1,36 s trong một lượt synthetic. [LIST-VIRTUALIZATION-PERF.md](private-novel/docs/LIST-VIRTUALIZATION-PERF.md).
- Node benchmark 4 dictionary thật: cold packed chậm hơn Map; warm cache in-memory nhanh; Convert packed chậm hơn Map. Chưa phải Edge/IndexedDB thật/Android. Không ghi SHA. Xem dictionary doc và [báo cáo so sánh](private-novel/docs/WEB-CODE-GITHUB-IDEAS-REPORT-2026-11-14.md).

## Việc còn lại trong báo cáo
Deploy/smoke virtualization; kiểm PWA update tab cũ; đo Vietphrase/Convert trên Android qua USB theo quyền chép tạm riêng Vietphrase (không mạng, xóa sau đo); phân loại full unit suite đỏ; kiểm fuzzy metadata search; đo khoảng lặng TTS; làm EPUB navigation spike chỉ khi kiểm được tiêu chí. Xóa batch hiện giới hạn 4, nhưng chưa đo kho thật; giữ cloud ACK trước local delete. Không đổi semantics xóa trước review độc lập bắt buộc.

## Ràng buộc và kiểm thử
Local-first; giữ cây Album → Album con → truyện → chương, bytes/SHA/validation/atomicity/cancellation. Không sửa dữ liệu cũ. `D:` read-only; chỉ ngoại lệ sao chép Vietphrase lên Android qua USB một lần đã được người dùng cho phép. Không cache API/user data trong PWA. Full suite gần nhất có 83 fail/48 files, 2.671 pass, 105 skip; fail set dao động, xem log lịch sử trong `.dsh-tmp`. Chưa có xác minh Android thật.