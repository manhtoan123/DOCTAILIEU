# Sử dụng Thư Phòng local alpha

Chạy trong thư mục `private-novel/`: `npm.cmd run dev`, mở `http://127.0.0.1:5173/`. Đây là development trên máy hiện tại; chưa phải web private đã triển khai.

## Nhật ký dịch AI

Vào **Cài đặt → Nhật ký** (`/settings/ai-log`). Số liệu dùng chung thư phòng trên điện thoại/PC, bắt đầu từ bản 28/10/2026; không hồi dựng lịch sử RAM cũ. Lọc 24 giờ/7 ngày/30 ngày và model để xem thành công, lỗi, cả hai tỉ lệ, nguyên nhân, giờ bắt đầu theo giờ Việt Nam và thời gian trung bình/median/P90. N luôn là số mẫu thực; cache và Dừng không làm giảm tỉ lệ model.

Bảng request đo qua kiểm tra tự động ở server, không chấm nghĩa/văn phong. Các lần đổi key lỗi rồi thành công vẫn hiện nguyên nhân upstream riêng. Hoàn thành chương là báo cáo từ app sau lắp ghép, tính thời gian thực từ lúc bắt đầu; không đoán model của chương khi chưa có thông tin chắc chắn. Bảng request gồm cả thử prompt; thử prompt không được đếm là chương đọc. Tối đa 5.000 sự kiện/30 ngày; dữ liệu có thể thiếu nếu đóng trang, lỗi mạng/lưu trữ hoặc hàng đợi 100 bản ghi bị đầy. Không lưu nguồn/bản dịch/prompt/Name/key. Chi tiết và kiểm chứng: [AI-LOG-M0.md](AI-LOG-M0.md).
## Thêm và đọc truyện

**Dịch AI không đếm ngược thử lại (28/10/2026):** trang đọc TXT/EPUB, dịch sẵn, thử prompt đơn và so sánh A/B dùng chính sách thử ngay. Bỏ backoff tự đặt 600 ms/2,5 giây, thời gian nghỉ model 15 giây, chờ chung vì quota, chờ giữa phần và lịch tự chạy lại sau 2–60 giây. Khi lỗi mạng/408/5xx hoặc quota, server thử key khả dụng khác theo thứ tự, mỗi key tối đa một lần trong một request; retry toàn chương mang số slot vừa dùng để ưu tiên key khác cả khi Worker đổi instance. Slot chỉ là số thứ tự, không chứa key. Giữ tối đa hai lượt dịch đồng thời, deadline HTTP, số lượt thử, pin model và các phần đã hoàn tất.

