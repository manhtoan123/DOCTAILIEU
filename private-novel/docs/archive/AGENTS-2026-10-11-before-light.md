# Private Novel Reader — hướng dẫn tiếp tục

- Đọc `HANDOFF.md` trước khi làm việc, sau đó `WEB-READER-IMPLEMENTATION-PLAN.md`.
- Dự án ứng dụng: `private-novel/`. Nguồn tham khảo và kho truyện ở ổ D: chỉ đọc; không tự sửa, xóa, đổi tên, chạy script hoặc đưa chúng lên mạng/Git.
- Khi cần đối chiếu hành vi importer/splitter/reader/TTS hoặc từ điển, được tham khảo mã nguồn dưới `D:\linh tinh\tm` ở chế độ chỉ đọc; phải ghi nguồn tham khảo và không sao chép nguyên mã/dữ liệu vào MVP nếu chưa có quyết định phù hợp.
- Thiết bị đích: Chrome/Edge Windows và Chrome Android. Local-first; chỉ nhập truyện người dùng chọn.
- Không thêm Gemini hoặc đồng bộ nội dung cloud vào MVP nếu chưa hoàn thành các chức năng local. TikTok TTS chỉ được thêm theo yêu cầu đã xác nhận của người dùng, qua adapter/gateway được phép; không sao chép userscript hoặc gọi proxy nội bộ của bên khác như một API công khai. Không gắn secret vào VITE_* hay bundle.
- Khi kết thúc một đợt công việc, cập nhật HANDOFF.md: chức năng thật sự chạy, lệnh kiểm thử và kết quả, hạn chế, việc tiếp theo. Ghi quyết định đáng kể vào private-novel/docs/DECISIONS.md.
- Không đánh dấu hoàn thành chức năng chưa kiểm thử; phân biệt rõ test tự động và kiểm thử thiết bị thật. Không tuyên bố đã deploy khi chỉ build local.
- Mỗi lần sửa phải ghi nhật ký chi tiết để AI khác tiếp tục được: danh tính người/AI thực hiện, ngày giờ, phạm vi phiên, từng file và khu vực đã sửa, lý do/quyết định, lệnh kiểm thử và kết quả, giới hạn còn lại, cùng bước tiếp theo cụ thể. Không chỉ ghi “đã sửa”.
- Cuối mỗi phiên cập nhật HANDOFF.md ngắn gọn (khoảng 100 dòng, chỉ trạng thái hiện hành); thêm nhật ký vào private-novel/docs/HANDOFF-LOG.md (append-only). Nếu đổi kỹ thuật hoặc phạm vi, thêm DECISIONS.md. Không ghi đè lịch sử trong log.
- Vì nhiều AI/model có năng lực khác nhau, không giao phạm vi mơ hồ và không để AI sau mặc định tin kết quả AI trước. Mỗi nhiệm vụ phải có phạm vi nhỏ, invariant/tiêu chí nghiệm thu, test bắt buộc và giới hạn quyền sửa.
- Không merge thay đổi chỉ dựa vào lời tự nhận của AI. Phải kiểm tra diff, chạy test/build liên quan và nếu thay đổi rủi ro cao (database, backup/restore, auth, dữ liệu người dùng) thì cần review độc lập trước khi chấp nhận.
- AI review phải kiểm tra riêng lỗi mất dữ liệu, race/cancellation, migration/backward compatibility, bảo mật, edge case và test còn thiếu. Nếu chưa đủ bằng chứng thì ghi `chưa xác minh`, không đánh dấu hoàn thành.

## Quy tắc thực thi từ 05/10/2026

- R0 đọc/Convert trước, chưa bắt buộc TTS theo quyết định người dùng. Không tự nối Web Speech fallback. TTS thật cần gateway được phép và nghiệm thu riêng.
- Sau thay đổi code, chạy từ private-novel/: `npm.cmd test` và `npm.cmd run build` (type-check app/server + build). UI/import/worker phải chạy E2E liên quan: `npm.cmd run test:e2e -- --reporter=line`.
- Reviewer độc lập thay đổi rủi ro cao phải chạy targeted regression của chính phạm vi review và kiểm tra diff. Chỉ đọc, lỗi khởi động lệnh, hoặc kiểm cú pháp không đủ nghiệm thu; ghi lệnh chưa chạy/lý do. Root vẫn chạy lại kiểm tra tích hợp.
- Ca E2E từng chập chờn: chạy ca liên quan với `--repeat-each=3`, giữ cả kết quả fail. Không nhận một lần xanh làm bằng chứng đã tìm đúng nguyên nhân.
- Audit dùng invariant đúng; lỗi biết trước dùng `it.fails`. Khi lỗi đã sửa mà test trở thành unexpected pass, bỏ fails sau review. CI xanh không có nghĩa không còn lỗi expected-failure.
- Độ suy nghĩ và cấu hình model: Cố định mức suy nghĩ trung bình (medium reasoning effort) cho toàn bộ phiên và subagent mới (GPT-6-astra/medium). Không tự ý nâng lên high hoặc đòi hỏi "model mạnh nhất" để tránh cạn kiệt token/quota; giữ suy luận súc tích, đi thẳng vào invariant, diff và lệnh test, không suy nghĩ nội bộ lan man. Khi model chạm quota: ghi tên cấu hình và công việc dở, root tiếp quản; không giả vờ đổi model.
- Trước feature mới: hoàn tất hoặc quyết định lại spike M0 bằng số đo. Kế hoạch/schema dự kiến khác mã phải ghi bảng lệch, không tự migration chỉ để khớp tài liệu.
- Git baseline chỉ chứa code/config/fixtures tổng hợp/tài liệu; loại secrets, nội dung thật, build và dependencies. Commit baseline ghi rõ lỗi còn mở, không là nghiệm thu và không tự push.
- Nhật ký chỉ cần quyết định/lý do và ràng buộc ngắn; không yêu cầu chuỗi suy luận nội bộ. Mẫu log gồm giờ, model, phạm vi/file, invariant, lệnh/exit/kết quả, review, giới hạn, ID việc tiếp theo.

## Quyết định người dùng 08/10/2026 — thao tác trực tiếp
- Bỏ PIN/login/mã kết nối AI và xác nhận phụ; không tự đưa trở lại khi chưa có yêu cầu mới.
- AI endpoint công khai dùng secret chủ; supersede capability/same-origin AI trước đây. Không VITE/bundle/Git/log key.
- Nhập TXT/batch/folder chọn rồi Nhập một lần; xóa/gỡ trực tiếp. Giữ checksum/validation/atomicity/cancellation/cloud-delete trước local-delete.