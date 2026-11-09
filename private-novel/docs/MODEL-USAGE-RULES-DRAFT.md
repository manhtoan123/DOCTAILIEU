# Quy tắc sử dụng model — bản đã chốt

Ngày: 27/10/2026. Trạng thái: **người dùng đã chốt; đã tích hợp vào AGENTS.md**.

Phạm vi: model và agent Codex làm công việc phát triển, kiểm tra và vận hành dự án. Bộ quy tắc được xây dựng độc lập với các quyết định phân model trước đây và đã được người dùng chốt áp dụng. [AGENTS.md](../../AGENTS.md) là hướng dẫn thực thi hiện hành; tài liệu này giữ diễn giải và ví dụ. Cập nhật hướng dẫn không tự thay model chat đang chạy hoặc cấu hình Codex.

## 1. Mục tiêu và cách chọn

Ưu tiên kết quả đúng, bảo toàn chức năng và kiểm chứng được. Thời gian và usage được tối ưu sau khi đáp ứng tiêu chí chất lượng. Chọn theo tính chất công việc, độ bất định và hậu quả nếu sai; tránh xếp hạng một model là tốt nhất cho mọi nhiệm vụ.

Ba lựa chọn được quyết định riêng: **model**, **mức suy nghĩ**, **số agent**. Tăng một lựa chọn không kéo theo tăng hai lựa chọn còn lại.

## 2. Phân vai

| Model | Vai trò ưu tiên | Mức khởi đầu |
| --- | --- | --- |
| GPT-6 Astra — `gpt-6-astra` | Agent chính cho yêu cầu hỗn hợp; kiến trúc, điều tra lỗi chưa rõ nguyên nhân, quyết định có hậu quả lớn, giải quyết bằng chứng mâu thuẫn | Medium; High khi rủi ro hoặc độ bất định cao |
| GPT-6.1 Sol — `gpt-6.1-sol` | Triển khai tính năng có yêu cầu rõ; sửa logic trong phạm vi đã xác định; viết regression và review logic thông thường | Medium; High cho nhiều trạng thái hoặc tương tác phức tạp |
| GPT-6.1 Terra — `gpt-6.1-terra` | Đọc ảnh, thao tác browser/desktop, sửa UI có phạm vi rõ, kiểm tra kết quả render, viết hướng dẫn và thông báo kỹ thuật | Medium |
| GPT-6 Luna — `gpt-6-luna` | Tìm vị trí code, thu thập log, trích xuất thông tin, tổng hợp tài liệu và kiểm tra cơ học có tiêu chí rõ | Low |

Đây là cách phân việc ưu tiên. Terra và Luna vẫn có khả năng viết code; giới hạn giao Luna công việc đọc/thu thập là lựa chọn vận hành để giảm rủi ro kết luận hoặc sửa sai. Vai trò Terra không đồng nghĩa Terra luôn thiết kế đẹp hơn hoặc hiểu code tốt hơn model khác.

Agent chính mặc định là Astra. Với nhiệm vụ nhỏ, độc lập và có nghiệm thu rõ, model phù hợp có thể làm trọn nhiệm vụ; không bắt buộc thêm một agent điều phối chỉ để duyệt lại mọi chỉnh sửa nhỏ.

Ví dụ cho dự án:

- Công tắc khó nhìn trên ba màu: Terra sửa CSS/component liên quan, kiểm tra bật/tắt, focus và ảnh desktop/mobile.
- Một tính năng có yêu cầu và phạm vi rõ: Sol triển khai và kiểm tra luồng tương ứng.
- Nghe sách mất vị trí hoặc AI có race khó tái hiện: Astra điều tra; có thể giao Sol dựng regression độc lập sau khi xác định được ranh giới công việc.
- Backup, khôi phục, migration, secret hoặc cloud-delete: Astra phụ trách quyết định và nghiệm thu; có reviewer độc lập theo mục 5.
- Tìm tất cả nơi ghi tiến độ: Luna trả danh sách vị trí và bằng chứng, chưa tự kết luận nguyên nhân từ tên hàm hoặc một dòng log.

## 3. Mức suy nghĩ và điều kiện chuyển

