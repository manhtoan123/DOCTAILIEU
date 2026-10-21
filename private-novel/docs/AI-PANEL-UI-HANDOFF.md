# Bàn giao thiết kế lại bảng AI — 16/10/2026

Tài liệu đối chiếu mã hiện hành của Thư phòng. Phạm vi chính: bảng “Prompt & model” trong trang đọc, cùng các nút/trạng thái AI liên quan bên ngoài bảng. Đây là yêu cầu đổi UI, không phải viết lại bộ dịch.

Ba bản phác thảo “Gọn một dòng / Hai tab / Theo hai nửa” chỉ là ý tưởng. Đặc biệt, bộ chọn thủ công “Chương này / Chương sau” và hai tab tổng “Tiến độ / Prompt & model” trong bản phác thảo CHƯA có trong sản phẩm. Sản phẩm hiện tự xác định công việc đang hiển thị. Không coi các bản mẫu là danh sách đầy đủ chức năng.

## 1. Chỉ thị có thể giao nguyên văn cho AI làm UI

> Làm lại UI bảng AI của ứng dụng hiện có, theo danh mục và quy tắc trong tài liệu này. Tái sử dụng các component, state, callback và bộ dịch hiện hành. Được thay bố cục, CSS, nhãn, icon, tab, accordion và cách gom thông tin lặp; không tự xóa chức năng vì mặc định nó đang ẩn hoặc chỉ xuất hiện khi lỗi.
>
> Không viết lại client/API, đổi schema hoặc khóa lưu cài đặt, xóa prompt cũ, thay key policy, thêm provider, thay default/model IDs, tăng concurrency, thay ngân sách retry hay ghi tiến trình từ UI. Không đưa key vào bundle/log/URL. Không thêm login/PIN hoặc luồng xác nhận mới. Không tự đổi prompt đã lưu của người dùng.
>
> Trước khi sửa, lập bảng ánh xạ: chức năng cũ → vị trí mới → state/callback cũ dùng lại → kiểm chứng. Chức năng chưa đưa lên màn hình phải vẫn có đường mở rõ ràng. Không thay thao tác thật bằng nút mẫu, timeout giả hoặc dữ liệu tĩnh. Không dựng thêm bộ chọn/chức năng chưa có mà không chỉ rõ đó là phần mới.

## 2. Khung tổng thể hiện có

```text
Trang đọc, nội dung truyện giữ nguyên phía sau
  Bản đọc: Convert | Bản gốc | Dịch AI
  Nút nổi ⚙ AI + badge trạng thái chuẩn bị chương sau

  Bảng Prompt & model
  ┌ Header: tên bảng                         Ẩn × ┐
  │ Body: cuộn độc lập                           │
  │   Trạng thái công việc đang theo dõi          │
  │   Hành động khắc phục lỗi, khi có             │
  │   Chọn prompt đã lưu / Tùy chỉnh của truyện   │
  │   Name riêng — thu gọn, chỉ đọc              │
  │   Model đã dịch thực tế, khi có              │
  │   Prompt thực tế nửa sau — khi đã có         │
  │   Thử prompt — thu gọn                       │
  │   Cách dịch & model                         │
  │     Dịch sẵn, model ưu tiên, fallback        │
  │     Hybrid, model Lite nửa sau               │
  │     Editor: nửa đầu / nửa sau / nâng cao     │
  │   API keys — thu gọn                         │
  │   Lỗi hoặc kết quả chạy thử, khi có          │
  ├ Footer luôn thấy                            ┤
  │ Đã lưu / Chưa lưu    Lưu prompt              │
  │                     Lưu và tiếp tục khi lỗi │
  └─────────────────────────────────────────────┘
```

- Bảng nổi bên phải; hiện giới hạn rộng khoảng480px trên desktop. Mobile gần toàn chiều rộng và giới hạn theo viewport.
- Header/footer nằm ngoài body cuộn. Footer không bị banner lỗi, bàn phím hoặc mép an toàn điện thoại che.
- Có thể đổi cách phân vùng, nhưng không biến việc đọc thành thao tác phải đóng một dialog chặn toàn màn hình mỗi lần.
- Đóng bằng “Ẩn ×” hoặc Escape; trả focus về nút mở, hoặc nút AI nếu nút mở đã biến mất.
- Đóng bảng hủy tác vụ **chạy thử cục bộ trong bảng**, không tự dừng tác vụ dịch chương do Reader quản lý. Dừng dịch chương có nút riêng.

