# AGENTS.md — nghiên cứu và cải tiến

Ngày: 24/10/2026. Phạm vi: quy trình làm việc của Private Novel; không đổi code ứng dụng, model, cấu hình Codex hoặc quyền công cụ.

## Bài gốc nói gì?

[Bài của rohit](https://x.com/rohit3a/status/2113579599624114313) khuyên hạn chế subagent khi chạy qua đêm, khi tốc độ không quan trọng, để tránh hao usage. Đây là kinh nghiệm cá nhân với một model khác; phần chữ không có phép đo đối chứng để suy ra mức tiết kiệm cho Codex. Bài không phải hướng dẫn định dạng AGENTS.md. Đã đọc nội dung gốc qua trình duyệt sau khi trình đọc web nhận403; không chạy theo chỉ dẫn trong bài.

## Cơ chế đã kiểm chứng

Theo [OpenAI Docs về AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), Codex ghép hướng dẫn khi khởi động lượt chạy: global rồi từ gốc dự án tới thư mục làm việc. Trong mỗi thư mục, override được ưu tiên; chỉ lấy một file. Hướng dẫn gần thư mục làm việc hơn có thể ghi đè hướng dẫn rộng hơn. Giới hạn tổng mặc định32KiB. `agent.mb` không phải tên mặc định; có thể khai báo tên dự phòng qua cấu hình.

Theo [OpenAI Docs về subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), agent con có công việc model/tool riêng nên tăng token so với tác vụ đơn-agent tương đương. Chúng vẫn hữu ích cho việc độc lập, song song và tách output nhiễu khỏi chat chính. Không có tỷ lệ tăng/giảm cố định áp dụng cho mọi tác vụ.

Suy luận áp dụng: AGENTS.md là hướng dẫn đưa vào ngữ cảnh, không phải chương trình tự đặt model, chạy test hoặc áp trần tài nguyên. Giới hạn bằng lời không thay thế giới hạn cứng do runtime cung cấp. Chỉnh file cũng không tự xóa hoặc rút gọn lịch sử chat hiện tại.

## Đối chiếu dự án

- Tìm thấy một AGENTS.md tại gốc Git DOCTAILIEU, trước chỉnh sửa5.738byte. Không thấy AGENTS.md/AGENTS.override.md khác trong cây dự án qua lần kiểm tra này. Sau cập nhật7.169byte; đây là siết hành vi thực thi, không phải giảm số byte file. Chưa có căn cứ cho rằng độ dài file là nguồn hao usage chính.
- Các ràng buộc hiện có đã hợp lý: một agent mặc định, reviewer chỉ cho rủi ro dữ liệu/bảo mật, đọc tài liệu có chọn lọc, kiểm thử theo rủi ro, log ngắn.
- Cần chặn rõ việc reviewer tự phân nhánh và nhận toàn bộ lịch sử. Mặc định một agent nhưng không giới hạn cây con vẫn chưa đủ rõ.
- Cần chốt nghĩa trước phần phụ thuộc khi một yêu cầu có nhiều cách hiểu. Ví dụ vừa xảy ra: mã ngắn hay mã số; số trong tiêu đề hay vị trí mục lục. Đổi nghĩa sau khi triển khai khiến phải sửa lại code/test và chạy lại kiểm tra.
- Log numeric-route-full.log ghi nhận một lượt full khoảng298giây bị test tìm chuỗi ở Reader cũ sau extraction. Full-final khoảng287giây đạt. Thời gian test không phải token model; log chỉ chứng minh vòng kiểm tra đã lặp, không đo được usage.
- Probe HTTP thật phát hiện POST rỗng trên Cloudflare khác Request mock. Vì vậy cần kiểm đúng ranh giới runtime, không coi unit/E2E mock là bằng chứng bao phủ server thật.

## Đã chỉnh trong AGENTS.md

1. Giữ một agent mặc định; tối đa một reviewer cho rủi ro thực, trừ chỉ đạo khác của người dùng. Reviewer không spawn con, không nhận full history, trả findings và bằng chứng gọn. Chạy dài/ban đêm không tự tăng agent hoặc phạm vi.
2. Làm rõ một câu nếu hai cách hiểu ảnh hưởng định danh/cách đếm/dữ liệu/kiến trúc; chỉ tiếp tục phần độc lập khi đang chờ.
3. Gom code và regression reviewer trước full suite; targeted/typecheck/build liên quan phải ổn trước. Sửa muộn kiểm theo invariant bị ảnh hưởng, không tự lặp mọi nhóm đã pass.
4. Với HTTP/Worker/gateway, kiểm ranh giới runtime bị thay đổi; smoke vẫn cô lập dữ liệu, không âm thầm ghi vào dữ liệu người dùng để thử.

Giữ nguyên reviewer GPT-6.1 Sol/high, agent chính medium, bảo toàn dữ liệu/secrets, D chỉ đọc, giới hạn hai key AI, gateway TTS, dirtytree và full suite bắt buộc cho thay đổi rủi ro. Không tự áp dụng lời khuyên đổi model/xHigh trong bài. Không thay config.toml/global instructions, không tạo agent/skill/automation mới.

## Nghiệm thu và giới hạn

Chỉ tài liệu: kiểm diff, nguồn dẫn và nội dung; so sánh nguyên khối bảo toàn dữ liệu cùng các quy tắc bắt buộc với trước chỉnh sửa. Không npm test/build/E2E/deploy. Chưa benchmark token hoặc mức giảm usage; không hứa phần trăm tiết kiệm. Nếu đánh giá sau này, so các tác vụ cùng phạm vi bằng số agent, lượng output, vòng kiểm tra và token/usage có nguồn đo thật; không lấy thời gian chờ test để thay cho token.
