# Handoff: sửa nút xóa sách Kho chung trả 400

## Trạng thái hiện tại (13/11/2026)

Người dùng không xóa được một số sách thử trong **Kho chung**. Đã xác nhận xóa đúng thẻ `user uploaded rock` có phụ đề `黑月何时嚎叫？ · 3 chương` (ID `0b7fc9e1-7aac-4e19-8f8a-927ff61b0ee9`) khỏi cloud và thiết bị này. Không đụng các thẻ trùng tên hoặc bài test khác.

Production CDP xác nhận menu phát `DELETE /api/cloud/books/<id>` không headers/body. Runtime Worker đưa stream rỗng vào `Request.body`, khiến nhánh `if(request.body)` parse JSON rỗng và trả 400 `invalid_delete_precondition`. Đã đổi Worker phân biệt byte thật với stream rỗng; Content-Type/Content-Length có khai báo vẫn ép validate precondition. Local chỉ xóa sau ACK cloud như trước. Ca regression bổ sung cho stream rỗng và JSON khai báo nhưng rỗng.

Kiểm tra: build TypeScript/Vite pass với TEMP/TMP cô lập. `tests/library-management-native.test.ts` chưa chạy được: Miniflare báo `internal error` lúc tạo D1 trong `beforeAll`, cả 6 test bị skip. Chưa có reviewer độc lập Astra High khả dụng trong runtime phiên này. Cloudflare Request docs tham khảo: https://developers.cloudflare.com/workers/runtime-apis/request/ (Request body là stream; `clone()` dùng để đọc thêm lần nữa). Lần sửa ban đầu dò `Request.body` vẫn lỗi production; dùng `Content-Type` hoặc Content-Length dương/không hợp lệ để xác định body, bỏ qua `Content-Length: 0`.

Pages production đã deploy `e0c166f4` (trước đó `4c0c90a3`, `7dc4f5d6`). Production click menu `Xóa truyện` đúng mục trả HTTP 200; UI hiện `Đã xóa truyện khỏi kho chung và thiết bị này.` và catalog không còn UUID `0b7fc9e1-7aac-4e19-8f8a-927ff61b0ee9`. Thẻ `user uploaded rock` khác vẫn còn. Mọi local deletion chỉ chạy sau cloud ACK. Deploy dùng working tree dirty, do đó gồm thay đổi ngoài cloud-delete.

## Trạng thái trước bản vá

- Pages hiện tại: `4dccdc08`, canonical `https://thu-phong-private.pages.dev/`; triển khai ngay trước handoff này theo chỉ đạo `deploy trước`.
- Deploy là artifact `dist` từ working tree dirty, có thay đổi ngoài EPUB. Không xem deployment là chỉ chứa EPUB hoặc là bằng chứng đã kiểm các tính năng ngoài phạm vi.
- Bản EPUB auto-split và bỏ qua manifest asset phụ bị thiếu đã deploy; smoke EPUB tổng hợp trên production pass. Chi tiết ở `docs/EPUB-HTML-REPAIR.md` và `docs/HANDOFF-LOG.md`.
- Lỗi production tái diễn sau hai lần deploy: `Request.body` và `Content-Length: 0` của Pages bị coi là có precondition nên parse JSON rỗng, status 400. Bản thứ ba sửa dựa trên Content-Type/độ dài dương.

## Bằng chứng từ code hiện có

- `src/App.tsx`, hàm `removeShelf`: nếu sách thuộc cloud thì `await deleteCloudBook(book.id)`, sau đó mới gọi `removeBookWithLocalData(book.id)`. Cloud lỗi thì nhảy vào `catch`, vì vậy bản local còn lại là chủ ý để không mất dữ liệu khi chưa có ACK cloud.
- `src/features/sync-cloud/services/cloud-client.ts`, `deleteCloudBook`: kiểm tra ID theo UUID trước request; thẻ sách gửi `DELETE /api/cloud/books/<id>` không body. Client biến mọi lỗi 400 thành cùng thông báo chung, không đọc mã lỗi JSON từ response.
- `functions/api/cloud/[[path]].ts` chuyển request sang `server/cloud-library.ts`.
- `server/cloud-library.ts`: 400 có thể là `invalid_book_id` nếu path ID không hợp lệ, hoặc `invalid_delete_precondition` nếu DELETE có body điều kiện không hợp lệ. DELETE không body đi theo nhánh legacy và theo source hiện tại phải ghi tombstone/ACK. So sánh precondition không khớp trả 409 `delete_selection_changed`, không phải 400.
- Do client từ chối ID sai trước khi gửi và nút thẻ dùng DELETE bodyless, các nhánh 400 trong source hiện tại **không giải thích được triệu chứng ở nút này**. Chưa biết response thật có đến từ Pages function, routing/deployment lệch phiên bản, hay lớp khác. Không kết luận `invalid_delete_precondition` khi chưa thu response body.

## Việc đã hoàn tất

Đã deploy Pages gồm Worker function `/api/cloud/books/:id`, xác nhận production DELETE HTTP 200 và UI/catalog bỏ đúng mục đã duyệt. Ca regression Miniflare còn cần chạy lại khi lỗi khởi tạo D1 được khắc phục. Reviewer độc lập Astra High cũng chưa thực hiện được trong runtime hiện tại.

## Giới hạn và cách làm việc

- Không suy đoán ID từ title vì có hai mục trùng tên. Tên/ảnh trang là bằng chứng UI, không thay thế UUID.
- Không xóa bản local trước cloud ACK; không force-delete hoặc bỏ qua lỗi 400 để làm nút trông như thành công.
- Không dùng tệp trên `D:` làm fixture hoặc ghi/sửa/xóa ở đó. Không commit/push/reset/clean; working tree có nhiều thay đổi cũ.
- Lượt full suite trước deploy: 2.666 pass, 104 skipped, 85 fail trên 49 file; một số lỗi là timeout/internal error ngoài luồng delete. E2E EPUB desktop timeout ở `page.goto('/')`; Android layout pass ca chia chương. Các kết quả này không phải bằng chứng cloud-delete đã chạy.
- Trạng thái deploy, test và nội dung EPUB đã tổng kết ở `HANDOFF.md`; log chi tiết append-only ở `docs/HANDOFF-LOG.md`.