## 3. Trạng thái dịch và hành động phục hồi

| Nội dung/hành động | Hành vi phải giữ |
|---|---|
| Chương đang đọc / Chương sau | Hiện đúng mục tiêu của công việc, không gán nhầm tất cả nút vào chương đang đọc. Hiện tại mục tiêu được Reader chọn tự động. |
| Trạng thái | Chưa bắt đầu, đang dịch, chờ mạng, chờ thử lại, đã tạm dừng/lỗi, hoàn tất; chương sau còn có tắt tải trước, đang chuẩn bị, sẵn sàng, không còn chương sau. |
| Model thực tế | Model đang thực sự xử lý hoặc đã tạo bản dịch; phải phân biệt với model ưu tiên trong cài đặt. Ví dụ ưu tiên Gemma nhưng bản thực tế dùng Gemini2.5 sau fallback là hợp lệ. |
| Hybrid | Biết đang ở nửa1 hay nửa2; khi nửa2 chạy, biết nửa đầu đã hoàn tất và dùng model nào. |
| Tiến độ phần | Số phần đã hoàn tất / tổng số phần của nửa/phần công việc hiện tại, thanh tiến độ lấy dữ liệu thật. Không tự quy đổi thành % toàn chương nếu chưa có phép tính tương ứng. |
| Thử lại AI | Chỉ có khi handler cho phép; chưa có phần hoàn tất thì dùng nhãn thử lại. |
| Tiếp tục phần còn thiếu | Có checkpoint/nửa đầu đã xong thì tiếp tục phần thiếu, không mặc định dịch lại cả chương. |
| Dừng dịch | Hủy đúng công việc hiện tại hoặc prewarm đang được theo dõi; giữ phần đã hoàn tất để dùng lại. |
| Đếm ngược thử lại | Chỉ hiển thị khi engine cung cấp lịch hợp lệ; không tự tạo retry/timer mới trong UI. |
| Dừng tự thử lại | Hủy lịch tự thử lại; khác với việc hủy request dịch đang chạy. |
| Lỗi cấu hình | Hướng người dùng kiểm model/prompt; không lặp yêu cầu lỗi cố định. |
| Lỗi API key | Hướng về mục API keys; sau khi sửa vẫn cho thử lại thủ công. |
| Đổi model nửa sau | Khi lỗi tại nửa2 của hybrid, có lối đưa focus/scroll tới đúng select Lite. Thao tác hiện tại chỉ đưa người dùng tới ô chọn, không tự chọn model hoặc tự gửi lại. |
| Chi tiết lượt dịch | Thu gọn: lịch sử ngắn các model đã thử, mã lỗi an toàn, request ID khi có, số phần phục hồi khi có. Không hiển thị body lỗi thô, key, nguồn hoặc prompt riêng trong diagnostics. |

Lịch sử model hiện giữ tối đa8 nhãn. Phần đã hoàn tất được giữ trong phiên; sau reload chỉ hứa dùng lại những checkpoint đã ghi thành công trên máy. Không tuyên bố luôn lưu được khi IndexedDB lỗi.

Khi đã hoàn tất, được gộp các dòng trùng nghĩa và ẩn thanh100%/“1/1 phần” để UI gọn hơn; vẫn phải còn đường xem model thực tế và chi tiết. Không xóa dữ liệu tiến độ chỉ vì không vẽ nó.

## 4. Chọn prompt và phạm vi cài đặt

- Dropdown có “Tùy chỉnh của truyện”, prompt chung và prompt riêng đúng truyện hiện tại; không đưa prompt riêng truyện khác vào.
- Mẫu hệ thống “Mặc định” được ẩn khỏi danh sách, nhưng fallback nội bộ vẫn giữ.
- Các tên trùng cùng phạm vi được gom; Reader hiện vẫn giữ lựa chọn theo ID và có thể truy cập các bản cũ trong nhóm. Không làm mất lựa chọn đang dùng.
- **Lưu ý quyết định UI mới nhất:** trang **Cài đặt → Kho prompt** đã bỏ ô “Phiên bản” và số phiên bản trên thẻ; thẻ mở bản mới nhất. Không khôi phục các ô đó khi làm lại bảng AI; cũng không xóa profile cũ hoặc tự đổi ID của Reader.
- Chọn một profile thật là thao tác lưu lựa chọn và áp dụng qua handler hiện có, không chỉ thay chữ trên dropdown. Không tự bắt người dùng bấm Lưu thêm mới có hiệu lực.
- Mục “Tùy chỉnh của truyện” là lựa chọn đại diện cấu hình tùy chỉnh hiện có; không tự sáng tác thao tác xóa/reset profile khi chọn giá trị rỗng.
- Chỉnh editor biến nội dung thành bản tùy chỉnh. Cài đặt theo truyện phải tiếp tục dùng đúng khóa lưu cũ; fallback cài đặt chung khi cần tương thích.
- Kho prompt lỗi phải có thông báo. Lỗi đọc cài đặt là trường hợp khác: không được lấy mặc định rồi âm thầm ghi đè cấu hình chưa đọc được.

