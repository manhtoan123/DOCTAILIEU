# Đánh giá và phương án hoàn thiện TTS — 13/10/2026

Đánh giá gốc bên dưới dựa trên TTS-CONTINUITY-1; các số đo cũ không phải kết quả của bản mới. Cập nhật 13/10: sửa Pause/Resume và dừng chờ AI; 65 unit, build, 22 E2E đạt. User bỏ kiểm30ph, thay bằng đoạn dài không dấu câu: đã đạt. Đã deploy Pages945cfd10 và smoke production hai layouts/hai giọng/reload-offset/auto-next/Stop đạt. TTS-ACCEPTANCE-2.md là kết quả hiện hành; các kiểm mở rộng bên dưới không được diễn giải là đã kiểm Android thật.

## Kết luận từ bằng chứng hiện có

Bản local đã chứng minh được phát MP3 thật, chuyển ba chương ngắn, dùng một audio element và giảm chờ gateway ở hai ranh giới có đoạn đầu tải trước. Chưa đủ để nghiệm thu nghe lâu hoặc Android chạy nền.

- JSON cuối có 12 `playing`/12 `ended`, tổng từ bắt đầu kiểm đến hết đoạn cuối khoảng **39,2 giây**. Ba chương là ba nhóm văn bản tổng hợp ngắn; không tương đương ba chương truyện thông thường.
- Chuyển chương 130/118 ms là kết quả thật của lượt đo. Baseline 3.055/2.631 ms dùng player cũ tự nối chương; bản mới dùng Reader đầy đủ và AI giả lập. Chưa có so sánh cùng harness/lặp xen kẽ đủ mẫu để định lượng mức cải thiện chung.
- Bắt đầu phát 3.992 → 4.241 ms; ngắt trong chương 18–45 → 37–214 ms. Không thể kết luận nhanh hơn ở hai mục này; cũng chưa đủ mẫu để quy toàn bộ chênh lệch cho mã mới.
- `ended → playing` đo thời gian chuyển phát do trình duyệt báo, không bao gồm khoảng lặng nằm bên trong MP3 và không thay thế nghe bằng tai.
- 63 unit PASS kiểm logic với mock. 12 E2E PASS là hai ca × hai cấu hình trình duyệt × ba lần lặp; android-layout không phải Android thật. Lượt toàn spec có hai timeout đầu; diễn giải máy chủ lạnh cần bằng chứng rõ hơn, chưa có một lượt toàn spec cuối cùng sạch trên cùng bản ứng viên.
- Giọng nữ có chuỗi 12 đoạn; giọng nam mới kiểm phát/Pause/Resume/Stop ngắn. Chưa kiểm lâu cả hai giọng, tốc độ cao, mất mạng, AI chương sau chưa sẵn sàng và điều khiển native trên màn hình khóa.

## Thứ tự thực hiện

### P0 — Hoàn thiện phép đo trước khi tối ưu tiếp

1. Dùng cùng harness, cùng văn bản, giọng, tốc độ, thiết bị và đường dẫn UI cho hai phương án cần so sánh. Chạy xen kẽ để giảm lệch do thời điểm gateway; ghi median/P95/max và số mẫu. Chỉ đưa ra kết luận P95 khi đủ lượt chuyển; không suy từ hai ranh giới chương.
2. Ghi mã bản build/source hash, phiên bản trình duyệt, thời lượng chạy, số đoạn/chương, tốc độ, voice ID, số request, lỗi/retry/cancel và tình trạng audio đã tải trước. Log chỉ metadata/timing; không lưu nội dung truyện hoặc secret.
3. Tách giai đoạn startup, chuyển đoạn, chuyển chương, đổi giọng, Pause/Resume; bỏ cách cắt cứng `events.slice(0,25)`. Lưu dấu vết đủ để đối chiếu thứ tự đoạn, không chỉ tổng số event. Lưu bằng chứng có tên run riêng để chạy lại không ghi đè.
4. Ghi rõ hai đại lượng: khoảng chuyển media theo event và khoảng ngắt người nghe cảm nhận. Nghe mẫu câu ngắn/dài, dấu câu, hội thoại để phát hiện mất đuôi, lặp hoặc tiếng bị cắt. Chưa tự cắt khoảng lặng MP3.
5. Chạy một lượt sạch toàn spec TTS trên server sẵn sàng, build ứng viên xác định. Chỉ lặp ba lần các ca race/cancellation hoặc đã flaky. Nếu còn timeout, ghi nguyên nhân và bằng chứng, không mặc định quy cho môi trường.

### P1 — Kiểm độ bền và sửa lỗi có tái hiện

