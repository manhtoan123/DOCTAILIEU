# Release gates hiện hành — chưa phát hành
05/10/2026. R0 đọc/Convert, chưa bắt buộc TTS; R1 thêm auth/private deploy.
Bằng chứng: VALIDATION-2026-10-05.md; lịch sử: HANDOFF-LOG.md.

| Gate | Trạng thái |
|---|---|
| Local unit/type-check/build | Qua lượt mới: 75 unit, build |
| A2/A3 bảo toàn nguồn/atomic dictionary | Qua phạm vi nhỏ, review độc lập |
| A1/A4/A5/A6/A7 | Còn mở; 5 expected failures, không data-safe toàn bộ |
| M0 backup streaming/dictionary43MB/authCPU | Chưa hoàn tất, ưu tiên trước feature mới |
| Dedupe/Name/settings/Reader | Có tests tổng hợp; không suy thành toàn bộ workflow thực |
| UI settings ca từng flaky | Lặp3 ×2 viewport qua; root cause lần fail cũ chưa chứng minh |
| Android Chrome hardware | Chưa làm; Pixel viewport không thay thế |
| Crash/resume/migration dữ liệu cũ | Chưa nghiệm thu |
| Auth/logout/Pages-D1 runtime/KDFCPU | Chưa nghiệm thu |
| Private URL/anonymous assets/API/session | Chưa deploy/test |
| TTS (tùy chọn sau R0) | Chưa gateway/audio thật; route trung tính + POST body + provider IDs cần chốt |
| Git baseline/CI | Baseline local và YAML; chưa push/chạy CI remote |

Không Gemini/content sync trong MVP local. Không tuyên bố 0 VNĐ vô hạn hoặc release chỉ vì tests xanh.