## 5. Name riêng và dữ liệu tham khảo

- Mục thu gọn “Name riêng của truyện (số mục) → {{name}}”.
- Textarea **chỉ đọc**, chứa các cặp key=value của truyện. Không biến thành trình sửa Name mới hoặc lưu đè bằng nội dung textarea này.
- AI hiện nhận Name riêng của truyện; không tự gộp Name chung/từ điển Convert vào request chỉ vì giao diện mới có chỗ trống.
- Con số có thể lớn hơn1.000; không cắt danh sách chỉ vì giới hạn số Name trên một request API. Pipeline hiện có chịu trách nhiệm chọn Name phù hợp và xử lý caption của Name có ảnh.
- Name có ảnh vẫn được bảo toàn ở dữ liệu gốc; AI dùng chữ/caption theo pipeline cũ. Đổi UI không được tự bỏ markup hoặc tải/chèn ảnh vào prompt mới.
- Có dòng “Model bản dịch” khi đã có kết quả/model hai nửa.
- Có mục thu gọn “Prompt thực tế của lượt dịch nửa sau gần nhất” khi đã có preview. Textarea **chỉ đọc**: đây là prompt đã dựng cho lượt gần nhất, không phải ô chỉnh template. Không thay preview bằng bản template chưa được render.

## 6. Cách dịch, model và hybrid

### Dịch sẵn chương kế tiếp

- Checkbox được nối `onPreloadChange` của Reader. Đây là tùy chọn riêng với bản nháp prompt, không được chuyển toàn bộ hành vi sang nút Lưu prompt.
- Tự chuẩn bị chương kế tiếp theo luồng đang có; không tạo vòng lặp dịch cả truyện.
- Convert → bấm Dịch AI: giữ bản Convert và vị trí chương đang đọc, chuẩn bị AI cho chương sau. Khi mở chương sau, dùng tác vụ/kết quả đã chuẩn bị; không gửi lại vô ích.

### Model ưu tiên và model dự phòng

- Dropdown lấy từ `AI_MODELS`; không hardcode danh sách từ ảnh hay tự gọi API liệt kê model mới.
- Hiện có9 lựa chọn chung trong mã: Gemini3.8Flash,3.7Flash,3.5Flash, Gemma4 26B A4B, Gemini2.5Flash, Gemini3FlashPreview, Gemini3.1Flash-Lite, Gemini3.1ProPreview, Gemma4 31B. Đây là danh sách cấu hình của app, không phải cam kết mọi key đều gọi được tất cả model.
- Model mặc định lấy `DEFAULT_AI_MODEL`; không thay theo model tình cờ có trong screenshot.
- Dòng chuỗi fallback là **thông tin**, không phải editor chọn thứ tự model. Lấy qua helper hiện có; đổi model ưu tiên cập nhật fallback bằng handler hiện có.
- Không lấy số key “đang dùng” để tự quyết định số request song song.

### Bật/tắt dịch kết hợp

