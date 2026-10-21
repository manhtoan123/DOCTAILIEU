# Giữ Convert và dịch sẵn chương sau — 14/10/2026

Người dùng xác nhận lựa chọn: “Giữ Convert hiện tại, dịch sẵn chương sau”. Bấm nút Dịch AI khi đang ở Convert giữ nguyên mode, nội dung, khung EPUB và vị trí cuộn; chỉ yêu cầu AI cho chương kế tiếp. Hành động chủ động này chạy dù tùy chọn tự tải trước đang tắt, nhưng không sửa tùy chọn đó.

Khi người dùng sang đúng chương đã chuẩn bị bằng nút/keyboard/mục lục, Reader chuyển sang AI và dùng cache hoặc yêu cầu đang chạy, không gửi lại. Chọn Convert/Raw hoặc Dừng dịch sẵn hủy việc chuẩn bị và bỏ chuyển AI tự động. Đổi Name/prompt/source hủy snapshot cũ. Không có chương sau thì thông báo và giữ Convert. Trạng thái chuẩn bị là của phiên Reader; reload không tự khôi phục việc chuyển mode, cache đã xác minh vẫn giữ theo chính sách cũ.

Nút Nghe vẫn dịch/nghe chương hiện tại như trước, không bị đổi thành thao tác dịch sẵn. Từ Raw, Dịch AI vẫn dịch chương hiện tại. AI foreground và prewarm thông thường giữ luồng cũ. Chỉ một chương sau được chuẩn bị; model/key/budget/cache/schema/atomicity/source guards không đổi. Không tự phát TTS khi sang chương thủ công.

Scope product: src/ui/Reader.tsx, không đổi DB/server/worker. Keydown lấy state chuẩn bị mới để tránh closure cũ. Các test/script Name ảnh và EPUB cần dịch foreground chủ động đi Raw→AI, phù hợp nghĩa nút mới.

Kiểm chứng: unit72 PASS, build PASS. E2E mới12 PASS TXT/EPUB/scroll/frame/next-only/promote/error/retry/cancel/Name; các race promote/cancel/Name lặp3 lần18 PASS. Regression94 ca:91 PASS/1 timeout trước khi mở Reader/2 skip tệp EPUB thật; mock API chung cho fixture truyện mẫu, rerun Reader10 PASS + sample/cancel lặp3:12 PASS. Hợp các ca unique:92 PASS/2 skip. Giữ log fail e2e-initial (keyboard closure, đã sửa) và e2e-regression (harness sample), không tăng timeout hoặc sửa product để né fixture.

Pages2cc02117/master index-BV_WFseS.js; Worker248a6474-6231-426c-8951-e5512544774f không đổi. Production fresh context, dữ liệu tổng hợp/UI import: text+scroll Convert giữ nguyên, chỉ1 request chương sau, sang AI không request trùng, RAW giữ nguyên. AI được mock để kiểm orchestration, không gọi provider thật; APIcloud/state bị chặn, không reload usertab. Logs/ảnh .dsh-tmp/convert-ai-next/; scripts/smoke-convert-ai-next-production.mjs. Androidlayout không thay Android thật.
