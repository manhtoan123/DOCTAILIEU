# Hybrid: nguồn và bản dịch nửa đầu làm mẫu — 15/10/2026

Đã hoàn tất và triển khai phần còn thiếu sau [prompt nửa sau độc lập](AI-HYBRID-PROMPT-2.md): V3 gửi cả nguồn gốc và toàn bộ bản dịch nửa đầu để Lite đối chiếu cách dịch.

## Luồng và prompt

1. Chế độ kết hợp vẫn mặc định tắt. Chương ngắn dùng model ưu tiên như trước.
2. Model ưu tiên dịch nửa đầu; lỗi giữ tiến độ để thử lại, không tự hạ nửa đầu xuống Lite.
3. Lite nhận Name, nguồn nửa đầu, toàn bộ bản dịch nửa đầu và nguồn nửa sau. TXT dùng đúng lát nguồn đã chọn; EPUB dùng các text piece theo cùng thứ tự với bản dịch, không gửi DOM/CSS/ảnh/path.
4. Chỉ nửa sau cần dịch. Hai nửa vẫn dùng chung System Prompt; User Prompt nửa sau chỉnh độc lập.

Các biến trong ô **Prompt nửa sau**:

| Biến | Giá trị |
|---|---|
| `{{name}}` | Name liên quan trong chương, ảnh chuyển thành caption |
| `{{firstHalfSource}}` | Toàn bộ nguồn nửa đầu, chuỗi JSON |
| `{{firstHalfTranslation}}` | Toàn bộ bản dịch nửa đầu, chuỗi JSON |
| `{{text}}` | Nguồn đích nửa sau; EPUB giữ định dạng JSON theo System Prompt |

Alias nguồn: `{{text nửa đầu}}`, `{{nguồn nửa đầu}}`, `{{text nửa trước}}`. Alias bản dịch: `{{bản dịch nửa đầu}}`; alias đích: `{{text nửa sau}}`. Name, mẫu dịch, đích phải có đúng một lần; nguồn mẫu có tối đa một lần. Nếu template riêng cũ không chứa biến nguồn, ứng dụng tự chèn nguồn mẫu trước template. Không ghi đè template đã lưu. Muốn nhận trọn chỉ dẫn mới, bấm **Khôi phục prompt nửa sau** rồi lưu.

Prompt mặc định yêu cầu đối chiếu cặp mẫu, ưu tiên Name, giữ nghĩa/phủ định/nhân quả, dịch nhãn và thành ngữ, bỏ chữ Hán còn sót và dùng xuống dòng thật. Các chỉ dẫn này giảm lỗi; không bảo đảm mọi bản dịch đúng nghĩa.

## Bảo toàn và tương thích

Không đổi file gốc, bytes/SHA, cấu trúc EPUB hoặc dữ liệu đọc. Đổi prompt/model nửa sau vẫn dùng lại checkpoint nửa đầu nếu đầu vào nửa đầu khớp. Whole-cache v3 khác v2 kể cả khi template riêng không đổi; stage2 thêm hash nguồn mẫu cùng hash bản dịch và template. Stage0 giữ nguyên identity; đọc checkpoint cũ như trước, không sửa row cũ.

API tiếp tục nhận v1/v2 cũ. V3 kiểm nguồn và mẫu mỗi phần tối đa 96.000 ký tự, template 8.000, request 256 KiB và rendered prompt 128.000 ký tự. Tính cả JSON escaping; quá giới hạn báo lỗi, giữ nửa đầu để dùng lại, không cắt mẫu âm thầm. Thay biến một lượt, nội dung chứa `{{text}}`/`{{name}}` không bị thay tiếp. Giữ nguyên key/server secret, ngân sách chung, pin, cancel và fallback hiện hành.

## Nghiệm thu

Targeted root 238 PASS. Reviewer độc lập cấu hình gpt-6.1-sol/high: 55 PASS, gồm 7 test mới cho EPUB correspondence, cache provenance, cancel trong source hashing, quote expansion, giữ checkpoint khi mẫu quá lớn, API v1/v2. Không finding chặn. Log `.dsh-tmp/ai-hybrid-pair/`.

Full **118 file / 1.568 PASS**, build PASS; E2E hybrid/speed/EPUB **26 PASS**, save/retry/reload **6 repeat PASS**. Phép thử phát hiện Save chạy lại request cũ do dependencies prewarm; đã sửa Reader giữ promise/error/prefix theo `[aiKey,aiRetry]`, rebind progress, không lặp xử lý quota. Review độc lập Reader **4 E2E PASS** trên Chrome/Android-layout, gồm Save khi lỗi và khi request đang chờ. Save áp dụng prompt mới từ retry/re-entry/navigation; không tự dịch lại chương đang đọc.

Production smoke tổng hợp cô lập cloud PASS: v3 gửi đủ cặp mẫu, prompt riêng cũ tự thêm nguồn, RAW giữ nguyên và reload không thêm request. Pages **0345c1ff/master**, bundle **index-BGL1sep9.js**; AIWorker **d8262905-2412-49b8-b1b8-df5326d4f909**. Android thật chưa kiểm trong tác vụ này.

API thật: một chương đã chọn **2.771 ký tự**, cold session không cache và không ghi cloud. Nửa đầu 1.369, nửa sau 1.402 ký tự; 3.7 Flash lỗi upstream sau 3,73s, fallback 2.5 Flash trả nửa đầu sau 26,13s. Lite 3.5 nhận đủ nguồn 1.369 + bản dịch mẫu 4.234 ký tự và trả nửa sau trong **5,80s**; cả luồng **35,68s**, 3 request tuần tự. Kết quả 0 chữ Hán/0 chuỗi `\n` literal, hai nửa STOP; đoạn kết đối chiếu đúng ý nguồn. Đây chỉ là một chương, không chứng minh tỷ lệ thành công hay chất lượng chung. Log `real.json`, bản dịch `real-chapter.txt`; script `benchmark-ai-paired-sample.ts` giới hạn 8 send/100s.
