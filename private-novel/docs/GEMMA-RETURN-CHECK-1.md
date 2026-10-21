# Gemma 26B: kiểm tra chuyển model ngày 16/10/2026

Phạm vi: chẩn đoán `gemma-4-26b-a4b-it` trên production hiện hành; không đổi cấu hình, bản dịch hoặc tiến trình của người dùng. Không sửa/deploy runtime trong lượt này.

Đây là báo cáo baseline trước khi sửa. Theo yêu cầu tiếp theo của người dùng, streaming đã được triển khai và nghiệm thu trong [AI-ACTIVITY-STREAM-1](AI-ACTIVITY-STREAM-1.md); nhận định “chưa sửa/deploy” phía trên chỉ áp dụng lượt chẩn đoán ban đầu.

## Bằng chứng

- Trang đọc chọn Gemma4 26B A4B, hybrid tắt; lịch sử lượt dịch chương sau ghi Gemma4 26B A4B → Gemini2.5 Flash. Vì vậy đây là fallback, không phải bước Lite của hybrid.
- `server/ai-translate.ts`: gọi `generateContent` không streaming, timeout toàn yêu cầu 30 giây. `src/ai-translate.ts` có watchdog HTTP 40 giây. Không có phép đo output token/giây để xác định lỗi.
- `src/ai-reading.ts`: với model ưu tiên còn fallback, yêu cầu dài không được thử lại timeout hay chia nhỏ vì timeout trên cùng model trước khi chuyển xuống. Trước khi có checkpoint ghim model, một lỗi transient có thể đủ để chuyển model. Các phần đã hợp lệ vẫn có guard ghim model.
- Khóa API được giữ lease 35 giây; không thể chỉ tăng timeout HTTP phía trình duyệt, cũng không nên tăng server timeout vượt lease hiện hành.

Thử API thật tuần tự, không fallback/retry, văn bản tổng hợp, cùng model và prompt, hai vòng:

| Vòng | Ký tự nguồn | HTTP | Thời gian client | Chẩn đoán an toàn từ server |
|---|---:|---:|---:|---|
| 1 | 126 | 502 | 1,691 giây | upstream_http |
| 1 | 836 | 504 | 30,755 giây | timeout |
| 1 | 1747 | 504 | 30,699 giây | timeout |
| 2 | 126 | 504 | 30,857 giây | timeout |
| 2 | 836 | 502 | 1,559 giây | upstream_http |
| 2 | 1747 | 504 | 30,683 giây | timeout |

Log tail Worker lọc trạng thái ghi nhận `AI upstream HTTP 500`. Có hai loại lỗi trong mẫu: lỗi 500 upstream và deadline 30 giây của ứng dụng. Chưa có kết quả sau mốc 30 giây để kết luận các yêu cầu timeout cuối cùng có dịch thành công hay không. Không thu được output token để suy ra tốc độ sinh token.

0/6 hoàn tất là kết quả của mẫu nhỏ trên gateway và thời điểm này, không đại diện tỷ lệ thành công dài hạn của Gemma. Các mẫu là đoạn 126–1747 ký tự, không phải thử cả chương.

Tái lập có giới hạn: `node scripts/probe-gemma-return.mjs` (tối đa 6 yêu cầu, tuần tự, chỉ dữ liệu tổng hợp). Báo cáo thô: `../.dsh-tmp/gemma-return/baseline.json`; log: `../.dsh-tmp/gemma-return-baseline.log`. Các tệp scratch không đưa vào Git. Script không đọc keys, dữ liệu truyện hoặc ghi cloud.

## Kết luận và hướng sửa

Giả thuyết web nhận nhầm tốc độ token chưa được chứng minh: web không quan sát token đang sinh. Điểm đã xác nhận là deadline cố định và chính sách bỏ model ưu tiên sau một lỗi transient trước checkpoint. Không có bằng chứng những lỗi trong mẫu là do còn chữ Hán, lọc thought hay sai finishReason.

Hướng sửa cần nghiệm thu riêng:

1. Trước khi hạ Gemma, cho một lần phục hồi có giới hạn: lỗi 5xx thử lại cùng model; timeout đoạn dài chia đoạn trên cùng model. Giữ tổng budget, cancellation, giới hạn request trùng và pin model sau checkpoint. EPUB phải chia theo nhóm ID hợp lệ, không cắt chuỗi JSON tùy ý.
2. Muốn tăng thời gian chờ phải phối hợp deadline server/client với lease/CAS, giữ khóa suốt khi đọc body và giải phóng an toàn khi hủy. Cần review độc lập và regression theo quy tắc dự án. Tăng riêng watchdog 40 giây không giải quyết server 30 giây.
3. Có thể thử A/B Gemma với `thinkingConfig.thinkingLevel: "minimal"`, được Google hỗ trợ. Hiện app chưa gửi cấu hình này; tài liệu đã đọc không xác nhận mặc định đang bật thinking. Chưa thử/deploy nên không coi đây là nguyên nhân hay biện pháp đã chữa được lỗi.
4. Không bỏ kiểm tra chất lượng, không đánh dấu hoàn tất từ đầu ra thiếu, không đổi chính sách xoay key hoặc fan-out một chương.

Tài liệu chính thức: [Gemma trên Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api), [API errors](https://ai.google.dev/gemini-api/docs/api-errors).
