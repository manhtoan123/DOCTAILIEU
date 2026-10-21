# AI: phục hồi phần con bị lỗi — 13/10/2026

Người dùng báo lỗi Gemini trên chương/phần 547/811. Retry qua giao diện thật đã tái hiện upstream HTTP503 và deadline504; một số phần nhỏ dịch200 rồi phần sau lỗi. Chương sau đó đã hiển thị bản dịch thật: 201 đoạn, 14.115 ký tự. Bằng chứng này xuất hiện trước khi triển khai bản sửa, chứng minh luồng cũ cuối cùng phục hồi nhưng phải chờ lâu.

## Thay đổi

`src/ai-reading.ts`: giữ thử tuần tự model ưu tiên và chuỗi dự phòng. Full-source và các model trước chỉ có một lượt trong chế độ nhiều model. Khi model cuối đã chia nhỏ một yêu cầu dài, phần con gặp lỗi tạm thời được retry tối đa hai lần tại chỗ; phần anh em đã thành công không bị gửi lại trong tác vụ đó. Timeout phần dài vẫn có thể chia tiếp theo giới hạn hiện có. Nếu phần con vẫn lỗi hoặc bị hủy, không công nhận/lưu bản dịch dở; một lượt mới vẫn có thể cần dịch lại toàn chương. Không thêm cache dở hoặc sửa nguồn sách.

`Reader.tsx`: hiện đếm ngược tự thử lại từ deadline/budget hiện có, chung ở banner và vùng đọc, không đổi lịch retry và không gán countdown của prewarm cho chương hiện tại.

Kiểm mới bao phủ phục hồi phần con, giới hạn ba attempts, không lặp phần đã xong, không cache dở và hủy trong lúc đợi retry. E2E thêm kiểm phần con lỗi503 hai lần và chuỗi đầy đủ model bận rồi tự phục hồi. Các ca prewarm cũ được cập nhật để chọn rõ model ưu tiên3.8, kiểm đúng chuỗi dự phòng/cooldown và giữ cùng tác vụ khi chuyển chương. Guard phép kiểm EPUB đợi `<p>` trước `getComputedStyle`, giữ toàn bộ assertions bảo mật.

## Bằng chứng kiểm tra

- Review độc lập Sol/high: không finding; 83 tests/6 files PASS. Review bổ sung UI/guard/E2E chỉ đọc; các giới hạn và kết quả trong log reviewer.
- Full unit: 97 files/1.320 tests PASS, `npm.cmd test -- --maxWorkers=4`; build PASS, bundle `index-jCUWaIYh.js`.
- Full đầu gặp browser hook timeout khi nhiều workers; lượt sau gặp guard iframe chưa có `<p>`. Giữ log lỗi và sửa harness; không tăng timeout hoặc đổi dependency để che lỗi.
- E2E cuối 26/26 PASS trên desktop/android-layout (`ai-fallback`, `ai-prewarm-recovery`, `ai-persistent-cache`). E2E đầu phát hiện assumptions single-model cũ, lượt tiếp seed vẫn dùng default3.5; đã chọn rõ3.8 để giữ assertion chính xác.

Logs và metadata: `.dsh-tmp/ai-reader-fix/` (`unit-initial.log`, `reviewer-regression.log`, `full-unit-final.log`, `build.log`, `e2e-verified.log`, `worker-diagnostics.json`). Tail đã lược bỏ headers/URL query và chỉ giữ thời gian, path, HTTP status; không lưu key hoặc văn bản request. Phiên quan sát gồm cả dịch và tải trước, không dùng tổng request để suy riêng chi phí chương đang đọc.

Không sửa server key/auth/schema/provider hoặc truyện cũ; không thêm billing. Không thể bảo đảm Google hết503/timeout. [Google troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) là đối chiếu lỗi provider; nguyên nhân thực tế ở đây dựa trên trace production và trạng thái trang.

## Phát hành và xác minh

Pages production master `34c39eec`, bundle `index-jCUWaIYh.js`, deploy exit0; trước `945cfd10`. AI Worker và key policy không đổi. Canonical HTML khớp dist đã kiểm. Smoke bundle production trong viewport668×708, dữ liệu tổng hợp/API giả lập cô lập: full-source4model tuần tự, split407+407, phần đầu một lượt, phần sau503 hai lần rồi thành công; tổng8calls, chỉ hiển thị đủ hai phần. Đây là kiểm phục hồi client, không phải một lượt Gemini thật mới.

Đã nạp bundle mới trên tab thật được người dùng chỉ định và mở lại Dịch AI: 201 đoạn/14.115 ký tự, không còn banner lỗi; bản dịch đã có được giữ. Bằng chứng [trang thật](../.dsh-tmp/ai-reader-fix/user-page-verification.json), [ảnh](../.dsh-tmp/ai-reader-fix/chapter-recovered.jpg), [smoke](../.dsh-tmp/ai-reader-fix/production-smoke.json). Logs `deploy.log`, `production-smoke.log`, `deployment-after.log`; giữ `production-smoke-initial.log` (mock nhầm phần con có hai chữ thành full-source, đã sửa harness, không đổi app).

Phạm vi đã hoàn thành: sửa phục hồi từng phần và countdown, kiểm regression, deploy, chương người dùng đọc được. Lỗi provider kéo dài vẫn có thể vượt giới hạn retry; không hứa mọi chương luôn dịch được hoặc nhanh như cache. Chưa kiểm Android thật.