- Checkbox “Dịch kết hợp: nửa đầu làm mẫu”. Đây là tùy chọn; không ép mọi người dùng bật hybrid.
- Bật hybrid thì model nửa đầu không được là Lite. Nếu đang chọn Lite, giữ cách xử lý chuyển sang model hợp lệ hiện có.
- Chương trên ngưỡng hiện tại1.800ký tự mới chia hai nửa; chương ngắn dùng model ưu tiên. Mỗi nửa có thể gồm nhiều request nhỏ, không được hiểu “hai nửa” là đúng hai HTTP request.
- Nửa đầu dùng chuỗi model ưu tiên/dự phòng; không tự hạ xuống Lite nếu nửa đầu thất bại.
- Nửa sau bắt đầu sau khi nửa đầu hoàn tất, có **Name + toàn bộ nguồn nửa đầu + toàn bộ bản dịch nửa đầu + nguồn đích nửa sau**.
- Dropdown nửa sau lấy từ `HYBRID_LITE_MODELS`, hiện gồm Gemini3.1Flash-Lite và Gemini3.5Flash-Lite. Lưu ý3.5Flash-Lite không nằm trong picker model chung, nên không chỉ dùng `AI_MODELS` để dựng picker này.
- Chỉ sửa model/prompt nửa sau rồi lưu và tiếp tục phải dùng lại nửa đầu hợp lệ; không tự dịch lại nửa đầu.
- Dữ liệu cũ `hybrid.rules` vẫn được bảo toàn dù UI không còn ô “Quy ước xưng hô” riêng. Hiện người dùng chỉnh yêu cầu đó trong prompt nửa sau; không tự xóa trường cũ vì không thấy editor.

## 7. Toàn bộ editor và validation

| Ô/điều khiển | Chức năng và quy tắc |
|---|---|
| User Prompt Template | Ô prompt thường hoặc nửa đầu. Bắt buộc có `{{text}}`; khi hybrid bật phải đúng1lần. `{{name}}`, `{{language}}` là biến tùy chọn của template thường. |
| Prompt nửa sau | Ô độc lập, không sửa chung với nửa đầu. Bắt buộc đúng1lần `{{name}}`, `{{firstHalfTranslation}}`, `{{text}}`; kiểm alias qua helper cũ. |
| Nguồn mẫu nửa đầu | `{{firstHalfSource}}` tùy chọn để đặt vị trí; nhiều nhất1biến nguồn tính cả alias. Nếu bỏ, engine vẫn tự chèn nguồn mẫu đầy đủ. Không bỏ nguồn khỏi request vì textarea không có biến này. |
| Alias tiếng Việt | Nhận `{{bản dịch nửa đầu}}`, `{{text nửa sau}}`; nguồn nhận `{{text nửa đầu}}`, `{{nguồn nửa đầu}}`, `{{text nửa trước}}`. Tương thích `{name}` cũ qua helper hiện có; không tự viết bộ replace đơn giản khác. |
| Nửa đầu / Nửa sau / Nâng cao | Khi hybrid bật, có3vùng. “Nửa đầu” là User Prompt Template, “Nửa sau” là template độc lập, “Nâng cao” có System Prompt/nhiệt độ. Khi hybrid tắt, chỉ Prompt/Nâng cao. |
| System Prompt | Editor riêng; không được dùng chung state với User Prompt hoặc prompt nửa sau. |
| Nhiệt độ | Slider0–1, bước0,05, hiện giá trị. Model không hỗ trợ thì disable và giải thích; giữ giá trị lưu cho model khác, không tự xóa. Dùng `supportsAiTemperature`. |
| Mở rộng/Thu gọn | Mỗi editor có trạng thái mở rộng riêng, hiện có thể tăng đến16dòng. |
| Chèn biến | Các nút biến chèn tại caret hoặc thay vùng đang chọn; trả focus/caret đúng vị trí. Không chỉ nối vào cuối ô. |
| Giới hạn editor |8.000ký tự mỗi ô. Chặn chèn biến làm vượt giới hạn, không cắt nội dung âm thầm. |
| Khôi phục prompt nửa sau | Chỉ đặt lại draft của template nửa sau về `DEFAULT_SECOND_HALF_PROMPT`. |
| Khôi phục mặc định | Đặt draft về cấu hình mặc định chung hiện có; không tự ghi, không gửi dịch ngay. |
| Prompt không hợp lệ | Có thông báo rõ; chặn chạy thử/lưu/tiếp tục tương ứng. Dùng validator hiện hành, không viết điều kiện mới chỉ kiểm textarea có chữ. |

Các giá trị mẫu/nguồn là dữ liệu, không được replace biến đệ quy bên trong chúng. Không stringify, escape hoặc thêm nguồn mẫu lại ở UI nếu bộ dựng prompt đã làm; sẽ tăng token hoặc gửi sai nội dung.

Hiện hai nửa dùng chung System Prompt theo cấu hình/pipeline; chỉ User Prompt nửa sau có template độc lập. Chưa có hai editor System Prompt riêng cho hai nửa. Progress còn có thể cung cấp `retrying` và `waitUntil`; giữ chúng khi truyền state dù UI mới chọn gom cách hiển thị.

