# Dịch hai nửa với toàn bộ bản đầu làm mẫu

14/10/2026. Thực hiện AI-HYBRID-HALVES-PLAN.md. Chế độ riêng, mặc định tắt; Lite đề xuất 3.1, có thể chọn 3.5. Nửa đầu dùng model ưu tiên/fallback chất lượng; mỗi nửa pin một model, các child recovery giữ pin. Nửa đầu lỗi không mở Lite. Chương ≤1.800 ký tự dùng model ưu tiên một giai đoạn và vẫn nhận quy ước xưng hô.

## Pilot trên chương người dùng chọn

Chương 018, nguồn 2.771 ký tự, chia 1.371/1.400. Mẫu cố định TOÀN bộ bản dịch nửa đầu do 3.7 Flash thực sự trả trong retest trước; không gọi AI mới để tạo mẫu. Nửa sau 1.400 ký tự thử 15 lượt, không fallback/retry tự động, tối đa 2 request qua pool hiện có. Cùng Name/prompt nền/nhiệt độ 0; khác biến có/không mẫu. Lượt 2 đảo thứ tự điều kiện. Chỉ đọc fixture đã lấy từ truyện được chọn, không sửa nguồn/Name/settings/cloud.

| Model / điều kiện | Hoàn tất HTTP+STOP | Không Hán tự sót | Thời gian trung bình lượt thành công | Input token |
|---|---:|---:|---:|---:|
| 3.1 Flash-Lite, không mẫu | 2/3 (66,7%) | 0/3 | 7,63 giây | 1.513 |
| 3.1 Flash-Lite, toàn mẫu | 3/3 (100%) | 3/3 | 8,51 giây | 3.179 |
| 3.5 Flash-Lite, không mẫu | 3/3 (100%) | 1/3 | 6,52 giây | 1.513 |
| 3.5 Flash-Lite, toàn mẫu | 3/3 (100%) | 1/3 | 6,20 giây | 3.179 |
| 2.5 Flash, không mẫu, mốc | 3/3 (100%) | 3/3 | 8,15 giây | 1.513 |

“Không Hán tự sót” lấy mẫu số tất cả lượt, không tương đương đúng nghĩa/đủ ý. Một lỗi 502 ở 3.1 không mẫu không chứng minh mẫu làm gateway tin cậy hơn. Ba lượt 3.1 có mẫu cho output cùng SHA; hai lượt không mẫu thành công cũng cùng SHA; mốc 2.5 ba lượt giống nhau. Đây là một nguồn và ít output khác biệt, không phải 3 chương độc lập, không đo hiệu ứng dài hạn hoặc tỷ lệ bảo đảm.

Đối chiếu phần đã đọc: 3.1 có mẫu hết `估计` còn sót ở hai bản control; tên quả từ “Quả Côn Trùng” đổi sang “Phú Trùng Quả”, gần tên mẫu hơn. Main story vẫn đi từ Ekans bị trói/cắn, bỏ chiến lợi phẩm để tránh mất thứ quan trọng, suy ra thứ thu hút hệ Bọ, dọn đường rút, đến khu Pokemon đối đầu và nhận ra hai quả. Thành ngữ ưu tiên cái lớn được dịch đúng ở điều kiện có mẫu và control thành công. Vẫn có cách gọi hệ Côn trùng trong khi mẫu dùng hệ Bọ, nên mẫu không bảo đảm mọi thuật ngữ nhất quán. 3.5 có mẫu lượt 1 còn `退/涩/群`, lượt 3 còn `涩/群`; lượt 2 sạch Hán nhưng có câu “cắn một ngượng”. Một số bản dùng câu sát chữ. Mốc 2.5 sạch Hán nhưng có “Pinsir (Pinsir)” và tên quả khác mẫu. Không lấy token/STOP làm chấm điểm nghĩa.

