# Hai chế độ chọn model — 01/11/2026

Theo yêu cầu người dùng, khôi phục tự động hạ model bên cạnh lựa chọn model cố định. Không thay provider/key hoặc thêm dependency.

## Giao diện và hành vi

- Bảng AI và trình sửa prompt dùng chung hai nút có trạng thái chọn: **Tự động hạ model / Cố định model**. Sau lựa chọn hiện mô tả ngắn, nhãn Model ưu tiên/Model cố định và combobox. Chế độ tự động có danh sách thứ tự dự phòng thu gọn; model thực dùng vẫn hiển thị riêng theo chương.
- `modelMode:auto`: khôi phục `recommendedFallbackModels` hiện có. Thứ tự từ model ưu tiên trở xuống: Gemini3.8→3.7→3.5→2.5→Qwen3.8 27B (Groq)→3.5Lite→Gemma4-26B-A4B→Gemini3FlashPreview. Model ngoài chuỗi dùng dự phòng2.5/Lite/3FlashPreview như helper cũ; giao diện hiển thị danh sách cụ thể. Dịch sẵn vẫn giữ quy tắc cũ bỏ Lite khi có nhiều lựa chọn. Không coi thứ tự này là benchmark chất lượng.
- `modelMode:fixed`: chỉ gọi model chọn, giữ retry/đổi key/Retry-After/Stop/budget hiện có. Người dùng bản vừa deploy tiếp tục mặc định cố định; không âm thầm đổi cài đặt đã chọn sang tự động.
- Lựa chọn lưu theo phạm vi cài đặt hiện có và không bị đổi khi chọn prompt khác. Bản dịch đang chạy giữ snapshot, thay đổi áp dụng lượt tiếp theo. Không sửa dữ liệu truyện hoặc xóa bản dịch cũ.
- Sau khi có phần hoàn tất, giữ model của chương để không trộn bản dịch. EPUB pinned parts và hybrid stage nội bộ khóa fixed rõ ràng; auto không được vượt qua pin bằng cách bỏ qua fallbackModels rỗng.
- Auto có cache identity riêng. Fixed bỏ trường mode khỏi identity để dùng lại cache fixed đã triển khai trước đó; vẫn kiểm model/prompt/nội dung/Name như cũ. Không thêm fan-out: giữ tối đa hai request và lease hiện có.

## Tham khảo

[LiteLLM reliability](https://docs.litellm.ai/docs/proxy/reliability) và [mã mở Router](https://github.com/BerriAI/litellm/blob/main/litellm/router.py): lấy ý tưởng phân biệt retry cùng model và fallback có thứ tự; điều chỉnh theo helper/lease/pin/budget sẵn có, không cài LiteLLM. Đường dẫn GitHub reliability.md đầu tiên trả404, sau đó đối chiếu tài liệu chính chủ. Nguồn không phải bằng chứng kiểm thử ứng dụng.

## Kiểm chứng và triển khai

Reviewer độc lập đọc phần mode/schema/cache/pinning; finding EPUB pin đã sửa và xác nhận đóng, không còn blocker trong phạm vi. Không chạy hoặc viết thêm test theo yêu cầu tiết kiệm usage trước đó của người dùng. Build cuối và ID Pages ghi sau triển khai. Chưa kiểm render ba theme/thiết bị thật hoặc runtime fallback sau thay đổi này; không tái sử dụng22/22 E2E trước đó làm bằng chứng cho hai chế độ mới. Worker AI/secrets/D1 schema không thay đổi.


Pages114fa5ee, asset /assets/index-DgdHCIB1.js; Worker giữfc2acc4d. Build cuối/deploy exit0; productionHTML Node fetch HTTP200, khớpbuild=true. Pythonurllib trước đó bị403, không coi là lỗi app. Review đọc độc lập đóng finding pinEPUB/internalstage, cachefixed giữ identity cũ. Không chạy test/render/AI upstream theo yêu cầu user; chưa xác minh runtime hai chế độ mới. Logs .dsh-tmp/ai-dual-mode-build-final.log và ai-dual-mode-deploy.log.

01/11 tiếp: chuỗiAuto đã thêmQwen3.8-27B(Groq) ngay sauGemini2.5Flash. Xem AI-KEY-MODEL-EXCLUSION-2026-11-01.md cho deploy và bằng chứng.

01/11 sửa tiếp: warmAuto chỉ pin sau phần hợp lệ đầu; provider_unavailable choAuto đi tiếp, Fixed dừng; trạng thái lỗi không còn giả chờ. Lịch sử mới dưới từng chương. Xem AI-REPAIR-AND-TIMELINE-2026-11-01.md. Pages69a5194b/Worker69d97149.
