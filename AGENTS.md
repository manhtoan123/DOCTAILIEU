# Private Novel Reader — quy tắc hiện hành

## Khởi động nhẹ (quyết định người dùng 11/10/2026)
- Đọc `HANDOFF.md` nếu chưa có trong ngữ cảnh; sau đó chỉ đọc file/đoạn liên quan yêu cầu. Không đọc lại tài liệu đã đọc trong cùng phiên nếu không đổi.
- Không bắt buộc đọc toàn bộ kế hoạch, DECISIONS hoặc HANDOFF-LOG. Dùng `rg -n` tìm chủ đề rồi đọc đoạn cần; kế hoạch hiện hành là chỉ mục, lịch sử ở docs/archive/.
- Sửa nhỏ: đi thẳng tới code, diff và kiểm tra phạm vi. Không tự mở audit toàn sản phẩm, đóng M0, lập kế hoạch dài, refactor ngoài yêu cầu hoặc giải quyết backlog. M0 chỉ cần khi thêm khả năng dung lượng/bulk/kiến trúc mới.
- Output ngắn: tìm bằng rg, đọc theo đoạn, redirect log dài vào file rồi lấy summary/exit; khi fail chỉ lấy lỗi liên quan. Không in toàn dirtytree/diff/log hay polling không đổi. Không đọc thư mục archive trừ khi cần tra lịch sử.
- Nếu yêu cầu có hai cách hiểu làm đổi định danh, cách đếm, dữ liệu lưu hoặc kiến trúc: làm rõ một câu trước khi triển khai phần phụ thuộc; tiếp tục đọc/kiểm tra độc lập trong lúc chờ. Không suy ra hạ tầng mới chỉ từ ví dụ UI hoặc tự mở backlog để giải quyết sự mơ hồ.

## Tham khảo mã mở và ghi nhận tính năng (người dùng chốt 28/10/2026)
- Trước khi triển khai một tính năng hoặc cải tiến, tham khảo GitHub hoặc nguồn mã mở liên quan để lấy ý tưởng; ưu tiên repository chính chủ, tài liệu và mã nguồn thực tế. Đối chiếu với code và ràng buộc hiện có trước khi chọn cách áp dụng; giữ nghiên cứu đúng phạm vi yêu cầu.
- Khi hoàn thành một tính năng, tự cập nhật tài liệu `.md` tương ứng: hành vi đã làm, liên kết nguồn tham khảo, ý tưởng đã áp dụng/điều chỉnh, bằng chứng kiểm tra và giới hạn còn lại; ghi trạng thái deploy nếu có. Dùng tài liệu hiện có khi phù hợp, giữ HANDOFF ngắn và dẫn chi tiết sang tài liệu tính năng/HANDOFF-LOG.
- Nếu không tìm được nguồn phù hợp hoặc không truy cập được, ghi rõ ngắn gọn; không bịa nguồn hoặc coi ví dụ trên GitHub là bằng chứng tính năng đã chạy đúng. Tham khảo không tự cho phép thêm dependency, provider hoặc hạ tầng ngoài phạm vi đã được duyệt.

## Model và agent (người dùng chốt 27/10/2026)

### Điều chỉnh 29/10/2026 theo yêu cầu người dùng
- Các nhiệm vụ trước đây giao Astra High chuyển sang GPT-6.1 Sol High; các nhiệm vụ trước đây giao Sol High chuyển sang GPT-6.1 Sol Medium. Áp dụng cả reviewer độc lập; vẫn giữ yêu cầu độc lập, nghiệm thu và trần agent bên dưới. Ánh xạ theo vai trò cũ, không áp dụng chuyển tiếp hai lần.
- Không tự đổi model chat chính khi runtime chưa xác nhận. Các mức/model khác giữ nguyên.

- Ưu tiên kết quả đúng, bảo toàn chức năng và kiểm chứng được; tối ưu thời gian/usage sau khi đạt chất lượng. Chọn theo nhiệm vụ, độ bất định và hậu quả nếu sai. Model, mức suy nghĩ và số agent là ba lựa chọn độc lập.

