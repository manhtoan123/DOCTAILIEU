# Nhận diện chương và tiêu đề AI — 15/10/2026

Đã cải tiến nhập mới/preview và triển khai tiêu đề Convert trong chế độ AI. **Chưa thay cấu trúc chương của truyện đã lưu**; không dùng kết quả preview để ghi đè dữ liệu cũ.

Sửa `splitter.ts`: giữ disclaimer của người dịch trong phần đầu; nhận heading bọc `###…###`, tiền tố nguồn `@translator`, heading episode không có `第`, heading episode dính sau câu có dấu kết thúc. Trong kiểu episode đã được nhận, bảng kỹ năng/số mục/số tiền giữ trong thân chương; heading cùng episode khác ghi nguồn không tạo chương mới. Chuyển sang kiểu chương khác thì kết thúc policy episode. `332 ?.` chỉ có thể là mốc kế tiếp trong sequence; giữ nhãn nguồn, không đoán tên chương. Nhận numeral đã được parser hỗ trợ; custom regex vẫn kiểm raw line. Gộp heading chỉ khác khoảng trắng khi phần trước chỉ có heading; fullwidth `＋/－/−` trong bảng thuộc tính không tạo chương.

`Reader.tsx`: tiêu đề sách/chương dùng `ConvertedTitle` cả trong Convert và AI, với từ điển hiện có; RAW vẫn hiện nguồn. Không ghi tên Convert lên metadata. Nếu từ điển thiếu/không dịch được, vẫn giữ nguồn, không xóa chữ để tạo tiêu đề giả.

## Audit truyện hiện có

Đã đọc mục lục 14 truyện cloud theo chỉ đạo người dùng: 12 TXT, 2 EPUB. Snapshot tải về kiểm checksum manifest; mọi bản chia thử TXT có SHA toàn văn nối theo order khớp trước/sau. Không đọc/copy/upload D; không ghi DB/cloud truyện. Dữ liệu audit trong `.dsh-tmp/chapter-audit/`, đã bổ sung ignore để không lọt vào Git.

| Truyện | Đang lưu | Chia thử tự động | Kết luận |
|---|---:|---:|---|
| SSS cấp tự sát thức thợ săn | 701 | 401 | Đủ 400 episode 1–400 + phần ghi chú; bảng kỹ năng nằm trong body; chữ giữ nguyên. |
| Cẩu nữ ma đầu | 144 | 1.571 | Nhận lại 1.488 heading bọc dấu; còn heading ngoài wrapper/ghi chú cần đối chiếu. |
| Đạo quỷ dị tiên | 2.019 | 1.366 | Gộp nhiều heading lặp khác khoảng trắng; chưa công nhận count là mục lục cuối. |
| Luân hồi nhạc viên | 4.192 | 6.539 | Kết quả có mốc nghi vấn; **không áp dụng** parser mặc định lên truyện cũ. |

Các TXT khác cũng đã kiểm; không suy ra “đúng mục lục” chỉ từ count/SHA, không thay cấu hình chia đã chọn trước đây. EPUB giữ spine gốc.

## Kiểm chứng

Full unit **116 file / 1.546 PASS**, build PASS. Reviewer độc lập cấu hình gpt-6.1-sol/high: final 51 targeted PASS, gồm 17 test độc lập; nghiệm thu nhập mới/preview, chưa nghiệm thu migration/all-book recognition. Các finding về custom regex, wrapped/numeral policy, chuyển kiểu chương và damaged heading đã sửa. Logs fail giữ lại.

E2E **12 PASS** (tiêu đề AI + nhập/preview/single/batch/folder/encoding/invalid/stale ở desktop và android-layout). Lượt đầu spec cũ dùng nhãn `TXT` trong khi UI đã là `TXT / EPUB`; đã dừng lượt fail, giữ log và sửa locator theo UI thật, không sửa sản phẩm né lỗi. Production smoke tổng hợp/cô lập cloud: giữ toàn văn, không chia bảng kỹ năng, tiêu đề AI Convert và RAW giữ nguồn PASS. Hybrid v2 production smoke kiểm lại PASS trên bundle mới. Chưa Android thật.

Pages **fd1ce8bb/master**, **index-gh9PLx5A.js**; AIWorker v2 **b209f899-8c1d-4c57-8667-ff31e2bb65a5** không đổi. Logs `.dsh-tmp/chapter-audit/`; scripts `audit-chapter-splits.ts`, `compare-chapter-preview.ts`, `smoke-chapter-production.mjs`.

Next: [phương án áp dụng cấu trúc mới vào truyện cũ](CHAPTER-REPAIR-M0.md), cần giữ IDs/progress/edits và đồng bộ; chưa triển khai.