Kết luận giới hạn: chọn 3.1 Lite làm lựa chọn đề xuất trong chế độ thử vì bản có mẫu sạch hơn trong nguồn này; chưa tuyên bố chất lượng ngang model mạnh hoặc luôn nhanh hơn dịch song song. Toàn mẫu làm input tăng từ 1.513 lên 3.179 token. Pilot đo riêng nửa sau, mẫu được tái dùng; không cộng thời gian retest cũ thành latency cả pipeline.

Bằng chứng: `.dsh-tmp/ai-hybrid/pilot.json`, `sample.txt`, `source-second.txt`, output từng điều kiện/lượt, `.dsh-tmp/ai-hybrid-pilot.log`; harness `scripts/benchmark-ai-hybrid.ts`. SHA nguồn/mẫu và provenance trong JSON; không key hoặc request body provider trong log.

## Hợp đồng và bảo toàn

- `continuation:{version:1,sample,rules}` là dữ liệu runtime, không lưu trong template. Mẫu quote JSON và ghép SAU khi render template một lượt, giữ literal `{{text}}`/`{name}` trong dữ liệu. Quy ước nửa đầu dùng `addressingRules`, cũng ghép sau render. User template riêng vẫn giữ; đúng một `{{text}}` trong chế độ hybrid. Preview dùng cùng quy tắc alias với server.
- Mẫu tối đa 96.000 ký tự, rules 2.000; giữ tổng request256KiB và rendered128.000. Client/server đều kiểm; quá giới hạn báo chọn chế độ thường, không cắt mẫu. EPUB hybrid không âm thầm cắt custom system prompt. Lite3.5 chỉ gọi ID thực khi continuation hợp lệ; request legacy không continuation vẫn normalize như trước. Không dùng benchmarkModel trong sản phẩm hybrid.
- Cache stage gắn nguyên nguồn/revision/Name/settings/policy, split plan và SHA256 toàn mẫu cho stage2; checkpoint children và pin giữ nguyên. Reload dùng phần đã lưu; toàn chương chỉ lưu khi hai nửa hoàn chỉnh, metadata `model:hybrid` cùng hai model thực tế và sampleHash. Validator giữ metadata, không gán toàn chương cho model cuối.
- Outer chapter budget bao cả hai stage và mọi HTTP/retry; inner jobs không gia hạn budget ngoài. Key lease/rotation/cooldown/concurrency hiện có giữ; không thêm provider/key/billing tier.
- EPUB chia theo pieces/node, mẫu là bản dịch đọc được; nửa sau vẫn yêu cầu đúng JSON ID đích. Ghép về nodes gốc, không thêm newline khi hai pieces cùng một node; DOM/styles/ảnh không thay. Parent source guard dùng toàn nguồn gốc cho durable cache.
- UI hiện Nửa1/2 hoặc Nửa2/2, mẫu/prompt thực của lượt gần nhất, model từng nửa lưu trong panel. Notice tự ẩn5giây. Convert→AI vẫn giữ Convert và prewarm chương sau theo settings đã lưu; TTS chỉ nhận đủ bản dịch theo guard hiện có.

## Nghiệm thu

Fullsuite **113 file/1.503 PASS**, build PASS. Reviewer độc lập cấu hình gpt-6.1-sol/high: **199 regression PASS**, không còn finding. **44 ca E2E riêng biệt PASS** desktop + android-layout (35 lượt đầu, 9 ca fail được kiểm lại sau sửa fixture/giảm concurrency). Lượt đầu 4 navigation timeout lúc browser khởi động, fixture reload thiếu bấm Dịch AI theo hành vi hiện tại, fixture Convert dùng chữ lặp bị bộ lọc loại; sửa fixture để kiểm đúng hành vi, không sửa sản phẩm né lỗi. Traces giữ tại `.dsh-tmp/ai-hybrid/failures/e2e-first/`. Bài root full đầu có browser hook/test timeout; lượt4workers còn hook đóng browser timeout; full2workers/hook30s PASS. Không tăng test timeout sản phẩm hoặc nâng dependencies để né lỗi.

