# Lọc quảng cáo khi nhập truyện

## Phạm vi

Từ bản cập nhật 02/11/2026, nhập mới TXT/EPUB/PDF/DOCX tự bỏ nhãn nguồn nhận diện rõ ở đầu/cuối tên truyện/chương, ví dụ `[sxsy.org]`. Nội dung đọc bỏ các dòng độc lập như `本文件来自尚香书院。`, `发布页：sxsy.org`, URL nguồn trong danh sách nhận diện, và đường kẻ sát khối quảng cáo. Không xóa dòng chỉ vì có từ khóa nằm trong lời truyện.

TXT lọc dòng hoàn chỉnh trước khi chia chương, dùng chung quy tắc cho xem trước và nhập; không đổi splitter dùng bởi các tính năng khác. Buffer dòng giới hạn 4.096 ký tự, dòng dài không nhận diện sẽ được giữ nguyên. Folder TXT áp dụng trước khi split. Nếu chỉ còn quảng cáo/không có chữ truyện, TXT không tạo sách rỗng.

EPUB lọc DOM tách biệt ở các khối lá, giữ ảnh và định dạng; không xóa container bao cả chương. PDF/DOCX đi qua cùng pipeline EPUB, cả xem trước và bản nhập bật lọc. Sanitize/render mặc định không bật lọc, tránh sửa sách đã lưu khi mở lại. Giữ nguyên spine/mục lục EPUB, nên một mục chỉ chứa quảng cáo có thể thành trang trống thay vì bị xóa khỏi cấu trúc.

Original Blob, tên/đường dẫn nguồn, encoding, bytes và SHA không thay đổi. Không chạy sửa dữ liệu cũ, không đổi backup/restore/cloud. Nguồn tải về vẫn là bản gốc có quảng cáo. Append vào sách cũ đi qua nội dung nhập đã lọc; sách cũ chưa lọc có thể cần xác nhận mốc theo luồng append hiện có.

## Tham khảo và điều chỉnh

- Đọc tham khảo script Python `xóaxóa…py` do người dùng chỉ định trong `D:\linh tinh\tm\STV Novel\mới chưa sửa\`. Không chạy, sửa hoặc sao chép file/mã. Áp dụng ý tưởng nhận diện nhãn nguồn chung cho tên và nội dung, dùng quy tắc hẹp hơn thay vì xóa mọi dòng chứa từ khóa; không ghi đè file nguồn.
- [RSSHub, ft/myft.ts](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/ft/myft.ts): loại khối quảng cáo được nhận diện cụ thể khỏi DOM nội dung. Điều chỉnh thành kiểm tra khối lá và giữ ảnh/inline, không thêm Cheerio hoặc dependency.

## Giới hạn

Không dùng AI và không nhận diện mọi mẫu quảng cáo. Quảng cáo trộn với lời truyện, nhiều inline/`br` hoặc domain ngoài danh sách có thể được giữ lại để tránh mất nội dung. Không tự xử lý truyện đã nhập trước cập nhật. Không sửa hoặc OCR chữ nằm trong ảnh.

## Kiểm chứng

- Regression targeted: 62/62 pass, gồm phân mảnh decoder 1/7/8/13/4096/262144 ký tự, CRLF, Unicode, chia phần 8 ký tự vẫn giữ URL trong câu; các kiểm tra import/folder/EPUB/document/cancel hiện có. `.dsh-tmp/import-ads-targeted-final.log`.
- Review độc lập đọc bản cuối: ba P2 ban đầu (fragment inline, lọc sau split, preview tài liệu lệch) đã sửa; không còn P1/P2 chặn. Reviewer chạy thêm 30 ca đối chiếu whole/stream và biên CRLF 4095–4097, đều đạt. Không dùng dữ liệu truyện thật làm fixture.
- Build/typecheck đạt, `.dsh-tmp/import-ads-build.log`, asset `index-DDnpEvYY.js`.
- Kiểm tra browser cuối 8/8 đạt (TXT preview/worker/source SHA; EPUB leaf/inline/ảnh/default sanitizer; PDF/DOCX preview/ảnh/original SHA/reload), desktop và Android mô phỏng; `.dsh-tmp/import-ads-browser.log`. Dữ liệu tổng hợp, API bị chặn, không dữ liệu người dùng. Vite dev 5173 và cache riêng 4192 bị treo navigation; giữ log `.dsh-tmp/import-ads-e2e.log`, chuyển sang built-preview và bundle harness local cùng source, worker TXT lấy từ dist thật. Chưa xác minh Android thật/cloud thật.
- Full integration trước thay đổi AI sau đó: 2652 pass, 56 fail, 7 skipped/223 files; không khẳng định suite xanh. Có timeout/môi trường và assertion AI/TTS ngoài phạm vi; các file targeted nhập nêu trên không nằm trong danh sách FAIL. `.dsh-tmp/import-ads-integration.log`. Không mở sửa backlog.
- Build cuối gộp yêu cầu AI tiếp theo: index-COkJR2E3.js, `.dsh-tmp/import-ai-final-build.log`; phát hành ghi trong HANDOFF.

Đã deploy Pages8791b14f cùng bản AI; GET bundle index-COkJR2E3.js200 xác nhận có lọc quảng cáo. Áp dụng nhập mới.
