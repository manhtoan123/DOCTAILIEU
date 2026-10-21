# Kiểm tra gateway TTS và đối chiếu STV — 12/10/2026

Nguồn tham khảo chỉ đọc: `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\stv.tts.v2.min.js`. Không chạy/chỉnh sửa/sao chép mã STV vào app. Code app: src/tts.ts; endpoint https://ottsy.weilbyte.dev/api/generation. Browser Edge trên máy hiện tại, origin production; văn bản tổng hợp, không nội dung truyện/key. Đây là phép đo đường mạng đến gateway, không tách được thời gian TikTok và gateway nội bộ.

## Kết quả đo
- 5 POST tuần tự: tất cả HTTP200/success, giải mã audio được. Nữ40 ký tự:3.477s và2.915s; nữ100:3.932s; nữ200:5.385s; nam100:3.565s. Header về sau2.505–4.567s; tải body thêm0.410–0.818s. Audio40/100/200 dài khoảng2.52/5.40/10.54s. Payload JSON67,239–280,999byte.
- 3 POST100ký tự đồng thời (mô phỏng cửa sổ current+next2): tất cả HTTP200/success, tổng6.022/6.502/7.530s. Đây là mẫu nhỏ trong hai thời điểm; có dấu hiệu đường request chậm hơn khi đồng thời, chưa đủ kết luận nguyên nhân hoặc hiệu năng lâu dài.
- Không gặp500/timeout trong8request. Không kiểm thử Android/4G hay phát liên tục qua nhiều chương.

## Đối chiếu code
| Nội dung | App | File STV được cung cấp |
|---|---|---|
| Gateway | Weilbyte cross-origin POST{text,voice} | Same-origin POST /io/s1213/tiktoktts?text=,body{text} |
| Audio trả về | JSON base64→MP3 | response.blob() trực tiếp |
| Tải trước | Next2, bắt đầu cùng request hiện tại | setMaxPreload(2), preloadAhead sau thiết lập audio |
| Câu dài | Giới hạn200 codepoints; sau HTTP500/502/503/504 lặp lỗi chia≤100 | Tokenize theo dấu câu/dấu ngoặc kép; TikTok adapter không thấy cap/chia nhỏ |
| Retry | Thử lại1 lần, chờ600ms, deadline chung30s | FaultyAction tối đa3 lượt, chờ500ms; fetch timeout10s, không thấy AbortSignal |
| Cache | Current+next2, hủy/giải phóng khi ra khỏi cửa sổ | Map cache+pendingAudio, clear khi đổi provider; không thấy rolling eviction |
| Cuối câu | Chờ audio.onended | Có getCutTime nhưng TikTok supportEarlyEnding=false nên không cắt sớm |

JSON base64 tăng khoảng1/3 dung lượng so với bytes audio gốc; ví dụ200ký tự210,720audio bytes thành280,999JSON bytes. STV dùng blob nhưng chưa có phản hồi thật để xác định encoding/kích thước tương đương. Mã STV này có3giọng nhưng URL không chứa{voice} và body chỉtext, nên chưa xác minh việc chọn giọng được proxy nhận. Không giả định STV nhanh hơn từ source client; chưa đo proxy STV hoặc có code server của nó.

## Kết luận
Gateway hiện hoạt động, đường fetch có độ trễ vài giây; prefetch che được phần chờ sau khi bắt đầu nếu không cạn buffer. Chưa có bằng chứng500 do độ dài trong lượt đo. Tải trước2 không thiếu so với STV. Những điểm đáng thử riêng sau nếu user yêu cầu sửa: ưu tiên câu hiện tại trước khi tăng tải nền; chuẩn bị audio kế tiếp trước chuyển câu; đo gap khi nghe thực và tốc độ cao. Không tự đổi gateway/provider/proxy, chưa đổi production.

Evidence: test-results/tts-gateway-check.json, test-results/tts-gateway-window.json, tts-gateway-check.log, tts-gateway-window.log. Không chạy unit/build vì chỉ kiểm tra và ghi báo cáo.
