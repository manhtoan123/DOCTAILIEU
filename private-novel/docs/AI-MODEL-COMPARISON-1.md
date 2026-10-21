# So sánh dịch chương 018 — Gemini và Gemma

14/10/2026. Mẫu do người dùng chọn: Thế giới pokemon tầng dưới chót nhà huấn luyện, chương `第018章 赋虫果`, book `0fef4fb3-7517-4b2c-94b8-5e02dee09a2c`, chapter `b2acac31-b05d-4e92-92d6-3aff345165ac`.

## Cách đo

Nguồn lấy read-only từ snapshot cloud của đúng truyện, đối chiếu chương đang mở; **2.771 ký tự**, hai phần **1.371/1.400**, context tối đa300. Name riêng lấy bản đồng bộ mới qua `/api/state?book=…`, lọc caption và chỉ giữ **15 Name khớp nguồn**, gồm cả khóa chồng lấn. Snapshot sách cũ chỉ có một Name, vì vậy không dùng riêng snapshot đó làm từ điển bài thử. Không đọc key, không sửa/ghi cloud, không thay truyện hoặc cài đặt của người dùng.

14 model (9 model trong picker +5 ID chỉ dùng API so sánh), hai lượt/model; lượt1 theo danh sách, lượt2 đảo thứ tự. Mỗi lượt session/cache trống, temperature0, prompt chuẩn `AI_DEFAULTS` giống nhau; **không phải prompt tùy chỉnh hiện đang lưu của truyện**. Tắt fallback để không gán bản dịch model khác cho model được đo. Dùng splitter/hoàn thiện/recovery của app, cùng key pool/gateway sản phẩm: tối đa6 HTTP mỗi lượt, không cấp HTTP mới sau100giây; HTTP đang chạy còn timeout40s/máy chủ30s, budget app vẫn áp dụng. Quota/cooldown pool giữ nguyên giữa lượt, nên lượt sau có thể thất bại ngay khi pool còn chờ. Đây là quan sát sản phẩm tại một thời điểm, không phải đo model trực tiếp trong môi trường quota riêng.