- **Low:** tìm, trích xuất hoặc biến đổi cơ học với tiêu chí rõ.
- **Medium:** mức khởi đầu cho triển khai, UI và công việc nhiều bước đã xác định phạm vi.
- **High:** cần lần theo nhiều trạng thái, kiểm tra edge case, xử lý bằng chứng trái nhau hoặc quyết định có rủi ro đáng kể.
- **XHigh/Max:** dành cho bài toán khó còn câu hỏi suy luận cụ thể chưa giải quyết sau khi đã thu đủ bằng chứng. Ghi ngắn câu hỏi cần giải quyết trước khi nâng mức; thời gian chạy lâu tự nó không phải lý do nâng.
- **Ultra:** chỉ dùng khi người dùng chọn rõ, vì chế độ này còn ảnh hưởng cách điều phối agent.

Sau hai phương án có kiểm chứng vẫn không tiến triển, hoặc khi phát hiện bài toán vượt khả năng/phạm vi được giao, agent phụ trả lại cho Astra: điều đã biết, giả thuyết đã loại, bằng chứng còn thiếu và đề xuất tiếp theo. Nếu chính Astra đang bế tắc, Astra tổng hợp bằng chứng, xét lại giả định và xác định thông tin hoặc quyết định còn thiếu; hỏi cụ thể khi thông tin đó quyết định kết quả. Không tiếp tục vá hoặc giao lại cùng việc trên cùng giả định chưa được kiểm chứng.

Lỗi mạng, môi trường, quota hoặc quyền truy cập được chẩn đoán riêng; chỉ thử lại khi có căn cứ và giới hạn. Chuyển model phải có lý do liên quan năng lực, khả dụng hoặc lựa chọn của người dùng. Không âm thầm hạ model cho quyết định rủi ro cao.

## 4. Quy tắc dùng nhiều agent

- Mặc định giao một người chịu trách nhiệm trọn nhiệm vụ. Tách agent khi có phần việc thực sự độc lập, cần góc nhìn kiểm chứng độc lập hoặc có thể giảm thời gian đáng kể mà vẫn giữ chất lượng.
- Trần hiện hành: **3 agent hoạt động đồng thời, gồm agent chính và tối đa 2 agent phụ**. Đây là trần, không phải số phải dùng cho mỗi nhiệm vụ. Tăng trần cần người dùng chốt riêng.
- Có thể chạy song song việc đọc code, phân tích log hoặc nghiên cứu các phần độc lập. Việc phụ thuộc kết quả trước đó phải chờ kết quả đó.
- Mỗi vùng sửa code có một chủ sở hữu tại một thời điểm. Hai agent không sửa cùng file đồng thời. Agent chính chịu trách nhiệm tích hợp.
- Giao việc bằng ngữ cảnh tối thiểu nhưng đủ: mục tiêu, file/phạm vi, hành vi phải giữ, điều kiện nghiệm thu và kết quả cần trả. Không mặc định sao chép cả lịch sử chat.
- Agent phụ trả phát hiện, đường dẫn/vị trí, bằng chứng kiểm tra và giới hạn xác minh. Agent chính kiểm tra và giải quyết mâu thuẫn trước khi chốt.
- Nếu mô hình chính đang đủ năng lực và công việc chỉ tuần tự, tiếp tục một agent; không chia vai hình thức.

## 5. Review và nghiệm thu theo rủi ro

| Loại thay đổi | Kiểm chứng theo rủi ro |
| --- | --- |
| Chỉ tài liệu/copy | Kiểm nội dung, link và diff; không build ứng dụng khi không liên quan |
| CSS/UI không đổi dữ liệu | Build; kiểm tra luồng/render liên quan trên desktop/mobile; đủ ba màu và các trạng thái bị ảnh hưởng khi có đổi màu; không bắt buộc reviewer riêng |
| Logic thông thường | Regression theo hành vi + build; kiểm tra runtime/E2E tại ranh giới bị đổi; thêm Sol High review khi có nhiều trạng thái, nhiều module hoặc rủi ro hồi quy đáng kể |
| Dữ liệu, auth/secret, migration, backup/restore, xóa cloud hoặc giao thức có hậu quả lớn | Reviewer Astra High độc lập + kiểm tra integrity/cancellation/race liên quan, bộ integration/full suite phù hợp và runtime/E2E đúng ranh giới thay đổi |

Reviewer độc lập là một agent không viết phần thay đổi đang được review. Cùng tên model không làm mất tính độc lập; đổi tên model cũng không tự tạo ra tính độc lập. Reviewer đọc hành vi mong muốn, invariant, diff liên quan và bằng chứng test; trả findings và giới hạn, giữ chế độ đọc. Agent chính xử lý findings và quyết định nghiệm thu.