## 8. Chạy thử prompt và kết quả thử

- Mục thu gọn “Thử prompt” có nút Chạy thử. Hiện dùng đoạn tiếng Trung và Name **tổng hợp cố định**, gọi API thật với cấu hình đang soạn; không phải dịch chương đang đọc và không lưu vào truyện.
- Mẫu ngắn nên không phải phép nghiệm thu cả hai nửa hybrid/chương dài. Không ghi nhãn “đã kiểm cả chương” chỉ vì nút này thành công.
- Chặn khi chưa nạp được cài đặt, prompt sai hoặc đã có tác vụ thử đang chạy.
- Đang thử có trạng thái chạy và nút Hủy. Hủy/đóng bảng/đổi nguồn hoặc cấu hình làm kết quả muộn không được áp dụng.
- Chương trên128.000ký tự có cảnh báo; vẫn được thử fixture ngắn.
- Thử thành công hiện: bản dịch, nhãn “Kết quả fixture tổng hợp — không lưu”, model thực tế, số token input→output, finishReason.
- Hành động kết quả: **Sao chép**, **Tải TXT**, **Xóa kết quả**. Xóa ở đây chỉ xóa kết quả thử trong bảng; không xóa chương hay cache AI của truyện. Tải thử hiện có tên `ai-thu.txt`.
- Thử lỗi có thông báo lỗi và notification qua handler cũ. Không render kết quả như HTML tùy ý.
- Trong mã có nhánh/hook dịch không phải fixture, nhưng hiện bảng chỉ có nút chạy thử mẫu. Không tự thêm nút “Dịch cả chương” vì thấy `runTranslate(false)`/`onTranslated` trong mã.

## 9. Quản lý API keys

- Mục thu gọn, summary có số key khả dụng khi đã tải; chưa tải có trạng thái chưa biết.
- **Chỉ tải/poll khi mở mục.** Hiện refresh5giây; không chồng request. Trang ẩn không poll; đóng mục/unmount hủy request và timer. Đừng chuyển polling lên top-level làm nó chạy khi bảng/mục đóng.
- Danh sách hiện: nhãn, key dạng che, Đang dịch/Đang chờ/Sẵn sàng/Dự phòng, HTTP cuối và thời điểm dùng cuối nếu có.
- Có nút xóa đúng key, trạng thái đang thao tác và lỗi; không đổi thành xóa toàn pool.
- Có trạng thái không có key lưu trong app nhưng đang có key cấu hình sẵn trên máy chủ; có số key hỏng bị loại khi server cung cấp.
- Ô dán Gemini key: mỗi dòng1key, tối đa16.000ký tự, hướng dẫn tiền tốAIza. Nút Thêm key, Xóa ô nhập; chặn double submit, báo số thêm/bỏ qua, xóa draft sau thêm thành công. “Xóa ô nhập” không gọi DELETE key.
- Giữ cảnh báo hiện có: trang công khai, người có URL có thể thêm/xóa; server chỉ trả key che. Không thêm login/PIN, không đưa key thô đã lưu về UI và không log nội dung ô dán.
- Tiếp tục dùng `listAiKeys/addAiKeys/deleteAiKey`; không thay API/key-store/pool/lease/concurrency để phục vụ hình thức UI.

## 10. Footer và khác biệt giữa các thao tác lưu

| Thao tác | Ý nghĩa phải giữ |
|---|---|
| Có thay đổi chưa lưu / Đã lưu cài đặt | Phản ánh bản nháp settings so với cấu hình đã lưu, không suy từ trạng thái dịch. |
| Lưu prompt | Ghi cấu hình, áp dụng từ lượt dịch tiếp theo. Không hủy/dịch lại công việc đang đọc chỉ vì bấm Lưu. |
| Lưu và tiếp tục | Chỉ hiện khi công việc lỗi và có handler. Ghi xong thành công rồi mới tiếp tục **đúng target** với settings mới, giữ phần hợp lệ. |
| Đang lưu | Chặn thao tác lặp hoặc chọn profile gây tranh chấp trong khi lưu. |
| Lưu thất bại | Báo lỗi, giữ bản nháp; không phát callback tiếp tục như thể đã lưu. |
| Lưu chậm + chuyển truyện/chương | Kết quả cũ không được kích hoạt dịch hoặc áp dụng cấu hình nhầm lên target mới. |

