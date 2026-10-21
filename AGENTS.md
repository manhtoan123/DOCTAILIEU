# Private Novel Reader — quy tắc hiện hành

## Khởi động nhẹ (quyết định người dùng 11/10/2026)
- Đọc `HANDOFF.md` nếu chưa có trong ngữ cảnh; sau đó chỉ đọc file/đoạn liên quan yêu cầu. Không đọc lại tài liệu đã đọc trong cùng phiên nếu không đổi.
- Không bắt buộc đọc toàn bộ kế hoạch, DECISIONS hoặc HANDOFF-LOG. Dùng `rg -n` tìm chủ đề rồi đọc đoạn cần; kế hoạch hiện hành là chỉ mục, lịch sử ở docs/archive/.
- Sửa nhỏ: đi thẳng tới code, diff và kiểm tra phạm vi. Không tự mở audit toàn sản phẩm, đóng M0, lập kế hoạch dài, refactor ngoài yêu cầu hoặc giải quyết backlog. M0 chỉ cần khi thêm khả năng dung lượng/bulk/kiến trúc mới.
- Mặc định một agent; không spawn cho CSS/copy/UI đơn giản. Review độc lập chỉ khi có rủi ro dữ liệu/bảo mật thực sự; giao rõ file/invariant/test, không fork toàn lịch sử. Giữ medium; không tự nâng effort/đổi model, không giả báo id model.
- Reviewer độc lập mặc định GPT-6.1 Sol / high (`gpt-6.1-sol`, reasoning `high`), theo quyết định người dùng 12/10/2026. Đây là ngoại lệ mức medium chỉ cho reviewer; agent chính giữ cấu hình hiện hành. Không tự chuyển sang Astra hoặc nâng effort thêm. Giữ nguyên phạm vi/invariant/regression và nghiệm thu review.
- Output ngắn: tìm bằng rg, đọc theo đoạn, redirect log dài vào file rồi lấy summary/exit; khi fail chỉ lấy lỗi liên quan. Không in toàn dirtytree/diff/log hay polling không đổi. Không đọc thư mục archive trừ khi cần tra lịch sử.

## Phạm vi và bảo toàn
- App `private-novel/`; Chrome/Edge Windows + Chrome Android; local-first, chỉ nhập truyện được chọn.
- Phân cấp bắt buộc: tác giả (Album) → series (Album con) → truyện → chương. Folder con nằm trong Album cha, không làm phẳng đường dẫn thành các Album ngang hàng; không gộp truyện/chương hay sửa dữ liệu cũ chỉ để đổi cách hiển thị.
- D: chỉ đọc; không sửa/xóa/rename/chạy script/copy/upload/Git. Tham khảo `D:\linh tinh\tm` khi cần, ghi nguồn, không chép nguyên mã/dữ liệu vào app.
- Giữ bytes/SHA/validation/atomicity/cancellation và cloud-delete trước local-delete. Không tự sửa/tái nhập truyện cũ.
- Không PIN/login/AIcode/confirm phụ. AI public dùng secret server; không key trong VITE/bundle/file/Git/log/URL. Chỉ key người dùng cấp; theo chỉ đạo 20/10/2026, dịch chia phần cùng model được dùng tối đa 2 key đồng thời cho các phần khác nhau trong một chương, qua lease/cooldown hiện có. Không tăng fan-out ngoài mức này, không thêm billing/provider.
- TikTok TTS chỉ gateway đã được chấp nhận, không Web Speech fallback/userscript/private proxy. Không tự thêm provider/cloud feature ngoài yêu cầu.
- Dirtytree có nhiều thay đổi cũ: không reset/clean/commit/push tự động; diff đúng phạm vi. Không upgrade deps/Wrangler/compat/paid tier để né lỗi.

## Kiểm thử theo rủi ro (thay quy tắc full suite mỗi sửa trước đây)
- Chỉ tài liệu: kiểm diff, links, nội dung; không npm test/build/E2E/deploy.
- CSS/copy/UI trình bày không đổi logic dữ liệu: build một lần; E2E/smoke đúng luồng nếu cần kiểm bố cục. Không tạo test chỉ lặp implementation, không full suite/reviewer mặc định.
- Logic nhỏ: targeted unit + build; UI/import/worker chạy E2E đúng spec liên quan. `--repeat-each=3` chỉ ca đã flaky hoặc race/cancellation, không toàn nhóm vô điều kiện.
- Database/import integrity/splitter/backup/restore/auth/secret/cloud-delete/migration: review độc lập đọc diff + chạy regression; root full `npm.cmd test` + build + E2E liên quan. Review không đủ bằng chứng ghi chưa xác minh.
- Chạy các kiểm tra nặng tuần tự. Test pass chỉ chạy lại khi đổi code ảnh hưởng hoặc có nghi vấn chưa giải quyết; root không lặp toàn bộ targeted của reviewer nếu full integration đã bao phủ.
- Từ private-novel: `npm.cmd test -- tests/<file>.test.ts`; `npm.cmd run build`; `npm.cmd run test:e2e -- e2e/<spec>.spec.ts --workers=4 --reporter=line`.
- TEMP/TMP dùng thư mục riêng `.dsh-tmp/chapter-runtime` trong private-novel nếu Windows AccessDenied; tạo bằng New-Item rồi Resolve-Path. Không sửa deps để giấu lỗi runtime.
- Giữ log fail; known bugs dùng it.fails với invariant đúng, unexpected pass cần review trước bỏ fails. Phân biệt automated/layout với Android thật; build không phải deploy. Deploy khi được yêu cầu/đã được phép, smoke bằng dữ liệu tổng hợp cô lập cloud.

## Bàn giao
- HANDOFF chỉ trạng thái hiện hành, tối đa khoảng 3.500 ký tự; không nhét lịch sử test/triển khai lặp lại. Bỏ mục đã xong khỏi backlog.
- HANDOFF-LOG append-only: một entry ngắn giờ/AI hoặc model đã xác minh/phạm vi-file/lý do/invariant/lệnh-exit-summary/review/giới hạn/nextID; dẫn log thay vì chép output. Không chuỗi suy luận nội bộ.
- DECISIONS append khi đổi quyết định kỹ thuật/quy trình. Không đọc log cũ để chỉ append entry mới.
- Quy tắc nhẹ này supersede workflow nặng trước 11/10/2026, giữ nguyên ràng buộc dữ liệu/secrets và chỉ đạo trực tiếp người dùng.
