# Private Novel
14/11/2026. Chỉ mục: [docs/README.md](private-novel/docs/README.md). Quy tắc hiện hành: [AGENTS.md](AGENTS.md).

## Production
`https://thu-phong-private.pages.dev/` — Pages `82fd26db-8975-4aec-94d5-e5c642dfd98c`, source `06dd051` (`master`), PWA shell `78ae21da2c0f28d6`; rollback deployment trước `1c0d940e`. Shell và truyện local đã lưu đọc được offline; API/AI/TTS/cloud cần mạng. Chưa kiểm update khi tab cũ còn mở. Xem [PWA-OFFLINE-SHELL-M0.md](private-novel/docs/PWA-OFFLINE-SHELL-M0.md).

## Đợt cải tiến 14/11
- Packed dictionary dùng chung `parseEntry`; regression 5/5, deploy trước đó. [DICTIONARY-PACKED-CACHE.md](private-novel/docs/DICTIONARY-PACKED-CACHE.md).
- Album grouping gom theo path tổ tiên, giữ path/thứ tự; unit/E2E/build pass. Synthetic 5k: dựng nhóm p50 1.139 → 17 ms; không đại diện browser/Android. [ALBUM-GROUPING-PERF.md](private-novel/docs/ALBUM-GROUPING-PERF.md).
- List virtualization (>300 sách) deploy cùng commit `06dd051`; production E2E 2/2, PWA offline regression 1/1, bundle SHA khớp artifact. Với 5k: DOM 55.039 → 320 desktop; search vẫn ~1,36 s và long task 164 ms trong một lượt synthetic. [LIST-VIRTUALIZATION-PERF.md](private-novel/docs/LIST-VIRTUALIZATION-PERF.md).
- Node benchmark với bốn dictionary thật: cold packed và Convert packed chậm hơn Map; warm in-memory cache nhanh. Chưa đo browser/Android/IndexedDB persistent. [Báo cáo so sánh](private-novel/docs/WEB-CODE-GITHUB-IDEAS-REPORT-2026-11-14.md).

## Việc còn lại trong báo cáo
Kiểm PWA update khi tab cũ còn mở; đo Vietphrase/Convert trên Android qua USB theo quyền chép tạm riêng Vietphrase (không mạng, xóa sau đo); phân loại full unit suite đỏ; kiểm fuzzy metadata search; đo khoảng lặng TTS; làm EPUB navigation spike nếu đạt tiêu chí. ADB hiện không liệt kê thiết bị. Xóa batch giữ giới hạn 4 và cloud ACK trước local delete; chưa đo kho thật, không đổi semantics trước review độc lập bắt buộc.

## Ràng buộc và kiểm thử
Local-first; giữ cây Album → Album con → truyện → chương, bytes/SHA/validation/atomicity/cancellation. Không sửa dữ liệu cũ. `D:` read-only; ngoại lệ duy nhất là bản sao Vietphrase tạm qua USB đã được người dùng cho phép. Không cache API/user data trong PWA. Full unit gần nhất tại `ed5cb66`: 83 fail/44 files, 2.673 pass, 105 skip; fail set dao động. Chưa xác minh Android thật.