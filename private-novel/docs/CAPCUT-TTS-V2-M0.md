# CapCut v2 — gateway dùng phiên đăng nhập

25/10/2026. Người dùng chọn v2, chốt giọng `BV074_streaming`.

## Phạm vi và điều kiện bật

- Adapter cùng origin `/api/tts`, dùng phiên CapCut do người dùng cung cấp qua secret server `CAPCUT_SESSION_JSON`. Không thu mật khẩu/cookie trong UI, không VITE secret, không ghi log nguyên request/response.
- Giữ ID giọng, player MP3, tải trước hai đoạn, cursor và dữ liệu truyện. Giọng nữ `BV074_streaming` / resource `7102355709945188865`; giọng nam `BV075_streaming` / resource `7102355803792740865`. Đây là mapping tham khảo, chưa là bằng chứng giọng được tài khoản cấp quyền.
- Chỉ nhận JSON POST cùng origin, tối đa 200 Unicode code points; giới hạn byte/deadline; hủy khi Stop. Admission bằng bảng `login_limits` hiện có (namespace riêng), không migration. Chỉ gọi upstream cố định; audio CDN HTTPS cho phép rõ ràng, không chuyển tiếp cookie sang CDN/redirect.
- Chỉ bật client bằng cờ build không chứa secret `VITE_TTS_GATEWAY=capcut-v2` sau khi cấu hình phiên và kiểm MP3 thật. Bản build mặc định giữ gateway cũ tới khi nghiệm thu. Không thêm provider trả phí hoặc thay đổi tier/dependencies/compat.
- Phiên hết hạn báo cần kết nối lại, không tự lấy phiên/tài khoản khác; không tự đổi sang giọng khác. Dữ liệu phiên chỉ giữ trong secret và bộ nhớ xử lý request, không vào DB/backups/shared state.

## Hợp đồng phiên

Secret là JSON `{cookie, deviceId, tdid?, region?, appVersion?}`. Cookie/device/tdid phải từ phiên người dùng có quyền sử dụng; không dùng profile hay credential mẫu từ repo. Region mặc định VN, appVersion mặc định 5.8.0 theo reference; cấu hình này cần kiểm runtime thật.

Luồng v2 đầu tiên: `POST https://edit-api-sg.capcut.com/storyboard/v1/tts/multi_platform` → URL MP3 → server kiểm host/type/header/size và trả JSON base64 hợp đồng hiện có. Không tự tạo thêm task khác khi kết quả chưa rõ (tránh gửi trùng).

## Nghiệm thu

1. Targeted request/response/auth/SSRF/size/abort/quotas + regression player/cursor; build; review độc lập auth/secret.
2. Full unit sau khi gom review; E2E đúng luồng và runtime workerd cô lập, upstream tổng hợp, không cloud write thật.
3. Bước cuối: phiên thật do người dùng nhập an toàn ngoài chat → probe câu tổng hợp → giải mã/phát MP3, nhiều đoạn/Stop/resume. Chưa có phiên thì không ghi hoàn tất hoặc kích hoạt production.

## Nguồn tham khảo