Model ngoài picker: `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-4-argon`. Trường `benchmarkModel` chỉ nhận đúng5 ID này; giữ endpoint Google cố định, prompt/output bounds, key rotation/lease/secret policy. Không thay picker hay cách đọc model legacy trong prompt đã lưu. Danh sách tham khảo chính thức: [Gemini models](https://ai.google.dev/gemini-api/docs/models.md), [Gemma trên Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api). Công bố model không chứng minh key/gateway hiện tại gọi được.

**Tỷ lệ trả chương** = số lượt hoàn tất mọi phần STOP / số lượt đã thử; vẫn có thể sai nghĩa hoặc sót Hán tự. **Không còn Hán tự** là chỉ số riêng, không phải tỷ lệ dịch đúng. Thời gian đủ chương/đoạn đầu chỉ tính lượt hoàn tất; không lấy thời gian lỗi nhanh làm tốc độ dịch. Hai mẫu không đủ ước lượng độ tin cậy toàn sản phẩm, không chốt SLA/99% hay xếp hạng phổ quát.

Đồng hồ CLI chạy cùng core của app: từ bắt đầu session đến ghép đủ kết quả, gồm mạng/key pool/recovery. Không tính tải sách/Name ban đầu, ghi IndexedDB hoặc vẽ chữ trên trình duyệt; không phải riêng thời gian tính toán của Google. Mỗi lần trả kết quả phải khớp ID model thật và STOP trước khi benchmark adapter chuyển ID nội bộ cho core (để model chỉ so sánh không bị legacy normalizer đổi sang mặc định).

## Đánh giá nội dung

Đối chiếu nguồn theo12 nhóm ý: động cơ mạo hiểm và đường lui; Rattata/Ekans; Uy Hiếp; nhả tơ vào mắt; lưới điện/khống chế; lựa chọn Bug Bite/yếu huyệt; nhả tơ/cắn lần nữa; bỏ qua chiến lợi phẩm để ưu tiên mục tiêu; suy luận hệ Côn trùng; Zubat/Mankey và đường về; các nhóm Pokemon/canh giữ; hai quả xanh, nguyên liệu khối năng lượng và nguy cơ. Kiểm thêm Name, thuật ngữ chiêu thức, xưng hô hai phần, thêm/bỏ nội dung và văn phong. Nhận xét là đánh giá của Codex, chưa có bản chuẩn hay biên tập viên độc lập chấm mù; không chuyển thành “% chính xác”.

Đã đối chiếu cả hai bản hoàn tất của mỗi model; chi tiết lượt1 và khác biệt lượt2:

- **Gemini 2.5 Flash:** giữ mạch chuyện, Name và chiêu Cắn Côn Trùng; câu khá dễ đọc, không còn Hán tự. Còn lối nói sát chữ như “vị chát xanh”, “vị trí bảy tấc”, lặp “anh ấy”. Tốt nhất về cân bằng nội dung trong các bản đã đối chiếu lượt1.
- **Gemini 3 Flash Preview:** giữ nội dung và Cắn Trùng, chuyển thành ngữ “tham bát bỏ mâm” phù hợp. Xưng “anh”→“hắn”, hệ “Côn trùng”→“Bọ” giữa các phần; có câu sát cú pháp nguồn như “đối với sát thương của Ekans”. Khá, cần chuẩn hóa thuật ngữ/xưng hô.
- **Gemini 3.1 Flash-Lite:** nhanh và giữ phần lớn ý/Name; còn `估计`, tiêu đề “Phụ Trùng” nhưng cuối chương “Phú Trùng”; dịch `虫咬` thành “Cắn”, làm mất tên Bug Bite và có thể nhầm với chiêu Bite. Chưa đạt bản sạch để dùng ngay trong lượt1.
- **Gemini 3.5 Flash-Lite (ngoài picker):** nhanh, không còn Hán tự, nhưng lượt1 đảo ý “không thể vì cái nhỏ bỏ cái lớn” thành “không thể bỏ hạt mè nhặt dưa hấu”; giảm tên rừng thành rừng rậm; lỗi “è lưỡi”, thêm tên Anh/pinyin không có trong nguồn và Tơ Giăng/Thả Tơ không nhất quán. Không ưu tiên chỉ vì nhanh.
- Model không hoàn tất: **không chấm chất lượng**, không tự kết luận dịch kém. Ghi mã/status lỗi của gateway; 429 là quota,504 là timeout,404 `ai_invalid_model` là ID không khả dụng qua đường gọi hiện tại,502 `upstream_http` là upstream từ chối nhưng chưa biết nguyên nhân sâu hơn từ body đã lược bỏ.

Lượt2: 3.5 Flash-Lite dịch đúng lại thành ngữ đã đảo ý ở lượt1, nhưng vẫn bỏ tên riêng rừng, Tơ Giăng/Thả Tơ không nhất quán và lỗi “tốig ưu hóa”; chất lượng biến động nên chưa chọn làm mặc định. 3.1 Flash-Lite vẫn còn `估计` và “Cắn” ở cả hai lượt. 2.5 Flash giữ12 nhóm ý và Bug Bite; lượt2 gom nhiều đoạn, tiêu đề “Phụ Trùng” nhưng cuối chương “Phú Côn trùng”. 3 Flash Preview giữ12 nhóm ý, thành ngữ và tên quả ổn hơn; vẫn hệ Côn Trùng→Bọ/câu sát chữ. Các bản còn hoàn chỉnh không mất đoạn nội dung chính phát hiện được khi đối chiếu, nhưng không xem đó là chứng minh không có bất kỳ lỗi dịch nào.

Đề xuất theo mẫu này: ưu tiên **2.5 Flash hoặc3 Flash Preview** nếu cần chất lượng đọc; tốc độ hai model gần như ngang nhau trong hai mẫu. **3.5 Flash-Lite** chỉ là ứng viên chế độ nhanh cần siết prompt và kiểm nghĩa thêm; **3.1 Flash-Lite** cần xử lý Hán tự sót và khóa Name cho chiêu thức. Thêm thuật ngữ `虫咬`, `吐丝`, `电网`, `赋虫果` và một quy ước xưng hô vào Name/prompt có thể giảm biến động, nhưng chưa thử nên không bảo đảm khắc phục mọi lỗi. Không tự thay model/settings/Names của truyện.

Đối chiếu UI Raw và nguồn cloud sau bỏ whitespace: cùng2476ký tự/FNV32 `1477852502`; SHA256 nguồn snapshot nằm trong results.json. Không nói hashDOM này là kiểm chứng bytes/SHA gốc của toàn sách.

## Thông báo model

Đã bỏ toast thành công lặp “Chương sau: bản AI đã sẵn sàng”. Hiện `Bản dịch: <model>` hoặc `Chương sau: <model>` trong **5giây**, dùng model thực sự trả bản hoàn chỉnh kể cả fallback/cache, rồi tự ẩn; badge/prewarm, cảnh báo lỗi, nút dừng/thử lại giữ nguyên. Không đổi Convert/vị trí đọc/cài đặt.

Nghiệm thu: targeted server **138 PASS**, review độc lập gpt-6.1-sol/high **20 PASS**, build PASS; E2E Convert/prewarm **20/20 PASS** desktop+android-layout (gồm notice tự ẩn và không gửi lại). Worker **559edb8b-e9a6-469b-9302-a2755b5cd30b**, Pages **a259beb4/master**, bundle **index-C6DdpCzM.js**. Production mock resume/fullcache/RAW/model-notice-auto-hide PASS. Type fixture sửa assertion không giao nhau sau buildfail; smoke fixture tách notice5giây khỏi trạng thái loading thay vì đợi count0 đúng5giây, logfail giữ. Không đổi dependencies/config/date/tier/keys. Android-layout không phải máy Android thật.

Bằng chứng local: `.dsh-tmp/model-benchmark/results.json`, `fixture.json`, output từng model/lượt `.txt`, `run.log`, `server-test.log`, `build-fixed.log`, `notice-e2e.log`, `worker-deploy.log`, `pages-deploy.log`, `pages-smoke-fixed.log`; review `.dsh-tmp/ai-speed/review-benchmark.log`. Hai lượt chạy đầu để sửa harness (constructor nhầm, Name snapshot cũ; kiểm tra không có HTTP AI ở lỗi constructor) và chẩn đoán upstream nằm ở `harness-constructor-failed.*`, `rejection-diagnostic.*`, không tính vào mẫu so sánh chính.

<!-- MODEL-SUMMARY -->
## Số liệu hai lượt đã hoàn tất

**28 lượt / 14 model / 101 HTTP proxy** (gồm retry; một HTTP proxy có thể xoay nhiều key theo policy hiện có). 8 lượt trả đủ mọi phần; 6 lượt đồng thời không còn Hán tự. Không lấy tỷ lệ gộp của tập nhiều model lỗi làm tỷ lệ thành công chung của app.

Dấu ★: model ngoài picker. Giây TB chỉ tính lượt hoàn tất. Không chấm chất lượng model không trả được chương.

| Model | Trả đủ chương | Không còn Hán tự | Đủ chương lượt1 / lượt2 (s) | TB (s) | Phần đầu lượt1 / lượt2 (s) | HTTP quan sát |
|---|---:|---:|---:|---:|---:|---|
| gemini-3.5-flash | 0/2 (0%) | 0/2 | — | — | — | 502 |
| gemini-3.7-flash | 0/2 (0%) | 0/2 | — | — | — | 502, 504 |
| gemini-3.8-flash | 0/2 (0%) | 0/2 | — | — | — | 502, 504 |
| gemini-3.1-flash-lite | 2/2 (100%) | 0/2 | 13.64 / 14.83 | 14.23 | 6.78 / 8.93 | 200, 502 |
| gemini-3.1-pro-preview | 0/2 (0%) | 0/2 | — | — | — | 429 |
| gemini-3-flash-preview | 2/2 (100%) | 2/2 | 44.55 / 43.16 | 43.85 | 20.96 / 19.85 | 200 |
| gemini-2.5-flash | 2/2 (100%) | 2/2 | 50.71 / 37.74 | 44.23 | 26.75 / 16.10 | 200 |
| gemma-4-26b-a4b-it | 0/2 (0%) | 0/2 | — | — | — | 504, 502 |
| gemma-4-31b-it | 0/2 (0%) | 0/2 | — | — | — | 502 |
| gemini-2.5-pro ★ | 0/2 (0%) | 0/2 | — | — | — | 404 |
| gemini-2.5-flash-lite ★ | 0/2 (0%) | 0/2 | — | — | — | 404 |
| gemini-3.6-flash ★ | 0/2 (0%) | 0/2 | — | — | — | 502 |
| gemini-3.5-flash-lite ★ | 2/2 (100%) | 2/2 | 12.00 / 12.35 | 12.18 | 5.55 / 5.84 | 200 |
| gemini-4-argon ★ | 0/2 (0%) | 0/2 | — | — | — | 429 |
<!-- MODEL-SUMMARY-END -->
## Retest song song 14/10/2026 16:15 +07

Theo yêu cầu thử lại5model và nhiều key cùng lúc: hai batch, mỗi batch2lượt/model trên **phần đầu1.371ký tự**, cùng nguồn/Name15/prompt chuẩn đã đóng băng, temperature0/noFallback. Tổng **20HTTP**, tối đa **2request cùng lúc**, không retry tự động; chọn/xoay key qua lease hiện có, không ép key hoặc xóa cooldown. Không ghi cloud/DB/cache truyện, không đổi code sản phẩm/config/key.

| Model | Thành công phần đầu /4lượt | Thời gian lượt thành công | Lỗi quan sát |
|---|---:|---:|---|
| Gemini3.5Flash | 0/4 (0%) | — | Proxy502; log gốc Google503 |
| Gemini3.6Flash (API-only) | 0/4 (0%) | — | Proxy502; log gốc Google503 |
| Gemini3.7Flash | **1/4 (25%)** | **19,701giây/keyk1** | Các lượt khác503→502 hoặc timeout504 |
| Gemini3.8Flash | 0/4 (0%) | — | Google503→502 hoặc timeout504 |
| Gemma4 26B A4B | 0/4 (0%) | — | Google500→502 hoặc timeout504 |

Các mã Google lấy từ10event tương ứng job thử ở batch2, qua `wrangler tail` lọc headerrunUUID, chỉ lưu job/timestamp/outcome/upstream status; không lưu nội dung, IP/headers/key. Batch1 subscription dùng thiếu config Worker nên không lấy được event; đã giữ kết quả riêng và chạy batch2 với config đúng. Lượt200ký tự Gemini3.5 bổ sung cũng502, logGoogle503; không tính vào20lượt phần đầu hoặc thống kê chất lượng.

**Tiếp tục phần thiếu Gemini3.7:** hai request song song cho phần hai1.400ký tự/context300; một502 sau3,195s, một**200/STOP sau20,061s/keyk2**. Ghép phần1keyk1 và phần2keyk2 thành **cả chương2.771ký tự**, không còn Hán tự. Hai số19,701/20,061s là thời gian riêng từng request thành công, **không phải một lần đo39,762s cho cả chương từ cachetrống**: giữa chúng có thời gian kiểm tra/ngắt. Tỷ lệ25% ở bảng là phần đầu, không phải tỷ lệ hoàn tất toàn chương. Không cộng các trial phần đầu/phần hai khác nguồn thành một% chung.

Đối chiếu hai phần đã ghép: giữ mạch chuyện/Name/nội dung chính; còn thuật ngữ Uy Hách/hệBọ và thành ngữ “Thừa nước đục thả câu” chưa thật sát sắc thái câu “thừa lúc nó bệnh lấy mạng”. Không còn Hán tự không đồng nghĩa hoàn hảo. Kết quả thay đổi so với lượt trước: **Gemini3.7 có thể dịch, nhưng chưa ổn định**. Chưa thể nói các model còn lại không có khả năng dịch; hiện chỉ quan sát lỗi phíaGoogle/timeout. Lỗi không trả nhãnkey nên không đếm được tất cả key duy nhất; đã xác nhận hai keykhác nhau k1/k2 ở hai phần thành công, không tuyên bố đã thử toàn bộ19key.

Bằng chứng `.dsh-tmp/model-retest/results-first.json`, `results.json` (10event lọc), `short-diagnostic.json`, `part-two.json`, `gemini-3.7-flash-complete-2.txt`; log `.dsh-tmp/model-benchmark/retest-first.log`, `retest.log`, `part-two.log`; harness `scripts/retest-ai-models-parallel.ts`, `scripts/retest-ai-part-two.ts`. Esbuild và các harness exit0; chỉ script/test thực, không npmtest/build/deploy lại vì không sửa sản phẩm. Tail đã đóng. [Wrangler tail](https://developers.cloudflare.com/workers/wrangler/commands/workers/#tail).

