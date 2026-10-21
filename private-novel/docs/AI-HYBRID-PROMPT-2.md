# Prompt nửa sau độc lập — 15/10/2026

Đã triển khai ô **Prompt nửa sau** thay ô Quy ước xưng hô. Hai nửa dùng chung System Prompt nhưng có User Prompt riêng. Chế độ kết hợp vẫn là lựa chọn thử nghiệm, mặc định tắt.

## Dữ liệu và bộ nhớ

- `{{name}}`: Name dùng trong chương, giá trị có ảnh được gửi dưới dạng tên/caption.
- `{{firstHalfTranslation}}` hoặc `{{bản dịch nửa đầu}}`: toàn bộ bản dịch nửa đầu, truyền dưới dạng chuỗi JSON để phân biệt dữ liệu với chỉ dẫn.
- `{{text}}` hoặc `{{text nửa sau}}`: nguồn nửa sau cần dịch. Mỗi nhóm biến bắt buộc xuất hiện đúng một lần.
- V2 chỉ gửi bản dịch mẫu. Đợt hoàn thiện [hybrid v3](AI-HYBRID-PAIR-3.md) bổ sung nguồn nửa đầu bằng `{{firstHalfSource}}`, cùng cơ chế tự chèn cho template riêng cũ. Xem tài liệu v3 để biết trạng thái triển khai và nghiệm thu hiện hành.

Chỉ sửa prompt/model nửa sau sẽ giữ checkpoint nửa đầu nếu nguồn, Name và các đầu vào nửa đầu còn khớp. Phần sau có khóa riêng theo mẫu và prompt mới. Đọc tương thích checkpoint v1 của cả hai lựa chọn Lite; không sửa row cũ, không dùng lại phần sau v1. Đổi nguồn hoặc Name vẫn vô hiệu hóa kết quả liên quan. Nút Lưu giữ bản đang đọc; thử lại hoặc lần yêu cầu tiếp theo dùng prompt mới.

V1 API tiếp tục nhận khách cũ; v2 thay prompt nửa sau bằng template đã kiểm tra. Thay biến một lượt, không thực thi hoặc thay tiếp biến nằm trong Name/mẫu. Giữ giới hạn sample 96.000 ký tự, template 8.000, request 256 KiB, render 128.000 và ngân sách/cancel/model pin hiện có. Không thêm key/provider/billing.

## Sửa chỉ dẫn dịch

Default yêu cầu giữ đúng ý/phủ định/nhân quả, thuật ngữ và tên đầy đủ; dịch nhãn/tiêu đề bằng ví dụ cụ thể; không bắt chước chữ Hán hoặc lỗi trong mẫu. Không xuất kiểu `碰运气 (thử vận may)`; dùng diễn đạt tiếng Việt theo ngữ cảnh. Văn bản thường dùng xuống dòng thật thay ký tự `\n`; EPUB vẫn trả JSON hợp lệ theo System Prompt. Người dùng đã lưu template riêng có thể bấm **Khôi phục prompt nửa sau** để nhận chỉ dẫn mới; không ghi đè prompt tùy chỉnh tự động.

## Kiểm tra và giới hạn

Full unit **114 file / 1.518 PASS**, build PASS; E2E hybrid+speed **24 ca riêng biệt PASS**, sau sửa tương thích kiểm lại **10 ca reload PASS**. Review độc lập cấu hình gpt-6.1-sol/high: 193 regression, sau tương thích 41 regression PASS, không còn finding. Sau chỉnh câu chữ đã kiểm 24 unit prompt/review và build lại. Log trong `.dsh-tmp/ai-hybrid-prompt/`.

Production smoke dữ liệu tổng hợp: prompt riêng, alias tiếng Việt, đầy đủ mẫu, hai model, RAW giữ nguyên, reload không gửi AI lại PASS; chặn toàn bộ cloud trong context kiểm tra. Đây là kiểm tự động/layout, chưa phải Android thật.

API thật: 6 request so sánh v1/v2 đầu tiên. 3.5 Lite trả cả 3 nhưng còn 8 chữ Hán ở nhãn và 3 chữ trong chương; 3.1 Lite cả 3 lỗi 502. Sau thêm ví dụ tiêu đề và nhắc không bắt chước lỗi mẫu, 4 request v2: **3.5 Lite 2/2 trả được, 0 chữ Hán, 5,47 và 6,36 giây**; 3.1 Lite 0/2, lỗi 502. Đầu vào nửa sau 971/1.400 ký tự, dùng mẫu cố định 3.527/4.322 ký tự; tối đa 2 request đồng thời, không fallback/retry. Output có xuống dòng thật. Kiểm đọc thấy mạch chuyện/Name được giữ nhưng vẫn có lỗi từ như “giãy giội”; sạch chữ Hán không chứng minh hoàn toàn đúng nghĩa. Không suy ra tỷ lệ thành công chung từ hai mẫu; không tự sửa bản dịch đã lưu của truyện.

Logs: `quality.json`, `refined/quality.json`, bản dịch `.txt`, `production.json`; scripts `benchmark-ai-second-prompt.ts`, `smoke-ai-second-prompt-production.mjs`.

Pages hiện tại **fd1ce8bb/master**, bundle **index-gh9PLx5A.js** (kèm bản sửa tiêu đề/nhận diện chương); AIWorker **b209f899-8c1d-4c57-8667-ff31e2bb65a5**. Canonical production và hybrid smoke đã kiểm lại trên bundle này. Các lỗi provider/ý nghĩa vẫn có thể xảy ra.