Checkbox preload, chọn profile và thêm/xóa key có handler riêng; không gom tất cả thành draft rồi đợi nút Lưu prompt. Ngược lại, gõ editor/khôi phục draft không được tự gửi API hoặc tự lưu.

## 11. Các chức năng AI ngoài bảng cũng phải được nối đúng

- Nút nổiAI mở/ẩn bảng, có trạng thái mở và badge `… / ✓ / !` cho chương sau; có mô tả cho screen reader.
- Nút Dịch AI trên thanh Convert/Bản gốc/Dịch AI vẫn giữ hành vi đang có; không dùng một `setMode('ai')` thay mọi trường hợp.
- Khi Convert chuẩn bị chương sau, giữ nguyên chữ, vị trí đọc, chương hiện tại. Không tạo thêm lượt dịch khi bấm lặp hoặc khi prewarm được đưa lên foreground.
- Banner lỗi có hành động sửa cấu hình/thử lại/tiếp tục đúng target; prewarm đang chạy có dừng dịch sẵn, lỗi có thử lại chương sau.
- “Tùy chọn khác → Dịch lại bằng model dự phòng” là thao tác **dịch lại toàn chương**, có thông tin dùng thêm lượt dịch. Không biến nó thành mặc định của “Tiếp tục phần thiếu”.
- Notice model đã dịch hiện khoảng5giây rồi ẩn. Không tạo lại banner “chương sau sẵn sàng” thường trực trùng badge.
- Giữ tích hợp nút nghe/TTS và cài đặt đọc bên cạnh nếu đổi container floating tools; tác vụ này không được viết lại hoặc làm mất các nút đó.

## 12. Điều UI không được làm thay engine

- Dịch thường chia phần khoảng1.800ký tự; hybrid chia hai nửa rồi mỗi nửa có thể chia tiếp; EPUB giữ mapping ID và DOM/layout. UI chỉ đọc tiến độ/hiển thị kết quả theo dữ liệu engine.
- Giữ dedupe công việc, checkpoint/cache identity, model pin, hủy request, chống phản hồi muộn, pause offline/cooldown, retry có giới hạn và kiểm chất lượng trước công nhận hoàn tất.
- Bản còn bị cắt hoặc bị kiểm tra chất lượng từ chối không được đánh dấu “sẵn sàng” chỉ vì HTTP200/finishReasonSTOP hoặc tiến độ một nửa đạt100%.
- Mốc đọc đồng bộ là chương AI hoàn tất cao nhất, **kể cả prewarm chưa mở**; bản dở không cập nhật mốc và mở chương cũ không kéo lùi. Không ghi mốc từ animation/progressbar/nút đóng UI.
- Cache ghi xuống máy là best effort. Không xóa source/chương/cache cũ trước khi có bản thay thế hợp lệ, không migration/tái nhập truyện để làm UI.
- Không thay dữ liệu gốc, bytes/SHA/revision, cấu trúc EPUB, cloud-delete, secret hoặc schema đồng bộ.

## 13. Tệp và giao diện kỹ thuật cần dùng lại

Đường dẫn dưới đây tính từ `private-novel/`:

| Tệp | Vai trò |
|---|---|
| `src/ui/AiPanel.tsx` | State bản nháp, đọc/lưu cấu hình, chọn profile, chạy thử, quản lý key và đóng bảng. |
| `src/ui/AiJobStatus.tsx` | Khung công việc; dữ liệu `AiJobView`; điều khiển bằng callback được truyền, không tự gửi dịch. |
| `src/ui/AiPromptEditor.tsx` | Editor, mở rộng, chèn biến/caret và giới hạn8.000. |
| `src/ui/AiFallbackFields.tsx` | Hiện chuỗi fallback từ model ưu tiên. |
| `src/ui/Reader.tsx` | Chủ công việc current/prewarm, retry/stop/continue, scroll/mode/progress/TTS. |
| `src/ai-settings-type.ts` | Kiểu `ReadingAiSettings`; giữ trường tương thích cũ. |
| `src/ai-models.ts`, `src/ai-hybrid-prompt.ts` | Model IDs/nhãn/capability, Lite, template/alias/validation/preview/default. |
| `src/prompt-stock.ts`, `src/prompt-sync.ts`, `src/ui/prompt-list.ts` | Profile/selection/grouping/sync; không fork store mới. |
| `src/ai-key-admin.ts` | API client cho key đã che. |
| `src/ai-reading.ts`, `src/epub-ai.ts` và các module `ai-*` | Bộ dịch/retry/cache/parts/hybrid/metrics: giữ nguyên trừ khi phát hiện vấn đề thực sự và mở phạm vi riêng. |
| `src/stv-layout.css` | Layout/style AI panel hiện hành. |

