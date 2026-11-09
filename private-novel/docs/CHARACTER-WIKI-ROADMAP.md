# Roadmap đề xuất: Wiki nhân vật dùng lại được

**Trạng thái:** đề xuất, chưa được xếp lịch và chưa triển khai. Ghi nhận theo yêu cầu ngày 08/11/2026.

## Mục tiêu

Nâng từ **Quan hệ nhân vật** thành **Wiki truyện** để giữ tri thức cần cho dịch nhất quán nhiều chương. Có thể export/import một gói gồm Wiki, Name riêng và prompt riêng khi người dùng đổi sang bản text khác của cùng truyện.

Đây là dữ liệu theo từng truyện, local-first. Không tự tải truyện, không chia sẻ kho chung, không gửi nội dung nguồn lên dịch vụ mới. Import luôn yêu cầu người dùng chọn truyện đích và xem trước ghép nối; không tự gộp với truyện khác chỉ vì trùng tên.

## Nội dung gói

- **Nhân vật:** tên gốc, tên Việt, biệt danh/alias, thân phận, mô tả ngắn.
- **Quan hệ có hướng:** nhân vật A gọi nhân vật B thế nào và ngược lại; loại quan hệ; mốc chương bắt đầu/kết thúc hoặc lịch sử thay đổi.
- **Quy ước thể loại/bối cảnh:** ví dụ tiên hiệp, võ hiệp, cung đình, hiện đại; tôn xưng, thứ bậc và cách xưng hô mặc định. Quy ước này là ngữ cảnh cho quan hệ cụ thể, không tự quyết định quan hệ.
- **Thế giới truyện:** địa danh, môn phái/thế lực, chức vị, vật phẩm, cảnh giới và thứ bậc.
- **Nguồn cho từng dữ kiện:** chương/tiêu đề nguồn, trích đoạn ngắn hoặc vị trí làm bằng chứng, độ chắc chắn và trạng thái AI đề xuất/người dùng duyệt.
- **Name riêng và prompt riêng:** giữ đúng phạm vi truyện hiện có; Wiki bổ sung ngữ cảnh, không thay thế Name dùng để cố định cách chuyển tên/thuật ngữ.

## Tạo và dùng Wiki

Người dùng khởi tạo bằng danh sách **Nhân vật: tên gốc, tên Việt, biệt danh, thân phận** đã biết. Mục tiêu phân tích là tận dụng context lớn nhất model phù hợp chấp nhận được để rút ra tri thức truyện đủ rộng, rồi tạo ba đầu ra có liên kết với nhau: Wiki có nguồn, Name riêng dạng `$tên_gốc=tên_Việt`, và prompt riêng mô tả quy tắc dịch/xưng hô của truyện.

### Quy trình phân tích đề xuất

1. Người dùng chọn phạm vi chương và model phân tích trong danh sách model được app hỗ trợ. Hiển thị model, context ước tính, lượng chương/ký tự dự kiến, giới hạn request và cảnh báo chi phí/quota trước khi chạy. Không tự đổi model nếu hết quota.
2. Đếm token bằng tokenizer/API của đúng provider và model; lấy giới hạn input/output hiện hành từ metadata khi provider hỗ trợ. Tính ngân sách input hữu hiệu bằng cách trừ prompt hệ thống, schema/format, output dành cho Wiki, và safety margin khỏi context window. Không dùng “1 token ≈ N ký tự” làm giới hạn cứng.
3. Gom các chương nguyên vẹn vào từng gói lớn nhất nằm trong ngân sách input hữu hiệu, giữ tiêu đề, số thứ tự và ranh giới chương. Chương quá dài chia ở đoạn văn, giữ source offsets và thông tin phần để không lặp/mất nội dung. Chạy từng gói theo thứ tự chương, có dừng/tiếp tục và giới hạn lượt gọi cho cả job.
4. Mỗi gói chỉ trích xuất dữ kiện có bằng chứng: thực thể, tên gốc/biệt danh/thân phận, quan hệ có hướng và cách gọi, bối cảnh/thể loại, địa danh/thế lực/chức vị/vật phẩm/cảnh giới. Gắn từng dữ kiện với chương/tiêu đề, trích đoạn ngắn, độ chắc chắn và trạng thái đề xuất. Không có bằng chứng thì ghi chưa rõ, không tự điền cho đủ.
5. Hợp nhất kết quả các gói theo thực thể và tên gốc; phát hiện alias trùng, mâu thuẫn, đổi thân phận/quan hệ và thuật ngữ có nhiều cách dịch. Giữ lịch sử theo mốc chương; không gộp nhân vật chỉ vì tên Việt giống nhau.
6. Từ Wiki đã hợp nhất, tạo đề xuất Name và prompt riêng. Name giữ các cặp thay thế xác định được; prompt chỉ chứa quy tắc văn phong, bối cảnh và xưng hô cô đọng, không nhét toàn bộ Wiki vào prompt. Người dùng xem nguồn, duyệt/sửa từng mục hoặc nhóm, rồi chọn lưu. Không ghi đè Name/prompt hiện có khi chưa xem trước.

