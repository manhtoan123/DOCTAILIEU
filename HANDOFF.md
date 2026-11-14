# Private Novel
14/11/2026. Chỉ mục: [docs/README.md](private-novel/docs/README.md). Quy tắc và dữ liệu hiện hành: [AGENTS.md](AGENTS.md).

## Production
`https://thu-phong-private.pages.dev/` — Pages production `603c6577`, source `d275743` (`master`), PWA shell `861842736eb25608`. Rollback Pages trước đó: `1c0d940e`. AI/Convert Workers không đổi.

PWA cài app shell sau khi truy cập online; shell và truyện local đã lưu có thể mở offline. API, cloud sync, AI, TTS vẫn cần mạng; không cache API hay dữ liệu truyện vào CacheStorage. Production Edge E2E sau deploy 1/1; update khi tab worker cũ còn mở và Android thật chưa kiểm. Xem [PWA-OFFLINE-SHELL-M0.md](private-novel/docs/PWA-OFFLINE-SHELL-M0.md).

## Đợt cải tiến 14/11
- Packed dictionary dùng chung `parseEntry`; regression 5/5. Vietphrase thật/Android chưa đo. Chi tiết: [DICTIONARY-PACKED-CACHE.md](private-novel/docs/DICTIONARY-PACKED-CACHE.md).
- AlbumShelf gom sách một lượt theo mọi đường dẫn tổ tiên, giữ path legacy và thứ tự sách. Unit 4/4, E2E hierarchy Chromium 4/4, build pass. Fixture Node tổng hợp 5.000 sách/150 path: bước dựng nhóm p50 1.139 ms → 17 ms (65,4×); không phải số đo browser/Android. Chi tiết: [ALBUM-GROUPING-PERF.md](private-novel/docs/ALBUM-GROUPING-PERF.md).
- So sánh đề xuất/hiện trạng: [WEB-CODE-GITHUB-IDEAS-REPORT-2026-11-14.md](private-novel/docs/WEB-CODE-GITHUB-IDEAS-REPORT-2026-11-14.md).

## Ràng buộc dữ liệu
Local-first, chỉ nhập truyện được chọn. Cây bắt buộc tác giả (Album) → series (Album con) → truyện → chương; giữ đường dẫn và dữ liệu cũ. Giữ bytes/SHA/validation/atomicity/cancellation; xóa cloud phải ACK trước khi xóa local. D: chỉ đọc. Không sửa/tái nhập dữ liệu cũ.

## Kiểm thử và giới hạn
Build, kiểm tra tập trung và E2E theo từng thay đổi. Full unit suite gần nhất có 84 fail/47 files, 2.670 pass, 105 skip; fail set dao động so với baseline, chưa quy về các thay đổi lần này. Log `.dsh-tmp/pwa-unit-final.log`. Chưa xác minh Android phần cứng, corpus Vietphrase thật, cập nhật worker ở tab cũ. Không còn thay đổi/deploy chờ cho phạm vi cải tiến này.