Nếu provider có `Retry-After` hợp lệ, key đó được loại khỏi lựa chọn cho tới khi khả dụng; tác vụ thử key/model khác ngay, không ngủ chờ key ấy. Không tự đặt cooldown 60 giây khi 429 thiếu chỉ dẫn. Nếu đã thử hết lựa chọn trong giới hạn, web giữ tiến độ và nút thử lại, không tự lên lịch hoặc lặp vô hạn. Thông báo hết lượt không hứa tự phục hồi. Tab cũ cần tải lại để dùng chính sách mới; giao thức cũ còn tương thích. Tham khảo ý tưởng thử peer còn lại, loại peer đã thử và giữ giới hạn lượt từ [LiteLLM Weighted Failover](https://github.com/BerriAI/litellm-docs/blob/main/docs/routing.md#weighted-failover); không cài thêm thư viện/provider.

Kiểm chứng bản 28/10: 199 file / 2.466 unit test đạt; build đạt; native Worker kiểm chuyển 503/Retry-After sang key khác và streaming bằng upstream giả lập. E2E đúng luồng đạt 26/26 ở preview và 26/26 trên web deploy (Edge desktop + Android mô phỏng, API/IDB tổng hợp cô lập cloud). Đồng hồ đứng yên vẫn thử ngay; tiến 15 phút sau khi hết lựa chọn không phát sinh request; Stop không gửi lượt tiếp. Astra High review độc lập diff cuối không còn finding. Deploy Pages `c42c1181` / JS `index-DsmG-1oB.js`, AI Worker `0a211620-270f-4baf-9501-50017dfba21c` 100%. Chưa đo tốc độ/quota của Google thật hoặc Android thật; chỉ loại thời gian chờ do app tự đặt, thời gian tạo nội dung và chờ request đang chạy vẫn có. Log chi tiết tại `.dsh-tmp/ai-foreground/immediate-*.log`.

**Ưu tiên model (28/10/2026):** “Chương này” dùng chuỗi Gemini 3.8 Flash → 3.7 Flash → 3.5 Flash → **2.5 Flash → 3.5 Flash-Lite** → Gemma 4 26B A4B → Gemini 3 Flash Preview. “Chương sau” khi còn dịch sẵn bỏ qua **3.5 Flash-Lite**. Menu model đặt Lite sau 2.5. Các lựa chọn model/prompt thủ công vẫn được giữ; thứ tự này theo yêu cầu người dùng, không phải kết luận so sánh chất lượng.

Nếu mở chương đang prewarm dở, web giữ nguyên request/tác vụ đang chạy. Request thành công được dùng luôn; chỉ sau khi thất bại mới chọn model tiếp theo theo chính sách “Chương này”, có Lite sau 2.5. Nếu prewarm đã bỏ qua Lite và đang chạy Gemma, web vẫn đợi Gemma; chỉ xét Lite khi Gemma thất bại. Không bỏ kết quả hoặc trộn model khi đã có phần hoàn tất được ghim. Mã `gemini-3.5-flash-lite` được gọi đúng endpoint Lite, không còn ánh xạ thành 3.5 Flash; mã cũ 3.6 vẫn có cơ chế tương thích. Nguồn ý tưởng về giữ cấu hình fallback qua các lượt thử: [LiteLLM fallback controls](https://github.com/BerriAI/litellm/blob/main/litellm/router_utils/fallback_event_handlers.py). Ở đây dùng vai trò runtime dùng chung, không đưa vai trò vào định danh cache và không cài thêm thư viện/hạ tầng.

**Dịch AI cho TXT:** chương có nội dung gốc dưới **3.000 ký tự** được dịch nguyên chương, kể cả khi bật chia phần song song. Khi model gặp timeout hoặc lỗi mạng tạm thời và còn model dự phòng, web chuyển sớm sang model tiếp theo; model cuối hoặc chỉ có một model vẫn được thử lại tối đa hai lần. Bản dịch bị cắt hoặc còn chữ nguồn được thử lại nguyên chương tối đa hai lần, trong giới hạn lượt/thời gian hiện có. Các lần thử diễn ra ngay, ưu tiên key khác còn khả dụng; giữ giới hạn lượt và thời gian thực hiện. Nút **Dừng** hủy lượt đang chạy và các lượt còn xếp hàng. Từ đúng 3.000 ký tự trở lên, cơ chế chia tiếp tục áp dụng theo lựa chọn và ngân sách đầu ra; khi chia hoặc phục hồi sau lỗi (bị cắt, timeout), hệ thống không giới hạn số lần chia chương cố định mà tiếp tục phân chia đệ quy đến khi hoàn thành hoặc đạt ngưỡng tối thiểu an toàn của đoạn văn. Cách đếm gồm khoảng trắng/xuống dòng, dùng UTF-16 như bộ đếm hiện có. Bản dịch hoàn chỉnh đã lưu được giữ; quy tắc áp dụng khi cần dịch mới. EPUB giữ luồng dịch theo cấu trúc riêng.

Khi mở chương đang được dịch sẵn, web dùng tiếp tác vụ đó và ưu tiên các yêu cầu đang chờ của chương vừa mở. Bảng **Chương này** cập nhật model đang chạy, kể cả khi chuyển model dự phòng; không cần dịch lại từ đầu. Request đang chạy được giữ; key đang bận hoặc bị giới hạn được bỏ qua khi chọn key tiếp theo.

**Đọc sớm khi đang dịch:** với TXT dưới 3.000 ký tự, các đoạn AI đã trả đủ xuống dòng có thể hiện trước với nhãn **Bản xem trước**. Vẫn chỉ gửi một request nguyên chương. Bản tạm chưa được lưu vào cache hoàn chỉnh hoặc dùng để nghe; nếu lượt dịch lỗi, đổi model, hết thời gian hay bị Dừng, bản tạm được xóa. Chỉ bản kết thúc hợp lệ mới được lưu và nghe. EPUB và chương dài tiếp tục dùng các phần hoàn tất như trước. Streaming giúp có nội dung để đọc sớm hơn; không đảm bảo tổng thời gian tạo bản dịch giảm.

**Nhập folder:** Thêm truyện TXT → Nhập folder: mỗi file một chương. Chọn folder, kiểm tra truyện/chương và danh sách file không phải TXT, bấm Chuẩn bị nhập folder rồi Xác nhận các folder vào thư viện. Mỗi folder có TXT trực tiếp là một truyện, folder con có TXT thành truyện riêng; 2.txt đứng trước10.txt. Không tách lại heading trong file. Hủy bản nhập xóa phần staging. Trần hiện tại2MiB/file,128.000 ký tự/chương,32MiB/folder; quá lớn/chương rỗng/encoding sai báo lỗi thay vì bỏ/chia. Trình chọn folder trên Android thật chưa xác minh; EPUB chưa hỗ trợ.

1. **Thêm truyện** → **Chọn file** để nhập TXT, EPUB, PDF hoặc DOCX. Có thể kéo thả, chọn nhiều file hoặc chọn **Nhập folder truyện**.
   Muốn dán văn bản, mở **Dán nội dung truyện**. Encoding, giới hạn chương và Regex nằm trong **Cách đọc TXT**. Bản đếm chương nằm ngoài phần thu gọn; thanh nhập/hủy vẫn thấy khi cuộn.
2. **Tách chương & xem trước**: kiểm tra các phần. Heading trong TXT tạo mục lục; nội dung chưa vào thư viện cho đến khi xác nhận.
3. **Xác nhận vào thư viện**: mở Reader. Mỗi file là một truyện; nguồn gốc ở ổ D: không bị chỉnh sửa.
4. **Chương trước / Mục lục / Chương sau**: ở hai đầu trang. Trong mục lục có ô tìm tên và phân trang.
5. **Công cụ**: Sửa chương, tách tại con trỏ, xuất chương TXT, hướng dẫn thao tác. Chưa có màn hình CRUD chương đầy đủ.

Trong Tủ sách, bấm **bìa hoặc tên truyện** để xem thông tin và danh sách chương.
Phân cấp: **Tác giả (Album) → Series (Album con) → Truyện → Chương**. Tủ sách chỉ hiện Album tầng ngoài; mở tác giả mới thấy Album con/Series. Đường dẫn folder cũ tự hiển thị theo cây, kể cả khi folder cha không có truyện trực tiếp; không cần nhập lại. Nút **← Album cha** và đường dẫn Album dùng để quay về tầng trước. Truyện nằm trực tiếp trong Album tác giả hiện ở nhóm **Truyện ngoài Series**. **Tạo Album con / Series** tạo nhánh trong Album đang mở; thêm truyện tại nhánh nào thì truyện vào đúng nhánh đó.
Tên Album và truyện ưu tiên tên Việt; tên Trung gốc nằm nhỏ, mờ bên dưới khi hai tên khác nhau. Album dùng bộ từ điển Convert đã lưu trên thiết bị.
Chọn **Lưới / Danh sách / Thu gọn** để đổi cách xem; lựa chọn được nhớ trên trình duyệt này. Lưới dùng thẻ bìa riêng, giữ tên dài đầy đủ và đặt nút mở/tùy chọn ở đáy thẻ. Danh sách dùng bìa nhỏ; Thu gọn chỉ hiện tên và số chương. Tìm kiếm và phạm vi Album giữ nguyên khi đổi chế độ.
Ô tìm kiếm nhận tên truyện, tác giả và tên chương Việt / Trung, có thể nhập tiếng Việt không dấu. Trong Album, kết quả thuộc Album đó và các Album con, không lẫn nhánh tác giả khác. Bấm **Chương: …** trong kết quả để mở thẳng chương khớp đầu tiên. Tên chương của truyện chỉ có trên kho chung tìm được sau khi mở truyện để tải mục lục về máy.
Album/Series, tên và bìa truyện, Mở sách, kết quả tìm chương, danh sách chương, mục lục và Chương trước/Chương sau dùng liên kết thật. Chuột phải chọn **Mở liên kết trong tab mới**, hoặc Ctrl+click/chuột giữa; điện thoại có thể nhấn giữ. Bấm trái vẫn chuyển trong ứng dụng. URL Album giữ cả nhánh con để mở tab mới, tải lại và quay lại đúng vị trí.

**Đọc tiếp** mở vị trí đã lưu; **Đọc từ đầu** hoặc bấm một chương mở từ đầu chương đó.
Reader **← Thông tin truyện** quay lại trang truyện; **← Tủ sách** giữ từ khóa tìm truyện trong phiên.
**Mở sách →** ở Tủ sách vẫn đọc tiếp trực tiếp. Trang truyện có tìm tên/số chương và 60 mục mỗi trang.
**Đến cuối** mở ngay trang cuối của danh sách chương đang xem, kể cả kết quả tìm kiếm; nút tự khóa khi đã ở trang cuối. Thao tác không đổi tiến độ đọc.
**Đến chương đang đọc** bỏ bộ lọc tìm chương, mở đúng trang và đưa tiêu điểm đến chương đã lưu, kể cả khi có chương bị ẩn. Nút chỉ định vị trong danh sách, không mở Reader hay đổi tiến độ. Trong chế độ quản lý, các chương đang chọn được giữ; nút tạm khóa ở mục Đã xóa hoặc khi đang sửa/xác nhận xóa.
Chương đang đọc được đánh dấu. Xem thông tin không thay đổi TXT hay tiến độ.

## Bật, ẩn và nhớ cài đặt

| Nút | Bật/mở | Ẩn/tắt | Ghi nhớ |
|---|---|---|---|
| ⚙ | Mở Cài đặt hiển thị | Bấm lại, Ẩn hoặc Esc | Màu/font/cỡ/giãn dòng/chiều rộng/căn chữ lưu trên thiết bị |
| Chỉ đọc | Ẩn header/thanh thao tác | ⚙ → Hiện thanh công cụ, hoặc Esc khi không có bảng khác | Chế độ theo phiên |
| Name | Mở bảng Name bên phải | Ẩn hoặc bấm Name lại | Bản nháp giữ khi ẩn trong cùng Reader; bấm Lưu mới lưu DB |
| Nghe sách | Mở bảng giọng/tốc độ/câu | Ẩn bảng; **âm thanh vẫn tiếp tục** | Nút ■ hoặc ■ nổi mới dừng |
| Chạm từ Convert | Luôn bật trong bản Convert mặc định | Chuyển sang **Xem bản gốc** trong Công cụ | Sửa tạm theo phiên; nút đĩa lưu cố định |

Trong **Cài đặt → Giao diện → Màu giao diện**, chọn **Trắng**, **Giấy** hoặc **Tối**. Màu áp dụng cho tủ sách, trang thông tin truyện, cài đặt, hộp thoại và trang đọc; tự lưu sau khi chọn và giữ khi tải lại. Trang đọc cũng có ba lựa chọn này trong mục **Nền**. Thiết bị chưa có lựa chọn dùng màu Giấy; lựa chọn đã lưu được giữ.

Bảng màu và color picker trong phần hiển thị nâng cao vẫn cho đổi nền/chữ riêng của trang đọc; chọn một màu giao diện xóa hai màu tùy chọn này để bộ màu có hiệu lực. Ảnh nền tủ truyện, font và giọng đọc được giữ. Font dùng font hệ thống có sẵn; không tải font từ nguồn tham khảo.

## Convert và Name

**Từ điển chỉ cần lưu một lần:** chọn Vietphrase/Names/Hán-Việt rồi bấm **Lưu ... file vào trình duyệt**. Tải lại trang tự mở bộ đã lưu; thông báo “Đang mở từ điển đã lưu” là đọc lại vào RAM, không cần chọn file lại. Sau khi lưu, app xin quyền lưu trữ bền vững nếu trình duyệt hỗ trợ; bị từ chối vẫn dùng IndexedDB bình thường. Đổi origin/thiết bị/profile hoặc xóa dữ liệu web không chuyển bộ cũ sang nơi mới; hãy giữ file nguồn để nhập lại khi cần.

Trong bản Convert, vùng đang chọn sáng lên khi bấm mũi tên của bảng tra từ. Nhấp đúp từ để lấy dòng đang hiển thị, nhấp ba lần để lấy đoạn. Khi dòng hoặc đoạn không có ánh xạ nguồn liên tục, trình đọc giữ vùng từ đã xác định. Kiểm tra trên Edge 893 px và 393 px với văn bản tổng hợp. Dùng hình học của các ô chữ qua [Element.getClientRects](https://developer.mozilla.org/en-US/docs/Web/API/Element/getClientRects), giữ nguyên cơ chế tra từ và lưu Name. Đã triển khai ngày 09/11/2026.

Nạp các từ điển TXT của bạn trong tab **Từ điển**. Reader mở bằng bản Convert và xử lý trong Worker trên máy. Chạm một từ để mở bảng nhỏ hv/HV/zw/Tr/tc ngay cạnh từ; dùng **Mở rộng** nếu cần cụm dài hơn. Dấu ✓ chỉ thay đúng lần xuất hiện đang chọn trong phiên. Nút đĩa lưu Name cố định cho truyện và áp dụng lại mọi lần xuất hiện phù hợp. Muốn kiểm tra chữ Trung thô, chọn **Công cụ → Xem bản gốc**.

Bảng **Name** nhận từng dòng `张三=Trương Tam`. **Lưu lại** cập nhật key trùng và thêm key mới. **Chạy** lưu rồi chuyển sang Convert. Xóa dòng trong ô soạn không xóa Name đã lưu; dùng × bên cạnh tên trong danh sách. **Nhập dữ liệu Name** đưa file vào bản nháp để xem trước, chưa tự lưu. **Xuất dữ liệu** xuất bản nháp hiện trong ô. Trong lúc lưu, các ô nhập bị khóa ngắn để bảo toàn bản nháp.

## Nghe sách — TikTok tiếng Việt

Bấm **Nghe sách** ngay trên trang đọc để phát; nút đổi thành **Tạm dừng/Tiếp tục**, đang tải thì bấm **Dừng tải** để hủy. **⚙ Nghe** mở cài đặt hai giọng TikTok **Nữ 1/Nam 1**. Không cần ô cho phép; bấm Nghe sẽ gửi câu đọc đến gateway. Không cần API key hoặc cookie TikTok. Câu đọc được gửi tới gateway cộng đồng; lỗi máy chủ500/502/503/504 được thử lại một lần sau0,6giây; nếu vẫn lỗi app dừng/báo lỗi, không đổi giọng hoặc bỏ câu.

- Có tạm dừng/tiếp tục, ■ dừng, tốc độ trên thiết bị và màu highlight. **Qua chương** tự phát chương kế khi bật; ■ hủy việc chuyển đang chờ. Ẩn bảng vẫn nghe.
- Mỗi đoạn tối đa200 ký tự Unicode, request timeout30giây. Khi đang đọc, tự tải trước2đoạn và dùng chung audio trùng trong cửa sổ3đoạn. Dừng/đổi chương/đổi giọng hủy bộ đệm. Câu đầu hoặc gateway chậm vẫn có thể phải chờ. Nữ2 và Bing/Google chưa cấu hình, không phát được.
- **Câu** sửa nội dung nghe trong phiên, không sửa chapter/file gốc. Highlight tắt khi dùng nội dung nghe khác bản đọc để tránh tô nhầm.
- Chrome Android thật/khóa màn hình/chạy nền chưa nghiệm thu. Audio thật Windows kiểm riêng; test Audio mock không chứng minh thiết bị thật.

## Dữ liệu và giới hạn

Truyện/từ điển nằm trong IndexedDB theo origin/profile trên mỗi thiết bị. Đổi trình duyệt, đổi origin hoặc xóa dữ liệu web không tự chuyển nội dung. Chưa có sync cloud/Gemini. Backup/restore có lỗi dữ liệu đã tái hiện; đọc BACKUP-GUIDE.md trước khi dùng, đặc biệt tránh Compact + Replace.

## 06/10/2026 — Nhập nhiều truyện và Kho cloud
Thêm truyện TXT cho phép chọn nhiều file cùng lúc. Mỗi TXT là một truyện riêng; các tùy chọn encoding/nhận diện chương/regex dùng chung cả lô. Bấm Chuẩn bị nhập nhiều truyện, xem danh sách rồi Xác nhận tất cả truyện vào thư viện. Hủy hoặc lỗi lúc chuẩn bị xóa bản tạm của cả lô, giữ truyện cũ. Tối đa100file,40MiB/file,256MiB/lô. Folder giữ quy tắc mỗi parent trực tiếp một truyện, mỗiTXT một chương.
Truyện ready tự thử upload nếu R2 và đăng nhập đã cấu hình. Mở Kho cloud để xem lỗi/thử lại và lấy danh sách/tải truyện về thiết bị khác. Bản cloud chỉ chữ/chương/Name tại lúc thêm, chưa đồng bộ chỉnh sửa về sau, filegốc/từđiển/progress/ảnhEPUB. Bản local không bị xóa khi cloud lỗi. Xem R2-SETUP.md: hiện tài khoản chưa bậtR2 và chưa có mật khẩu; không coi là sync online đã hoạt động.

## 06/10/2026 18:54 — Mở lại chương Convert nhanh
Kết quả Convert được cache trên thiết bị, tự dùng khi mở lại chương/tiêu đề đã đọc. Cache tự đổi khi sửa Name, từ điển, nội dung hoặc tùy chọn; không cần bấm nút để bật. Lần đầu/chương mới và tra từ vẫn có thể cần chờ từ điển ở nền. Cache có giới hạn và tự bỏ bản cũ; file truyện/từ điển gốc vẫn được giữ. Đây chưa phải dictionary cloud dùng chung thiết bị.

## 06/10/2026 22:07 — Kết nối kho R2 không nhập mật khẩu
R2 đã hoạt động. Trên Windows mở file riêng C:\Users\toann\.codex\private-novel\connect-cloud.html, bấm Kết nối và mở Thư Phòng một lần. Sau đó mở web bình thường; truyện mới tự đưa bản chữ/chương/Name lên cloud. Trong Kho cloud bấm Kết nối thiết bị khác để sao chép liên kết sang Android, mở một lần; giữ liên kết riêng vì nó cấp quyền kho.
Kho cloud tự lấy danh sách; Đọc truyện tải bản local rồi mở ngay Reader. Ngắt kết nối thiết bị chỉ xóa quyền và ACK local, truyện local vẫn giữ. Chưa đồng bộ file gốc, từ điển, tiến trình hoặc sửa đổi về sau; EPUB và mục còn chưa triển khai. Không cần tự tạo bucket/chạy database/lệnhsecret.

### 06/10/2026 22:42 ICT — Tủ sách gọn hơn (bản local)
Dùng nút Thêm truyện TXT ở đầu tủ sách để nhập. Sửa tên/tác giả hoặc xóa nằm trong menu ⋯ của từng truyện; xóa vẫn hỏi xác nhận. Sao lưu ở điều hướng Sao lưu. Gom Cài đặt và tủ sách local/cloud chung là kế hoạch tiếp theo, chưa triển khai/deploy lần này.

### 06/10/2026 22:51 ICT — Điều hướng đã lên Pages
Thanh chính còn Tủ sách và Cài đặt. Trong Cài đặt, chọn Nhóm cài đặt: Convert & từ điển để nạp/tra Convert; Kho & thiết bị để đọc cloud/kết nối điện thoại; Sao lưu & khôi phục để xuất/nhập backup; Thông tin để xem giới hạn. Nhóm vừa chọn được nhớ trong phiên. Tủ sách dùng một nút Thêm truyện TXT và menu ⋯ để Sửa/Xóa. Deploy9971e099 đã kiểm hai kích thước màn hình; Android thật chưa xác minh.

## 07/10/2026 18:29 ICT — Kho chung tự động, không kết nối hay đồng bộ thủ công
Mở https://thu-phong-private.pages.dev/ là thấy các truyện đã đưa lên kho. Bấm Mở sách để tự tải và đọc; lần đầu tự lưu bộ từ điển mặc định, các lần sau không chọn lại file. Lần đầu tải53.5MB nên cần chờ; bài đo hai trình duyệt sạch khoảng9giây, không đảm bảo cùng tốc độ trên Android thật/mạngkhác. Từ điển bạn tự chọn trên thiết bị vẫn được giữ.
Thêm truyện TXT ở đầu Tủ sách; sau xác nhận app tự gửi bản chữ/chương/Name. ⋯ → Xóa xóa khỏi kho và thiết bị này nếu có kết nối; người mở mới không thấy, bản trên máy khác được giữ và đánh dấu kho đã xóa. Ai có URL đều được đọc/thêm/xóa theo lựa chọn của bạn.
Thanh chính chỉ Tủ sách và Cài đặt; chế độ này Cài đặt có Convert/từ điển và Thông tin. Bỏ menu Sao lưu/Kho/Đồng bộ thủ công. File gốc/ảnh EPUB/progress/Name sửa sauupload chưa được lưu đầy đủ ở kho; ẩn menu không có nghĩa cloud đã thay mọi bản sao lưu. Giới hạn32MiB/bản và9GBreservation; xóa hiện chưa giải phóng budget vì chống race.

## 07/10/2026 — Chia chương bắt buộc, Album tùy chọn
Trong Thêm truyện, nhập tên Album nếu muốn gom truyện thành tập hợp; để trống vẫn nhập/đọc bình thường. Cùng tên Album xuất hiện thành một lựa chọn trong Lọc Album tại Tủ sách. Đặt Album lúc nhập một file, nhiều file hoặc folder; mỗi truyện vẫn có bộ chương riêng. Chưa hỗ trợ chuyển/đổi Album truyện đã lưu trên cloud.
TXT/dán/lô tự nhận diện tiêu đề chương, không có nút tắt. Folder xử lý TXT theo thứ tự tên, tách tiêu đề bên trong và chia phần quá dài; giữ file gốc. Xem trước chương rồi xác nhận. Không có tiêu đề nhận diện được thì dùng tên file và chia phần theo giới hạn, không bịa tên. Folder vẫn giới hạn2MiB/TXT và32MiB/folder; TXT lớn nên nhập file riêng. EPUB chưa hỗ trợ. Nhóm lớn >32MiB snapshot vẫn chờ lưu riêng từng chương trên cloud.

## 07/10/2026 — TXT lớn trong folder
Tải lại web để lấy bản mới, chọn folder như trước. TXT lớn hơn2MiB tự thành truyện riêng mang tên file và tự chia chương; các TXT nhỏ vẫn thuộc truyện của folder. Bản xem trước chỉ rõ file nào thành truyện riêng. Album đã chọn áp dụng cho mọi truyện khi xác nhận.
Giới hạn40MiB mỗi TXT riêng,32MiB các TXT thường mỗifolder,256MiB cảlượt; vượt giới hạn/quota báo trước khi nhập. Cloud vẫn giới hạn32MiB bảnchữ của mỗi truyện, không phải giới hạn40MiB củafilegốc. Filegốc giữ trênthiếtbị; EPUB chưa hỗ trợ.

## 08/10/2026 — Quy tắc nhập hiện hành thay cách gộp folder cũ
Mỗi TXT là một truyện; tự tách tiêu đề chương và các phần quá dài. Chọn folder: mỗi folder trực tiếp chứa TXT là một Album, mỗi TXT bên trong thành truyện riêng. Album hiển thị đường dẫn tương đối gồm folder bạn chọn để phân biệt các folder con trùng tên. Không cần điền Album cho folder. Nhập file đơn/lô vẫn được chọn Album tùy ý.
Bản xem trước liệt kê Album và các truyện; xác nhận mới lưu. UTF8/UTF16 có BOM tự nhận riêng từng file, khôngBOM dùng Encoding đã chọn; TXT rỗng/chỉkhoảngtrắng báo lỗi và dọn bản tạm. Limits40MiB/TXT,256MiB/lượt; cloud32MiB/bản chữ giữ. Truyện đã nhập theo cách cũ không tự tách/chuyểnAlbum. Menu⋯mở rộng trongcard đểSửa/Xóa không bịkhuất; đã bỏtopbar/note/footerthừa.

## Reader / Name mới
- Tiêu đề truyện xuống dòng đầy đủ, chữ lớn hơn. Tìm bằng tên gốc hoặc tên Việt đã được chuẩn bị; có thể nhập tiếng Việt không dấu, tên tác giả hay Album.
- Cỡ chữ mặc định mới19, giãn dòng1.65; cài đặt cũ giữ nguyên. Trong ⚙, mục Hiển thị nâng cao chứa màu chi tiết, chiều rộng và căn chữ. Mặc định hiển thị chỉ đặt lại cách đọc, giữ lựa chọn giọng.
- Chạm từ để sửa Name như trước, hoặc ⚙ → ✎ Name → tìm tên/chạm hàng → sửa → Lưu tên. Convert tự cập nhật; không cần Chạy. Trong lúc cập nhật vẫn đọc được nội dung trước đó; sửa từ/TTS chờ bản mới. Nếu lỗi thì giữ nội dung và có Thử lại Convert.
- Nhập/xuất và sửa nhiều dòng được thu gọn trong bảng Name. Xuất bản nháp lấy đúng ô đang soạn. Lưu nhiều tên gộp các key; bỏ một dòng không xóa Name đã lưu. Nút× xóa đúng tên được chọn. File đọc muộn sau khi đóng bảng không được đưa vào nháp mới.
- Name mới/sửa vẫn lưu trên trình duyệt hiện tại. Kho cloud hiện giữ bản snapshot lúc thêm truyện; chưa đồng bộ các Name thay đổi sau đó sang thiết bị khác.


### Xem trước và giới hạn chương (11/10/2026)
Sau khi chọn TXT/batch/folder hoặc dán nội dung, chờ phân tích để xem tổng số chương và ký tự. Mở tên từng file trong “Xem trước chia chương” để xem mục lục; danh sách chỉ hiện 300 chương đầu/file nhưng tổng số đếm đủ. Chọn “Giới hạn số chữ 1 chương” để giữ chương hoặc chia phần 4.000–64.000 ký tự, hay tự nhập 100–128.000. Giữ nguyên chương có trần128.000 ký tự để sao lưu/cloud tương thích; vượt trần sẽ thành phần. Ký tự gồm khoảng trắng/xuống dòng và dùng UTF-16 (emoji thường tính2). AI hiện nhận tối đa32.000/chương, nên chọn32.000 khi cần dịchAI. Mốc trùng không tạo chương riêng nhưng chữ gốc vẫn còn. Chương cũ không tự chia lại: thiết lập chỉ áp dụng lần nhập mới. Regex tùy chỉnh thay hoàn toàn bộ nhận diện mặc định.

## 19/10/2026 — Đồng bộ khi có nhiều truyện

Tải lại trang chỉ kiểm tra dấu phiên bản tại máy. File gốc đã xác nhận và chưa thay đổi không được đọc/tính SHA hay hỏi cloud riêng lần nữa. File mới, phục hồi hoặc thay đổi được xác minh đầy đủ; khi có mạng trở lại app thử tiếp mục chưa hoàn tất. Chỉ hiện tiến độ khi đang gửi dữ liệu và báo lỗi nếu chưa lưu được.

Nguồn cũ cần một lượt xác minh để tạo dấu phiên bản mới. Không cần xóa hay nhập lại truyện. Đây là tối ưu đồng bộ file gốc; danh sách kho vẫn được làm mới, và dung lượng lưu trữ vẫn có giới hạn hiện hành.

## 19/10/2026 — Phòng tối

Các Album nằm trong **Phòng tối**. Cuộn đến cuối Tủ sách rồi chọn **Phòng tối** để vào. Bấm **Tủ sách** để quay về. Đường dẫn `/phong-toi` mở lại được sau khi tải lại trang. Truyện chưa gán Album vẫn ở Tủ sách.

Thứ tự là tác giả (Album) → series (Album con) → truyện → chương. Chọn tên Album để mở, hoặc dùng đường dẫn phía trên tên để trở về Album cha. Ở Phòng tối, ô tìm lọc Album và truyện; khi mở một Album, ô tìm còn dò tên chương đã tải. Để sửa tên hoặc xóa, chọn **Quản lý** rồi chọn mục cần thao tác.

## Nhập một TXT tuyển tập thành nhiều truyện

Chọn một TXT trong Thêm truyện, rồi bấm **Tách tuyển tập thành nhiều truyện**. Bộ dò chỉ đề xuất: dòng được đánh dấu bắt đầu truyện mới, những mốc còn lại thuộc truyện trước. Kiểm tra các cảnh báo thiếu/sai số và sửa tên truyện. Nếu định dạng khác, mở Regex mốc truyện để nhận diện tiêu đề riêng.

Bộ dò ưu tiên dòng `书名：Tên`, `作品：Tên`, `文件1: Tên.txt` hoặc `《Tên》 作者：Tác giả` khi có ít nhất hai mốc. Các chương bên trong không tính vào giới hạn2.000 mốc truyện khi đã nhận diện được các dòng tên riêng này. Nếu chưa nhận diện được tên truyện và gặp quá nhiều tiêu đề chương, không nhập/truncate dữ liệu; hộp Regex tự mở để chọn mẫu chính xác hơn. Ví dụ `^文件\s*[0-9０-９]+\s*[:：]\s*.+\.txt\s*$` chỉ dùng nếu các nhãn này thực sự nằm trong TXT, không phải nhãn thêm khi dán. Kiểm tra và bỏ các mốc chỉ thuộc danh sách giới thiệu; không mặc định mọi tên được dò đều là truyện đầy đủ.

Bấm **Tiếp tục xem trước chương**. Chọn Album theo tác giả/Series, kiểm tra mục lục của từng phần rồi **Nhập nhiều truyện**. Tối đa40MiB/file và100truyện; mỗi truyện lưu phần TXT tương ứng, giữ byte/encoding, thứ tự các phần. Tên file/đường dẫn phần tách được làm sạch; toàn bộ nội dung file vẫn được giữ qua các phần, kể cả phần giới thiệu đầu file. Nhập lại tuyển tập tạo lô mới như nhập nhiều file, không tự sửa hay tách lại truyện đã có. Xem ANTHOLOGY-IMPORT-1.md.


## Sửa và xóa chương TXT
Mở thông tin truyện → Quản lý chương. Bấm Sửa để đổi tên/nội dung rồi Lưu hoặc Hủy. Tích chương → Xóa đã chọn → kiểm tra danh sách và xác nhận. Chương bị bỏ khỏi danh sách đọc; mở Đã xóa, tích rồi Khôi phục khi cần. Bấm Xong để ẩn các thao tác. File TXT gốc giữ nguyên. Truyện đã lưu lên kho cần xác nhận đồng bộ trước khi xóa có hiệu lực; khi mất mạng, chương còn nguyên và yêu cầu sẽ được thử lại.