Với bản dịch nhiều chương, mỗi chương chỉ nhận dữ kiện có hiệu lực đến chương đó để tránh spoiler. Wiki toàn truyện có thể biết trước các diễn biến sau, nhưng luồng dịch chương phải lọc theo mốc. Kết quả phân tích một chương chỉ cập nhật phần Wiki tiếp theo sau khi được duyệt hoặc theo cơ chế duyệt rõ ràng do người dùng chọn. Bản dịch đã lưu không tự đổi khi Wiki/Name/prompt thay đổi; dịch lại phải là thao tác riêng.

### Khoảng cách với app hiện tại

Luồng **Tìm và dịch Name** hiện chỉ phân tích chương đang mở theo các phần tối đa 2.500 ký tự, xác minh key có trong nguồn và để người dùng chọn Name trước khi lưu. Đây là nền tái sử dụng cho kiểm tra nguồn/duyệt, nhưng chưa quét nhiều chương, hợp nhất Wiki, tạo prompt từ Wiki hoặc export/import combo.

Đường dịch AI hiện giới hạn mỗi nguồn 32.000 UTF-16 ký tự, prompt 8.000 ký tự, request body 256 KiB, output tối đa 8.192 token và deadline 60 giây. Do đó không thể đạt mục tiêu context dài bằng cách gọi lại endpoint dịch thông thường. Cần một loại job phân tích riêng, giới hạn/timeout/budget/output schema riêng, nhưng vẫn dùng model/provider allowlist, scheduler, cooldown, lease, hủy và chính sách key hiện có. Không tăng fan-out: tối đa hai request song song chỉ dành cho các phần của cùng một chương theo chính sách hiện tại; các gói phân tích chạy tuần tự.

## Export/import bản text khác

Gói export có phiên bản định dạng ổn định và chứa Wiki + Name + prompt riêng, không chứa toàn văn truyện. Giữ nguồn dữ kiện theo số/tiêu đề chương và trích đoạn ngắn để người dùng đối chiếu. Khi import vào edition khác, đối chiếu tên gốc/alias và bằng chứng; hiển thị mục khớp, mục chưa khớp và xung đột để người dùng chọn. Không dựa vào ID chương cũ hoặc offset cũ như bằng chứng đủ để tự ghi.

## Giới hạn và quyết định còn mở

- Tính năng phân tích cả truyện có thể tốn nhiều lượt AI; cần đánh giá quota/chi phí và độ chính xác trên truyện dài trước khi chốt phạm vi, không giả định free-tier đủ.
- Bản đầu nên quét theo dải chương và có thể tiếp tục; không làm chatbot toàn quyền sửa/xóa dữ liệu.
- Hàng đợi dịch nhiều chương, nếu được duyệt riêng, chạy tuần tự theo thứ tự chương để cập nhật Wiki theo tiến trình. Giữ nguyên giới hạn hiện tại: tối đa hai request đồng thời cho các phần của cùng một chương; không tăng fan-out.
- Chưa quyết định schema, thuật toán matching giữa các bản text, giao diện Wiki, số lượng chương mỗi lượt quét, hay tự động chấp nhận đề xuất.
- “Tối đa context” nghĩa là lấp gần ngân sách input hữu hiệu của model đã chọn theo số token đo thực tế; không có một con số ký tự chung và không đảm bảo một call đọc hết toàn bộ truyện. Truyện vượt cửa sổ phải đi qua các gói và bước hợp nhất; chất lượng nhớ chi tiết vẫn cần corpus test.
- Liên kết cảm hứng do người dùng cung cấp: [LoHi — hồ sơ nhân vật](https://lohi2.com/nhan-vat/155b3d2e-6b71-4398-9fe8-4a7f86ce16c1). Trang không truy cập được bằng công cụ đọc trong lượt ghi roadmap này; mô tả phía trên chỉ đặc tả mục tiêu người dùng nêu, không khẳng định đã kiểm tra chi tiết giao diện LoHi.
- [Thảo luận VOZ, trang 27](https://voz.vn/t/free-tool-dich-truyen-txt-epub-bang-ai-nghe-audio-lien-mach.1272474/page-27): tác giả nói đã quét phân tích từ đầu tới chương hiện tại để cập nhật quan hệ nhân vật phụ; phản hồi nêu bảng khó đọc khi có nhiều nhân vật. Đây là tín hiệu nhu cầu/UX, không phải bằng chứng về độ chính xác của dữ kiện AI.
- Liên quan hiện trạng: [Tìm và dịch Name trong chương](AI-NAME-DISCOVERY.md) hiện chỉ đề xuất Name có bằng chứng trong chương đang mở và yêu cầu người dùng chọn trước khi lưu; đây là nền gần nhất, chưa phải Wiki truyện.
- Kỹ thuật token/context tham khảo [Google Gemini token counting](https://ai.google.dev/gemini-api/docs/tokens) và [API model metadata](https://ai.google.dev/api/models): đếm input thực, lấy `input_token_limit`/`output_token_limit`; giới hạn thay đổi theo model/provider và endpoint.

## Trình tự xem xét khi được ưu tiên

1. Chốt trường dữ liệu Wiki và quy tắc lịch sử theo chương.
2. Thiết kế gói export/import có version, kiểm tra, preview và xử lý xung đột.
3. Thử nghiệm trích xuất/duyệt Wiki trên fixture tổng hợp, đo lượt gọi và chất lượng; chưa dùng truyện thật làm fixture mặc định.
4. Sau đó mới xem xét hàng đợi quét/dịch nhiều chương và UI quản lý Wiki.
