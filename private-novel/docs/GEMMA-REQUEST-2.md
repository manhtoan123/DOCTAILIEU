# Kiểm lại đường gọi Gemma — 15/10/2026

Gemma không bị vô hiệu hóa trong picker hoặc server allowlist. Google công bố đúng IDs `gemma-4-26b-a4b-it`, `gemma-4-31b-it`, hỗ trợ System Instructions và công tắc thinking `high/minimal`: [tài liệu chính thức](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api). Không có bằng chứng lỗi là do System Prompt không được hỗ trợ.

Probe hiện tại qua `/api/ai/translate` sản phẩm, temperature0, cùng key pool/rotation/lease, tối đa2 model đồng thời, không fallback/retry/continuation:

| Đầu vào | Gemma 4 26B A4B | Gemma 4 31B |
|---|---|---|
| Một câu tổng hợp, 16 ký tự | 200/STOP, 9,354s | 200/STOP, 11,355s |
| Nửa đầu chương 018, 1.371 ký tự | 504 `ai_timeout`, 30,828s | 504 `ai_timeout`, 30,747s |

Câu ngắn có kết quả tiếng Việt hợp lý và đúng Hạ Ngạn. Hai request dài chưa có kết quả để chấm nghĩa/chất lượng; không phải đo cả chương hoặc recovery của app. Worker đang giới hạn30s/request, HTTPclient40s; đã xác định failure ở deadline, chưa chứng minh lý do sâu ở Google. Lượt trước có Google500/timeout; khả năng xử lý input/output dài chậm hơn là suy luận, không chứng minh do thinking/quota/độ lớn model. Payload hiện chưa đặt thinkingConfig; không suy đoán giá trị mặc định.

Chưa thêm tối ưu riêng Gemma. Nếu tiếp tục sửa, cần probe chunk nhỏ và `thinkingLevel=minimal` có đối chứng chất lượng trước khi chọn chính sách; không tự tăng paid tier/provider/timeout. Không suy ra SLA hoặc tỷ lệ thành công chung từ mỗi model chỉ một request ở mỗi kích thước.

Logs `.dsh-tmp/chapter-audit/gemma-short-probe.json`, `gemma-half-probe.json`; câu dài `.txt` chỉ được tạo nếu thành công (hai lượt hiện tại không có). Probe đầu sai fixture names-array đã bị validation400 trước provider, log giữ riêng `gemma-short-invalid-request.*`; không tính vào đo Gemma. Script half `scripts/probe-gemma-half.ts`, câu tổng hợp trong scratch; không có key/raw credentials hoặc chỉnh truyện.