Review phát hiện và đã sửa: rules bị template substitution, legacy normalize có thể chấp nhận sai model Lite, tổng TXT sau ghép vượt display bound, short chapter bỏ rules/cho chọn Lite làm nửa đầu, preview bỏ alias `{name}`. Các regression reviewer/full bao phủ những lỗi này. Build đầu gặp AccessDenied ở temp Windows; dùng TEMP/TMP riêng `.dsh-tmp/chapter-runtime`, build cuối PASS.

Pages **647458d8/master**, bundle **index-Cs3Vj4Lx.js**; Worker **324e27ae-387b-4c22-9d90-528c788ed8ae**. Production UI smoke PASS: mặc định tắt, lưu chọn3.5Lite, đúng toàn mẫu, hai nhãn model, RAW giữ, tải lại rồi bấm AI không gọi lại mạng; dữ liệu tổng hợp, mockAI, chặn cloud APIs. Fixture smoke đầu có header làm nửa đầu >1.800 và cần hai parts, trong khi mock mong một part; sửa kích thước fixture, giữ fail log, không sửa orchestration. Screenshot `production.png`; smoke này không chứng minh Google latency.

### Luồng cold qua Google thật sau triển khai

Fresh session, không cache/persistence; cap8HTTP và100s trước gửi mới mỗi case; các retry dùng core app hiện hành. Cùng cặp2.5Flash→3.1Lite, nguồn/Name/settings người dùng không ghi lại.

| Nguồn | Toàn pipeline | Đọc được nửa đầu | HTTP gồm retry | Kết quả kỹ thuật |
|---|---:|---:|---:|---|
| Chương người dùng2771 ký tự, TXT |48,29s|25,42s|2|Hoàn chỉnh,0Hán sót|
| Nội dung chương đó trong bố cục EPUB tổng hợp |93,05s|61,07s|5|Hoàn chỉnh/mapping hợp lệ,0Hán sót; phục hồi504 ở nửa đầu và502 ở nửa sau|
| Hội thoại tổng hợp1943 ký tự |16,03s|9,09s|3|Hoàn chỉnh sau502; giữ16Hán ở các nhãn `第N段`|
| Thành ngữ tổng hợp1840 ký tự |11,46s|6,86s|2|Hoàn chỉnh; giữ14Hán ở các nhãn `第N段`|

Cold TXT dùng điểm chia an toàn1.369/1.402, khác1371/1400 của pilot ở whitespace; nối lại nguyên source, không dùng nó như đối chiếu A/B cùng đoạn. Bài hội thoại đầu chỉ1700 ký tự nên là single-stage (11,22s/1HTTP,13Hán ở nhãn); đã giữ riêng rồi tăng lên1943 và kiểm hybrid thực sự, không gộp hai bài thành tỷ lệ. Nội dung EPUB là layout tổng hợp từ nguồn TXT, không gọi là thử tệp EPUB thật người dùng. Hai fixture tổng hợp lặp nội dung có chủ ý để vượt threshold, không phải hai chương truyện độc lập. Chữ Hán ở tiêu đề/nhãn còn sót chứng minh mẫu không bảo đảm dịch sạch mọi phần. Quan sát thành ngữ không đảo ưu tiên cái lớn; cách dịch “Còn núi xanh…” vẫn sát chữ. Không có mốc dịch song song trong cùng thời điểm nên không kết luận hybrid nhanh hơn luồng thường.

Logs/bằng chứng `.dsh-tmp/ai-hybrid/{full-unit-final,build-final,e2e,e2e-fixed,independent-review-final,worker-deploy,pages-deploy,production,cold,cold-dialogue}.log`, `cold.json`, `cold-first.json`, `cold-synthetic-dialogue.json`; output/sourceChars/calls/model thật từng case trong JSON. Android-layout không Android thật. Không dùng các tỷ lệ nhỏ này làm SLA hay bảo đảm nghĩa hoàn hảo.
