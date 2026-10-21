# AI-UNIFIED-UI-1 — một cài đặt chung, thao tác nhanh trong truyện

17/10/2026. Thay thế phần UI/phạm vi cài đặt mô tả trong AI-MINIMAL-UI-1.

- Reader: hai dòng model thực tế, chọn prompt đã nhớ của truyện, dịch sẵn, công tắc “Dịch nửa sau bằng Lite”, liên kết Cài đặt. Không còn Name riêng hoặc Dừng dịch trong bảng AI. Chỉ hiện thông tin lỗi/thử lại khi cần.
- Bật công tắc: nửa đầu làm mẫu, gửi cả nguồn và bản dịch mẫu cho Gemini 3.5 Flash-Lite. Tắt: nguyên chương trong giới hạn, chỉ chia khi giới hạn/recovery yêu cầu. Đổi công tắc không tự thay prompt đã chọn. Khi đang đọc AI, cài đặt mới áp dụng cho lượt sau, giữ phiên đang đọc.
- Model đầu tự động theo quality order hiện hành, bắt đầu Gemini 3.8 Flash; fallback giữ policy cũ. Lite cố định 3.5. Áp dụng ở runtime; không viết lại hàng loạt prompt, nguồn, checkpoint hoặc cache cũ.
- `/settings/ai` chỉ cấu hình chung. Link `/settings/ai/<book>` cũ mở cùng cấu hình chung, không sửa thiết lập riêng của truyện. Bỏ bộ chọn truyện, chọn model/Lite, checkbox dịch sẵn/hybrid lặp. Kho prompt cũng bỏ chọn model/nhiệt độ bị bỏ qua ở runtime.
- Chọn prompt chung được bật và có lưu ID/snapshot; từng truyện vẫn nhớ prompt riêng. Soạn User/System/Prompt nửa sau, thử mẫu và keys còn ở cài đặt. Tên prompt dựa trên User/System, không bị mất vì đổi mẫu nửa sau chung.
- Lưu riêng mẫu nửa sau giữ ID và snapshot của prompt cũ, kể cả phiên bản cũ không còn trong danh sách latest. Không dựng lại snapshot từ phiên bản mới ở kho. Các thao tác settings dùng hàng đợi + transaction, thất bại không ghi dở.

## Nghiệm thu

Review độc lập theo AGENTS: không còn finding trong phạm vi persistence/isolation; thêm 5 regression, chạy cùng prompt-stock/prompt-list 31/31 PASS (`.dsh-tmp/ai-unified-review.log`). Root targeted 32 PASS. Full unit: 1756 tests PASS; lượt chạy bounded có một cleanup hook đóng browser quá 10s; chạy lại riêng DOM suite 3/3 PASS, giữ cả log lỗi và retry. Không sửa timeout/dependency để che lỗi.

`e2e/ai-unified.spec.ts`: 12/12 PASS ở desktop và Android layout: công tắc/prompt độc lập, whole/hybrid, nguồn+mẫu đủ, model thực tế/fallback, settings chung, ID/snapshot cũ, keys lazy, màn hình 360×500. Build PASS. Đây là spec cho UI mới; các spec cũ đặt trình soạn theo từng truyện mô tả giao diện đã được thay thế.

Không đổi schema hoặc cơ chế đồng bộ: validator shared-state hiện chưa giữ hybrid trong roundtrip giữa thiết bị (giới hạn có trước thay đổi này). Chọn prompt riêng vẫn dùng ID/snapshot được schema hiện hành hỗ trợ. Kiểm tra layout không thay thế Android thật; provider được giả lập trong nghiệm thu UI.

Production smoke cô lập: `scripts/smoke-ai-unified-production.mjs`, chặn API cloud, dùng truyện tổng hợp, không ghi lên thư viện của người dùng. Kết quả và ảnh tại `.dsh-tmp/ai-unified-production/`.

Production 17/10/2026: Pages `d86f4a1f` / master, `index-8LwnhKeF.js`; canonical exact-dist + mock AI/fallback/hybrid3.5Lite/nguồn giữ/settings chung/prompt riêng/mobile PASS. Worker `0569335b-9a8f-40a1-bd0e-9504a9c82527`, bindings và schema không đổi.