- [kuwacom/CapCut-TTS](https://github.com/kuwacom/CapCut-TTS), MIT, commit `03cb757b43373a56cec5486fc126551d33c7428a`: v2 web session, multi_platform body/signature. Không chạy mã reference.
- [jutlyne/capcut-tts](https://github.com/jutlyne/capcut-tts), MIT, commit `150e49bee79462f83f527498535cd39ad5c74dcb`: mapping giọng/resource Việt. Luồng `common_task` của repo này khác v2 web; không coi hai luồng tương đương.

## Kiểm chứng 25/10/2026 — đã kích hoạt

- Người dùng đăng nhập CapCut Web và cho phép cấu hình. Chỉ trích cookie/did/tdid/region/appvr của request CapCut vào file tạm bị Git bỏ qua, nạp CAPCUT_SESSION_JSON qua stdin của helper; không vào chat/bundle/Git/log. File phiên tạm được xóa sau nghiệm thu.
- Phiên Web hiện dùng appvr15.4.0 và tdid=web. Hai validator thêm đúng literal web, giữ miền chữ số/chuỗi rỗng cũ; không nhận token tùy ý. Reviewer độc lập GPT-6.1 Sol/high: không finding; kiểm code/regex, không đọc phiên thật.
- Targeted:42/42; full:181files/2237tests PASS (.dsh-tmp/capcut-web-{targeted,full}.log). Build bật CapCut PASS, index-DtwwqSRQ.js (.dsh-tmp/capcut-web-build.log).
- Runtime workerd + D1 cô lập với tdid=web PASS; HTTP405/403/200/401/502 và quota đồng thời [200,429], upstream tổng hợp (.dsh-tmp/capcut-web-runtime.log).
- E2E:6/6 cùng lượt desktop/Pixel7 layout PASS, upstream mock, native MP3 fixture; Stop/cancel/expired/resume (.dsh-tmp/capcut-web-e2e.log).
- Real CapCut BV074_streaming: upstream200/ret0 khoảng4,7s; CDN audio/mpeg51360bytes, native Edge giải mã/phát2,568s. Qua production /api/tts:3câu tổng hợp khác nhau đều200, khoảng7,654/6,893/6,661s, audio52320/108480/142080bytes (.dsh-tmp/capcut-live-production-report.json).
- Production Reader ở trình duyệt sạch với truyện tổng hợp, AI mock, chỉ /api/tts gọi thật: PASS; firstPlay7,563s, maxConcurrent2, pause/resume cùng Blob, Stop và reload không autoplay;12request cloud khác bị chặn (.dsh-tmp/capcut-live-ui-report.json). Lượt đầu smoke chặn luôn AI nên Reader chờ AI; sửa fixture, không sửa production. Android thật/nền chưa xác minh; mẫu ngắn không chứng minh độ ổn định dài hạn.
- Backend hỗ trợ tdid=web: Pages9c939891. Client CapCut bật: Pages17014110, index-DtwwqSRQ.js. Rollback client về9c939891. AI/Convert Worker/schema/dependencies/compat/tier giữ nguyên. Các log lỗi kiểm thử ban đầu vẫn được giữ; kết quả hiện hành ở nhóm capcut-web-*.

## Mở rộng giọng Việt — 25/10/2026

- Probe24 mã qua production bằng câu tổng hợp:9 MP3 thành công, Nhỏ Ngọt Ngào lần đầu502 rồi retry200;14mã còn lại thiếu URL hoặc timeout. Uranus direct ret0 nhưng URLtrống; chưa xác định quyền tài khoản. Catalog cuối10 ở src/shared/constants/capcut-voices.ts cùng source commit đã pin; native Edge phát được cả10MP3. Chưa đánh giá phát âm bằng người nghe/Android nền.
- Catalog chung client/server/local cursor/shared reader+cursor; giữ2IDcũ/default/schema version. ID mới capcut-<serverId>; không migration/đổi transport/host/secret/quota. UI chỉ dropdown/count; legacy gateway vẫn2giọng.
- Review GPT-6.1 Sol/high không finding,9regression độc lập. Targeted72/full182files-2256tests/build/workerd-D1 PASS; logs .dsh-tmp/capcut-voices-{targeted,full,build,runtime}.log. E2E8distinct=6cũ+2mới sau sửa fixture chờ AI hoàn tất; giữ logfail capcut-voices-e2e{,-new2,-new3}.log. Không sửa production để chiều fixture.
- Stage backend24mã1c2a54bf/UIvẫn2→releasea7cbfe29/index-C7oezrrK/10giọng; rollback17014110. Production smoke chọn Mai qua UI, real/api/tts, fresh browser/truyện tổng hợp/AI mock/cloud khác bị chặn:PASS7,528s, maxConcurrent2, pause/resume cùngBlob/Stop/no autoplay; .dsh-tmp/capcut-voices-production-ui-report.json. Tham chiếu live-report.json/retest.json/decode-report.json cùng prefix. Phiên tạm xóa; không đổi secret/Worker/schema/deps/tier/Git.
