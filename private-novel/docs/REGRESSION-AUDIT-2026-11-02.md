# Rà soát hồi quy — 02/11/2026

Rà soát theo yêu cầu người dùng, đánh giá bằng code và đường gọi, không quy kết theo tên/model AI. Dirtytree chứa 192 file tracked thay đổi và các file mới; phạm vi đợt này là các chức năng vừa chỉnh: dịch/cache/prewarm, streaming TTS, metadata1000, quản lý thư viện và live Name EPUB/PDF/DOCX. Không phải chứng nhận toàn bộ dự án không còn lỗi.

## Lỗi đã xác nhận và sửa

1. **P2 — Nghe lặp ở dấu nháy cuối đoạn.** Với bản cũ `Một câu.”`, player bỏ đuôi chỉ có dấu nháy; khi nối `\nCâu tiếp.`, helper chỉ bỏ khoảng trắng nên offset còn đứng trước dấu nháy. Player nhóm câu có thể quay lại nhóm chứa câu cũ. `ai-listen.ts` bỏ cả dấu câu trước ranh giới newline, giữ vị trí thụt đầu dòng/đầu câu tiếp theo. Reviewer độc lập xác nhận đường lỗi và bản sửa bằng đọc code.
2. **Chi phí cache không cần thiết.** Mọi lần đọc completed cache đều tạo/serialize/hash biến thể của toàn bộ chương qua danh sách model/mode/fallback trước khi đọc bản đúng cấu hình. `ai-reading-cache.ts` đọc khóa hiện tại trước; chỉ mở tìm kiếm tương thích khi miss. Giữ validation/cancellation/transaction và quy tắc không trộn phần khác model. Không tuyên bố số giây cải thiện vì chưa đo runtime.
3. **P2 — Tên TXT dẫn xuất dài mất đuôi/đứt Unicode.** `sanitizeDownloadFilename` trước đây thêm `.txt` rồi cắt cả chuỗi ở255, có thể mất đuôi hoặc cắt đôi surrogate. Nay cắt stem251, tránh high surrogate cuối rồi thêm `.txt`. Đường ảnh hưởng: `source.displayName` của importer và tên/đường dẫn dẫn xuất anthology; nút Xuất TXT của Reader dùng đường khác.

## Phần đã đọc nhưng chưa tìm thấy lỗi chắc chắn khác

Reviewer dữ liệu đã đối chiếu metadata client/server/migration0018; selection theo ID, rename/delete snapshot và ACK-before-local; vòng đời EpubFrame, bridgev2 cập nhật tại chỗ, nonce/window và ACK. Không sửa các đường dữ liệu này chỉ vì nghi ngờ. Reviewer AI rà soát cache/model/prewarm riêng.

## Tham khảo và kiểm chứng

- [HTMLMediaElement ended](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/ended_event): nối ở ranh giới audio kết thúc; kiểm thêm cơ chế nhóm câu thực tế của player dự án.
- [TanStack Query — Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys): giữ identity dữ liệu trong cache; áp dụng tra đúng khóa trước, không bỏ prompt/source/Names khỏi điều kiện reuse. Không thêm dependency.
- Theo chỉ đạo trước đó của người dùng, không viết/chạy test. Kiểm chứng gồm đọc đường gọi, review độc lập, diff-check và build. Chưa xác minh nghe Android thật, upstream AI/TTS hoặc dữ liệu thật; chưa audit hết backup/import/auth/Worker và mọi thay đổi lịch sử.
- Build TypeScript client/server + Vite exit0 (`.dsh-tmp/regression-audit-nov02-build.log`, `index-Bk-lz46e.js`), diff-check0. Review độc lập cuối chấp nhận ba delta; AI/cache/prewarm không có finding P1/P2 khác đủ chắc trong lượt này. Release đang thực hiện. Không commit/reset/push, không đổi schema/Worker/provider/key/paid tier.

Phát hành: Pages `58171512` deploy exit0, rollback `cb02963f`. GET root/reader/asset HTTP200 đúng `index-Bk-lz46e.js`. Log `.dsh-tmp/regression-audit-nov02-deploy.log` và `regression-audit-nov02-release.json`. Các kiểm tra phát hành không thay thế kiểm chứng nghe/AI/dữ liệu thật.
