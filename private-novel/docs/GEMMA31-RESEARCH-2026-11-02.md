# Gemma 4 31B — nghiên cứu 02/11/2026

## Kết luận có bằng chứng

`gemma-4-31b-it` là model chính thức được Gemini API hỗ trợ. App gửi thinkingLevel=minimal đúng hướng dẫn API, maxOutputTokens8192; lọc thought parts khỏi câu trả lời. Không thể quy thời gian dài cho việc app bật thinking: cấu hình đã tắt, nhưng tài liệu formatting lưu ý model lớn đôi khi vẫn phát thought channel. Không có telemetry thought của request đích để khẳng định tình huống này đã xảy ra.

Người dùng đưa hai attempt 00:46:18–00:47:55 (97,3s, ai_upstream_error/HTTP502) và 00:47:55–00:49:51 (116s, nhận phản hồi). Đã khớp chapter log bắt đầu2026-11-01T17:46:18.085Z =00:46:18 ngày02/11 tại Việt Nam: sourceChars2357, workCompleteMs214284, retries1, modelSwitches0, leafParts1, acceptedLeafParts1, validationaccepted/statussuccess. Work ban đầu prewarm rồi foreground. Đây là bằng chứng chấp nhận bản dịch, không phải đánh giá chất lượng hoặc benchmark tốc độ ổn định.

Server request log của accepted request a8f036b7-0033-4242-9e1f-36b9e93ce2a1 không có hàng tương ứng khi truy vấn. Không thể phân rã 116s thành admission, first answer, output hay Han repair. Không suy HTTP502 ở UI thành upstreamHTTP502: app có thể ánh xạ lỗi dịch vụ thành502.

Một request KHÁC lúc00:42:04: 2352ký tự, upstream500/406ms rồi200/19781ms; serverheaders21,630s, firstanswer21,741s, kết thúc30,643s ai_timeout. Phù hợp với idle cutoff7s sau câu trả lời bắt đầu; chưa có lịch từng chunk nên chỉ là bằng chứng cần kiểm tra timeout, không chứng minh model hoàn toàn đã ngừng chạy. Các trial23:32 trước đó báo upstream_finish_reason/ai_invalid_response; không suy nguyên nhân hai lượt00:46 từ các mẫu khác.

## Kiến trúc và cấu hình hiện tại

Google model card mô tả31B dense ~30,7Bparameters/60layers;26B-A4B MoE ~25,2Btotal/~3,8Bactive/30layers, thuận lợi hơn về compute. Điều này giải thích hướng kỳ vọng tốc độ, không bảo đảm độ trễ hostedAPI hoặc chất lượng dịch.

App dùng90s first-answer cho cảGemma, idle7s chỉ tính textanswer, hard180s; clientcógrace. SửaHan nếu có thêm mộtcall tuần tự trong cùng harddeadline. Chương dưới3000ký tự ưu tiênnguyênchương, nên2357ký tự chỉmộtphần dù có chếđộchia song song. Context lớn hay trần output cao không đồng nghĩa tốc độ trả lời nhanh.

## Đề xuất theo phạm vi bằng chứng

Chưa đổi model/timer/prompt/deploy từ mẫu nhỏ. Cần ghi đủ server request của hai attempt và tách firstanswer/idle/total/repair cùng tokenusage. Sau đó mới so cùng prompt/nguồn tổng hợp an toàn giữa31B và26B-A4B, cả nguyênchương và chia phần. Chỉ nới idle riêng31B khi thấy khoảngnghỉ thực; không tăng harddeadline hoặc renewbudget vô hạn. Giữ modelFixed, ≤2request/lease, Stop, checkpoint và retry/quota hiệncó.

## Nguồn

- [Google: Gemma qua Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api): IDs được hỗ trợ, minimal=tắt/high=bật thinking.
- [Google model card](https://ai.google.dev/gemma/docs/core/model_card_4): dense/MoE và quy mô; không dùng benchmark tổng quát làm bằng chứng chất lượng dịch truyện.
- [Google prompt formatting](https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4): model lớn có thể phát thought channel khi đã tắt; không tự nhét controltoken vào REST prompt để thử.
- [Google troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting): retry hữu hạn với backoff/jitter cho lỗi tạm thời.

Log metadata không có nội dung/prompt/key tại `.dsh-tmp/gemma31-research-{logs,all}.json` và `gemma31-accepted-request.json`. Lượt query đầu API7403; query tiếp theo thành công. Không gọiAI thử, không đọc nội dung chương, không test/build/deploy hoặc sửa code/chính sách. Chỉ bổ sung báo cáo nghiên cứu.
