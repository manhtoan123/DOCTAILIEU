# Kho prompt gọn hơn — 16/10/2026

Gom tên trùng trong cùng phạm vi thành một thẻ, mở bản có updatedAt mới nhất. Theo yêu cầu16/10, bỏ ô chọn “Phiên bản” và số phiên bản trên thẻ; mẫu mặc định vẫn ẩn. Không xóa bản cũ, không đổi ID/stock/lựa chọn Reader hoặc logic lưu/đồng bộ. Reader vẫn giữ cấu hình đang dùng theo ID, không bị ép sang prompt khác.

Phạm vi UI: src/ui/PromptStockPanel.tsx; cập nhật e2e/prompt-list.spec.ts và scripts/smoke-prompt-list-production.mjs. Build một lần PASS; E2E2/2 Chrome+Android-layout PASS: không có versioncontrol/badge, mở bản mới, reload đúng, stock và lựa chọn cũ vẫn giữ. Không chạy full suite/reviewer vì không đổi logic dữ liệu.

Pages79640803/master, bundle index-CjD4xI-W.js; Worker777fc28f-990c-45cf-b871-bdcdb49ca1ad không đổi. Production smoke PASS:5profile→3thẻ,2nhóm trùng tên mở bản mới nhất, không versioncontrol/badge, cloudwrites0, canonicalHTML khớpdist. Không reload usertab hoặc sửa prompt thật. Logs .dsh-tmp/prompt-simple/; ảnh/report .dsh-tmp/prompt-list/production.png và production.json.