| Model | Vai trò ưu tiên | Mức khởi đầu |
| --- | --- | --- |
| GPT-6 Astra (`gpt-6-astra`) | Agent chính mặc định cho yêu cầu hỗn hợp; kiến trúc, lỗi chưa rõ nguyên nhân, quyết định rủi ro cao, giải quyết bằng chứng mâu thuẫn | Medium; High khi rủi ro/độ bất định cao |
| GPT-6.1 Sol (`gpt-6.1-sol`) | Triển khai tính năng, sửa logic trong phạm vi rõ, viết regression và review logic thông thường | Medium; High cho nhiều trạng thái/tương tác phức tạp |
| GPT-6.1 Terra (`gpt-6.1-terra`) | UI theo ảnh, browser/desktop, sửa giao diện có phạm vi rõ, kiểm tra render, hướng dẫn/thông báo kỹ thuật | Medium |
| GPT-6 Luna (`gpt-6-luna`) | Tìm code, thu thập log, trích xuất/tổng hợp và kiểm tra cơ học có tiêu chí rõ; ưu tiên công việc đọc/thu thập | Low |

- Phân vai là ưu tiên vận hành, không phải giới hạn năng lực tuyệt đối. Nhiệm vụ nhỏ, độc lập, có nghiệm thu rõ có thể do một model phù hợp làm trọn; không thêm điều phối/review hình thức. Không đổi phạm vi chỉ vì chạy lâu/ban đêm.
- High khi cần lần theo nhiều trạng thái, edge case, bằng chứng trái nhau hoặc rủi ro đáng kể. XHigh/Max chỉ khi còn câu hỏi suy luận cụ thể sau khi thu đủ bằng chứng; ghi ngắn lý do nâng. Ultra chỉ khi người dùng chọn rõ. Cho phép điều chỉnh model/effort theo các điều kiện này qua cơ chế runtime hỗ trợ.
- Sau hai phương án có kiểm chứng vẫn không tiến triển hoặc vượt phạm vi, agent phụ trả về Astra: điều đã biết, giả thuyết đã loại, bằng chứng còn thiếu, đề xuất tiếp. Nếu chính Astra bế tắc, xét lại giả định và xác định thông tin/quyết định còn thiếu; hỏi cụ thể khi nó quyết định kết quả. Không vá/giao lại cùng việc trên cùng giả định chưa kiểm chứng.
- Lỗi mạng/môi trường/quota/quyền được chẩn đoán riêng, chỉ retry có căn cứ và giới hạn. Chuyển model cần lý do năng lực, khả dụng hoặc lựa chọn người dùng; không âm thầm hạ model cho quyết định rủi ro cao.
- Tách agent khi công việc độc lập, cần kiểm chứng độc lập hoặc giảm thời gian đáng kể mà vẫn giữ chất lượng. Trần **3 agent hoạt động đồng thời gồm agent chính + tối đa 2 agent phụ**; đây là trần, không phải mục tiêu. Tăng trần cần người dùng chốt riêng. Công việc phụ thuộc phải chờ kết quả trước; mỗi vùng sửa code chỉ một chủ sở hữu, không sửa cùng file đồng thời; agent chính tích hợp.
- Giao ngữ cảnh tối thiểu nhưng đủ: mục tiêu, file/phạm vi, hành vi/invariant phải giữ, nghiệm thu, kết quả cần trả; không mặc định fork toàn lịch sử. Agent phụ trả findings/vị trí/bằng chứng/giới hạn, không đổ log thô. Agent chính giải quyết mâu thuẫn và chịu trách nhiệm nghiệm thu.
- Review dữ liệu/auth/secret/migration/backup/restore/cloud-delete/giao thức hậu quả lớn: **Astra High độc lập**. Logic thông thường: thêm **Sol High** review khi nhiều trạng thái/module hoặc rủi ro hồi quy đáng kể. Reviewer không viết phần được review, giữ chế độ đọc, nhận hành vi mong muốn/invariant/diff/bằng chứng test. Độc lập theo người thực hiện, không theo tên model.
- Review phải bao phủ diff cuối. Sửa muộn ảnh hưởng invariant/cách khắc phục finding cần reviewer kiểm lại đúng phần bị ảnh hưởng; ghi phiên bản/phạm vi đã kiểm. Gộp code trước integration cuối; chỉ lặp kiểm tra đã đạt khi thay đổi ảnh hưởng bao phủ hoặc còn nghi vấn.
- AGENTS.md hướng dẫn phân việc; không tự đổi model chat đang chạy. Agent chính giữ model thực tế tới khi runtime xác nhận thay đổi. Chỉ ghi model/effort đã được runtime xác nhận, nếu không thì ghi chưa xác minh. Model phụ không khả dụng: ưu tiên trả việc về Astra đang khả dụng, giữ nghiệm thu và báo model thực tế. Thiếu model/công cụ cần cho việc rủi ro cao: làm phần độc lập và báo điểm thiếu.
- Đánh giá lại bằng nhiệm vụ đại diện/cùng đầu vào và nghiệm thu; khi so effort giữ model cố định. Đo đúng hành vi, hồi quy, vòng sửa, thời gian tới kết quả đã kiểm chứng, usage nếu quan sát được; không lấy một benchmark làm kết luận tổng quát. Ví dụ và diễn giải: `private-novel/docs/MODEL-USAGE-RULES-DRAFT.md` (đã chốt; AGENTS.md là hướng dẫn thực thi).

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
- CSS/copy/UI trình bày không đổi logic dữ liệu: build một lần; kiểm tra luồng/render desktop/mobile liên quan khi đổi giao diện, đủ Trắng/Giấy/Tối và bật/tắt/selected/focus/disabled bị ảnh hưởng khi đổi màu; E2E/smoke đúng luồng nếu cần. Không tạo test chỉ lặp implementation, không full suite/reviewer mặc định.
- Logic nhỏ: targeted unit + build; UI/import/worker chạy E2E đúng spec liên quan. `--repeat-each=3` chỉ ca đã flaky hoặc race/cancellation, không toàn nhóm vô điều kiện.
- Database/import integrity/splitter/backup/restore/auth/secret/cloud-delete/migration: Astra High review độc lập đọc diff cuối + chạy regression; root full `npm.cmd test` + build + E2E liên quan. Review không đủ bằng chứng ghi chưa xác minh.
- Chạy các kiểm tra nặng tuần tự. Test pass chỉ chạy lại khi đổi code ảnh hưởng hoặc có nghi vấn chưa giải quyết; root không lặp toàn bộ targeted của reviewer nếu full integration đã bao phủ.
- Chốt cách hiểu và gom code/regression của reviewer trước lượt full suite. Chạy targeted/typecheck/build theo phạm vi trước; không mở full khi kiểm tra rẻ hơn còn fail hoặc reviewer còn đang sửa test. Sau sửa muộn, chọn kiểm tra theo invariant bị ảnh hưởng; không tự lặp mọi kiểm tra đã pass.
- Với HTTP/Worker/gateway: thêm ca request/response đúng ranh giới runtime bị đổi; mock/unit không thay thế kiểm tra runtime đó. Smoke online vẫn dùng dữ liệu tổng hợp cô lập cloud; không lấy dữ liệu người dùng làm fixture hoặc âm thầm ghi thật để thử.
- Từ private-novel: `npm.cmd test -- tests/<file>.test.ts`; `npm.cmd run build`; `npm.cmd run test:e2e -- e2e/<spec>.spec.ts --workers=4 --reporter=line`.
- Dùng npm test, npm run test:watch hoặc npm run test:e2e để mỗi lượt có thư mục tạm riêng, được dọn khi runner kết thúc. Trên Windows dùng đường dẫn ngắn dưới .dsh-tmp/t. Xem cách xử lý lượt bị tắt cưỡng bức trong private-novel/scripts/README.md.
- Giữ log fail; known bugs dùng it.fails với invariant đúng, unexpected pass cần review trước bỏ fails. Phân biệt automated/layout với Android thật; build không phải deploy. Deploy khi được yêu cầu/đã được phép, smoke bằng dữ liệu tổng hợp cô lập cloud.
- Chỉ báo hoàn thành khi có bằng chứng theo nghiệm thu; phân biệt unit/build/runtime/ảnh/deploy và ghi rõ giới hạn như Android mô phỏng, AI upstream giả lập hoặc chưa xác minh dữ liệu thật.

## Bàn giao
- HANDOFF chỉ trạng thái hiện hành, tối đa khoảng 3.500 ký tự; không nhét lịch sử test/triển khai lặp lại. Bỏ mục đã xong khỏi backlog.
- HANDOFF-LOG append-only: một entry ngắn giờ/AI hoặc model đã xác minh/phạm vi-file/lý do/invariant/lệnh-exit-summary/review/giới hạn/nextID; dẫn log thay vì chép output. Không chuỗi suy luận nội bộ.
- DECISIONS append khi đổi quyết định kỹ thuật/quy trình. Không đọc log cũ để chỉ append entry mới.
- Quy tắc nhẹ này supersede workflow nặng trước 11/10/2026, giữ nguyên ràng buộc dữ liệu/secrets và chỉ đạo trực tiếp người dùng.
- Mục Model và agent ngày 27/10/2026 thay các chỉ dẫn trước đó về phân model, effort, số agent và reviewer; các ràng buộc dữ liệu/secrets/quyền công cụ tiếp tục có hiệu lực.