**Dữ liệu công việc:** `target`, `status`, `model`, `progress`, `error`, `retryIn`, `configuration`, `history`, `errorCode`, `requestId`. Progress có `done`, `total`, `active`, `text`, `parallel` và tùy trường hợp `half`, `halfModels`, `sample`, `promptPreview`, `nodes`, `recoveryPasses`; không bắt toàn bộ trường luôn tồn tại.

**Callback panel phải giữ:** `onClose`, `notify`, `onSettingsChange(settings,defer?)`, `onPreloadChange(value)`, `onRetry`, `onStop`, `onPauseRetry`, `onContinue(settings)` và hook `onTranslated` hiện có. Các prop nguồn/đọc: `chapterText`, `sourceIdentity`, `bookId`, `names`, `globalNames`, `preload`, `hybridPromptPreview`, `modelsSummary`, `job`.

Không đổi các aria-label/móc test nếu không cần. Khi bắt buộc đổi, cập nhật test và kiểm lại **hành vi**, không chỉ sửa expectation để test xanh.

## 14. Ma trận nghiệm thu tối thiểu

1. Mở/đóng/Escape/trả focus; body cuộn còn header/footer thấy được; không tràn ngang ở360px và869px; viewport thấp vẫn lưu được.
2. Trạng thái current/prewarm đúng; idle/offline/loading/ready/error/cooldown/stop; nút chỉ xuất hiện khi handler tồn tại.
3. Bản ưu tiên và model thực tế khác nhau vẫn hiện đúng; model từng nửa không bị thay bằng setting.
4. Chọn profile đúng scope, giữ ID cũ; lỗi tải settings không ghi đè; bản nháp và phản hồi muộn không áp nhầm truyện.
5. Hybrid bật/tắt, model Lite nửa sau, editor/alias/validation/restores/insert/expand/8.000ký tự vẫn đủ.
6. Sửa nửa sau rồi Lưu và tiếp tục: first được dùng lại; Save-only không khởi động lại; targetnext không làm lại current.
7. Local trial: chạy/hủy/lỗi/kết quả/token/copy/TXT/xóa; không ghi source/cache/mốc AI; đóng bảng không dừng nhầm dịch chương.
8. Key đóng không poll; mở mới tải; đóng/ẩn dừng; thêm/xóa/xóa draft/phản hồi lỗi/keymask vẫn đúng, không có key trong log/bundle.
9. Convert giữ vị trí khi prewarm; chuyển chương dùng lại tác vụ; stop và kết quả muộn không tạo trạng thái hoàn tất giả.
10. EPUB giữ ID/layout; bản dở không đổi mốc AI; bản hoàn tất kể cảprewarm có cập nhật mốc qua engine cũ.

Spec tham chiếu: `e2e/ai-retry-ux.spec.ts`, `e2e/ai-retry-ux-review.spec.ts`, `e2e/ai-hybrid.spec.ts`, `e2e/ai-hybrid-save-independent-review.spec.ts`, `e2e/epub-ai-hybrid-pair.spec.ts`, `e2e/ai-prewarm-recovery.spec.ts`, `e2e/convert-ai-next.spec.ts`, `e2e/ai-reading-progress.spec.ts`, `e2e/ai-source-copy.spec.ts`, `e2e/prompt-list.spec.ts`. Chọn test theo phần logic bị chạm, không tự audit/refactor toàn sản phẩm. Nếu chỉ CSS/copy/presentation thì build và smoke đúng luồng theo AGENTS; nếu chạm persistence/atomicity/migration/secret phải mở quy trình kiểm rủi ro tương ứng.

**Sản phẩm bàn giao cần có:** UI mới hoạt động trên engine cũ; bảng ánh xạ chức năng; danh sách tệp đã đổi; kiểm thử đúng phạm vi; ghi rõ phần chưa kiểm. UI đẹp nhưng thiếu chạy thử, key management, template nửa sau, save semantics hoặc retry đúng target là chưa đạt.