Review phải bao phủ phiên bản diff cuối của phần cần review. Khi sửa muộn ảnh hưởng invariant hoặc cách khắc phục finding, reviewer kiểm lại đúng phần bị ảnh hưởng trước nghiệm thu; ghi rõ phiên bản/phạm vi đã kiểm, tránh áp kết luận của diff cũ cho thay đổi mới.

Gộp thay đổi trước lượt integration cuối. Kiểm tra đã đạt chỉ chạy lại khi có thay đổi ảnh hưởng phạm vi bao phủ hoặc có nghi vấn chưa giải quyết. Phân biệt rõ unit, build, runtime, kiểm tra hình ảnh và deploy; ảnh đẹp không đủ chứng minh logic đúng, build đạt không đủ chứng minh đã deploy.

Chỉ báo hoàn thành khi có bằng chứng cho các tiêu chí đã chốt. Khi còn giới hạn như Android mô phỏng, AI upstream giả lập hoặc chưa kiểm chứng dữ liệu thật, nêu đúng giới hạn đó.

## 6. Cơ chế áp dụng thực tế

- AGENTS.md chứa quy tắc phân việc và nghiệm thu. Model/effort thực tế phải được chọn qua giao diện, cấu hình hoặc lời gọi giao agent mà runtime hỗ trợ.
- Lời ghi trong Markdown không tự thay model của chat đang chạy. Agent chính giữ model thực tế của phiên cho tới khi có thay đổi được runtime xác nhận; có thể giao phần việc cho agent phụ với model cụ thể khi được hỗ trợ.
- Chỉ ghi tên model/effort đã được runtime xác nhận; nếu không xác minh được thì ghi chưa xác minh.
- Khi model phụ không khả dụng: ưu tiên chuyển phần việc về Astra đang khả dụng, giữ nguyên tiêu chí nghiệm thu và báo thay đổi thực tế. Nếu thiếu model/công cụ cần thiết cho việc rủi ro cao, chuẩn bị phần độc lập và báo điểm còn thiếu, không giả vờ đã thực thi bằng model đó.
- AGENTS.md đã được cập nhật theo các mục người dùng chốt. Cấu hình/runtime được xử lý theo cơ chế được hỗ trợ; giữ nguyên dữ liệu ứng dụng và quyền công cụ ngoài phạm vi quy tắc model.

## 7. Đánh giá để điều chỉnh quy tắc

So sánh trên các nhiệm vụ đại diện: sửa UI ba màu, sửa luồng TTS, lỗi scheduler AI, thêm chương TXT và integrity backup/restore. Các ca thử dùng dữ liệu tổng hợp cô lập.

Đánh giá theo: đúng hành vi, lỗi hồi quy còn sót, số vòng sửa lại, thời gian tới kết quả đã kiểm chứng và usage nếu quan sát được. So sánh model trên cùng đầu vào/tiêu chí trước; khi so mức suy nghĩ, giữ model và đầu vào cố định. Không lấy một benchmark hoặc thời gian trả lời đầu tiên để kết luận model tốt nhất.

## 8. Các điều khoản đã chốt

1. Astra là model chính mặc định; Medium khởi đầu, High khi đủ điều kiện rủi ro/độ bất định.
2. Sol triển khai logic, Terra xử lý UI/ảnh/thao tác và viết, Luna thu thập/kiểm tra cơ học.
3. Trần 3 agent đồng thời, chỉ tách khi có lợi ích cụ thể.
4. Review rủi ro cao bằng Astra High độc lập; reviewer thông thường theo nhu cầu.
5. Cho phép điều chỉnh model/effort theo các điều kiện trong quy tắc; Ultra và tăng trần agent vẫn là lựa chọn riêng.

## Nguồn và giới hạn

- [OpenAI Docs — Model selection](https://developers.openai.com/api/docs/guides/model-selection): định hướng năng lực model và cách so sánh bằng nhiệm vụ thực tế.
- [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra): vai trò và mức reasoning được hỗ trợ.
- [OpenAI Docs — Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): phân công, cấu hình model/effort, chi phí ngữ cảnh và phối hợp.

Đã đối chiếu ngày 27/10/2026. Phân vai, mức khởi đầu, ngưỡng chuyển và trần agent là lựa chọn vận hành đã được người dùng chốt; chưa có benchmark của dự án chứng minh đây là cấu hình tối ưu tuyệt đối.