- Theo chỉ đạo người dùng 13/10, kiểm một đoạn văn dài không dấu câu, tốc độ 1×: tải âm thanh thật, phát hết, đối chiếu từng phần với văn bản gốc để phát hiện bỏ/lặp đoạn; kiểm giới hạn request, audio và giải phóng tài nguyên. Không yêu cầu kiểm nghe 30 phút. Giọng còn lại/tốc độ khác là kiểm mở rộng, chưa dùng để tuyên bố đã đạt.
- Thử mạng bình thường, chậm/dao động và mất mạng rồi có lại. Mất mạng có thể làm cạn bộ đệm; nghiệm thu yêu cầu báo đúng trạng thái, giữ vị trí và phục hồi bằng thao tác nghe, không tự phát sau Stop.
- Kiểm AI chương sau sẵn/chưa sẵn/lỗi và tắt tải trước AI; dừng hoặc chuyển thủ công trong lúc chờ. Tách thời gian chờ AI khỏi thời gian chờ TTS. Dùng mock điều khiển được các tình huống trước; một luồng AI thật có giới hạn là bước tích hợp riêng.
- Kiểm Pause/Stop đúng lúc hết đoạn, đổi giọng/source/prompt, fallback5xx rồi reload ở đầu/giữa/cuối đoạn nhỏ. Chỉ bổ sung test cho lỗ hổng chưa được các test hiện có bao phủ.
- Theo dõi request/cache/Blob URL và bộ nhớ qua nhiều chương: không tăng tích lũy, tối đa ba request entries theo thiết kế, một audio element, không phát sai thứ tự hoặc bỏ đoạn. Cache count riêng không đủ chứng minh không rò bộ nhớ.
- Chỉ tối ưu lịch prefetch/khởi động hoặc chuẩn bị giải mã tiếp nếu số đo xác định đó là nguyên nhân. Giữ ưu tiên âm thanh hiện tại, giới hạn tài nguyên và gateway hiện có. Không tăng cache vô hạn, đổi provider hoặc thêm kiến trúc phát mới khi chưa có bằng chứng cần thiết.

### P2 — Android thật và nghiệm thu bản triển khai

1. Dùng đúng điện thoại người dùng với Chrome; ghi model máy, Android/Chrome và Wi‑Fi/4G. Có thể kiểm thủ công; adb không phải điều kiện bắt buộc.
2. Nghe màn hình sáng rồi khóa ít nhất 15 phút, đi qua nhiều lần đổi đoạn và ít nhất hai ranh giới chương; chuyển ứng dụng và kiểm riêng chế độ tiết kiệm pin. Thử Play/Pause từ màn hình khóa, tai nghe nếu có, gián đoạn âm thanh từ ứng dụng khác và phục hồi vị trí.
3. Media Session chỉ cung cấp metadata/điều khiển; nếu phát nền bị ngắt, phân biệt mạng, audio event, page lifecycle và chính sách thiết bị trước khi sửa. Không tự gắn PWA/service worker với lời hứa giữ nền. Nếu nền không đạt, ghi giới hạn thiết bị rõ ràng và chỉ nghiệm thu phần màn hình sáng.
4. Sau kiểm local, chuẩn bị bản preview có dữ liệu tổng hợp cô lập để kiểm trên điện thoại. Deploy khi được yêu cầu/cho phép theo AGENTS; giữ nhận diện bản production trước để có đường quay lại. Smoke bản đã deploy với CSP/origin thật, hai giọng, auto-next, Pause/Resume/Stop và cursor. Không đánh dấu production hoàn tất chỉ từ build local.

## Tiêu chí nghiệm thu đề xuất

Các ngưỡng dưới đây là mục tiêu cần kiểm chứng, không phải kết quả đã đạt:

- Không bỏ/lặp đoạn do ứng dụng; Stop không bị callback muộn làm phát lại; reload không autoplay và tiếp tục đúng đoạn.
- Trên điều kiện mạng chuẩn, khi audio kế tiếp đã sẵn sàng: P95 khoảng chuyển media ≤250 ms, mỗi lần vượt 500 ms phải được giải thích. Tách đoạn có buffer thiếu hoặc AI chưa xong thành nhóm riêng.
- Startup báo median/P95 và phần do gateway; không cam kết dưới một ngưỡng cố định trước khi đủ mẫu. Chỉ giữ thay đổi tối ưu startup nếu cải thiện tổng trải nghiệm mà không làm đoạn tiếp theo chờ lâu hơn đáng kể.
- Đoạn dài không dấu câu phát hết đúng thứ tự, tải từng phần có giới hạn và giải phóng tài nguyên khi dừng. Các tình huống mạng lỗi/cancel giữ đúng nội dung và vị trí. Phép thử này không chứng minh độ bền qua nhiều giờ.
- Android background chỉ được đánh dấu đạt trên thiết bị/cấu hình đã kiểm thật; có người nghe mẫu đánh giá không mất chữ/đuôi hoặc phát sai thứ tự.
- Bản production đúng build ứng viên và smoke đạt; báo cáo cuối tách rõ local, preview, production, Android thật và các giới hạn còn lại.

Nguồn đối chiếu: [báo cáo gốc](TTS-CONTINUITY-1.md), `.dsh-tmp/tts-complete/real-audio-final.json`, unit/E2E logs cùng thư mục; [Media Session](https://web.dev/articles/media-session), [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).
