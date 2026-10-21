# AI KEY POOL + ĐỔI ALLOWLIST MODEL — kế hoạch bàn giao (CHƯA TRIỂN KHAI)

Ngày soạn: 10/10/2026 10:31 ICT. Người soạn: deepseek-flash (DSH), medium. Mọi mục "đề xuất" dưới đây phải được AI kế tiếp tự kiểm chứng lại bằng code/test thực trước khi tin.

**Trạng thái 10/10/2026 12:20 — ĐÃ DEPLOY:** Phase 1 (allowlist model + legacy map + key pool/xoay key) và **Phase 2 (kho key D1 + API `/api/ai/keys` + UI thêm/xoá key trong ⚙AI, KHÔNG dùng token theo quyết định người dùng)** đã code, test và **phát hành production**: 19 key Gemini nạp qua `wrangler secret put GEMINI_API_KEYS` (stdin, không lưu file), migration `0006_ai_keys.sql` đã áp remote, Worker `thu-phong-ai` + Pages đã deploy, smoke thật xanh. Chi tiết: §15 (code + sửa review), §17 (Phase 2 + deploy + bằng chứng). Ghi chú người dùng: chương không dài quá 32k nên bỏ lo phần giới hạn đó (§16.2 điểm 3 đã hạ ưu tiên); 2 job độc lập (chương hiện tại + chương kế) chạy song song trên 2 key khác nhau là **có chủ đích**, không đua nhiều key cho cùng một request.

Mục đích: người dùng muốn (1) nhập **nhiều API key Gemini**, (2) **xoay key ngay khi gặp 429**, (3) **key đồng bộ trên mọi thiết bị**, (4) đổi allowlist model: xóa `gemini-3.5-flash-lite`/`gemini-3.6-flash`/`gemini-3.7-flash`, thêm `gemini-2.5-flash`, mặc định mới `gemini-3.5-flash`, (5) bỏ ràng buộc cũ "không xoay key/đổi model/fan-out", (6) cân nhắc thêm các cải tiến tự phục hồi prewarm đã nêu. Tài liệu này là hợp đồng thi công cho AI kế tiếp.

## 1. Quyết định người dùng đã chốt (10/10/2026, qua hỏi đáp trực tiếp)

| # | Chốt | Ghi chú |
|---|---|---|
| D1 | Keys **đồng bộ trên mọi thiết bị** | Không thoả hiệp bằng key chỉ nằm local từng máy |
| D2 | Xoá ràng buộc "Không xoay key/đổi model/fan-out" **nếu cần**, vẫn dùng nếu hợp lý | Phải ghi DECISIONS thay thế, không xoá lịch sử |
| D3 | Xoay **ngay mọi lỗi 429** sang key kế tiếp | Không phân biệt per-day/per-minute ở bước xoay |
| D4 | **Không** đặt hạn mức tự chọn mỗi key | Chỉ xoay khi Google báo; vẫn nên hiển thị số 429/trạng thái |
| D5 | Mặc định mới `gemini-3.5-flash` | Không dùng 3.5 Flash-Lite làm mặc định nữa |
| D6 | **Chưa sửa code vội**, làm hướng dẫn trước để bàn giao AI khác | Tài liệu này là sản phẩm của phiên |
| D7 | Đánh giá các cải tiến tự phục hồi đã nêu và **thêm vào kế hoạch** nếu hợp lý | Xem §10 |

## 2. Supersede quyết định cũ — các chỗ PHẢI sửa khi triển khai

Các câu "không xoay key" dưới đây trở thành lịch sử; khi code đổi phải sửa lại cho khớp thực tế (không xoá lịch sử trong HANDOFF-LOG):

- `HANDOFF.md:9` ("Không xoay key/đổi model/fan-out"), `HANDOFF.md:38` ("không xoay key để né 429").
- `NEXT-AI-PROMPT.md:15`, `NEXT-AI-PROMPT.md:28`.
- `private-novel/docs/DECISIONS.md:356, 441, 451, 456`.
- `private-novel/docs/AI-DEPLOY-GUIDE.md:3, 5, 6, 7`.
- `private-novel/docs/AI-READING-PRELOAD.md:16, 22`.
- `private-novel/docs/AI-TTS-RECOVERY-PLAN.md:12, 40, 43`.
- `private-novel/docs/AI-TRANSLATION-PLAN.md:13` (đã có ý tưởng "Keyring theo project/provider/model eligibility" — tham chiếu, không copy).
- `WEB-READER-IMPLEMENTATION-PLAN.md:15` ("không copy userscript/key rotation") — chỉ supersede phần key rotation, giữ phần không copy userscript.

Ràng buộc **giữ nguyên** (không supersede): secret không vào VITE/bundle/URL/Git/log/backup; không copy mã người khác; D:\linh tinh\tm chỉ đọc; không nâng paid tier; không tự import corpus; không đọc/xoá truyện thật để test.

## 3. Hiện trạng kỹ thuật (đã đọc mã, dẫn chứng file:line)

| Thành phần | Thực tế hiện nay |
|---|---|
| Client gọi AI | `POST /api/ai/translate`, body JSON `{text,systemPrompt,userPromptTemplate,names,model,temperature}`; **không gửi key** — `private-novel/src/ai-translate.ts:125-150` |
| Phía server | Pages Function → service binding `AI_TRANSLATOR` → Worker `thu-phong-ai`; nếu thiếu binding thì chạy `handleAiTranslate` ngay trong Pages — `private-novel/functions/api/ai/translate.ts:1-3` |
| Key hiện tại | Chỉ `env.GEMINI_API_KEY`, một key duy nhất — `private-novel/server/ai-translate.ts:6, 99-100`; gửi Google bằng header `x-goog-api-key`, không để lộ URL/body — `server/ai-translate.ts:139-144` |
| 429 hiện tại | Worker chuyển 429 + `Retry-After` đã sanitize (chỉ số/HTTP-date, ≤2147483s) — `server/ai-translate.ts:155-163, 201` |
| Client 429 | Chỉ đọc `Retry-After` khi status 429 — `src/ai-translate.ts:147`; `AiRecovery` cooldown theo **model** trong session, auto-wait ≤30s rồi fail-fast — `src/ai-recovery.ts:39-67` |
| Cấu hình Worker AI | `wrangler.ai.jsonc`: chỉ `name/main/account_id/compat/placement gcp:us-east4` — **không có binding D1/KV/R2** |
| Cấu hình Pages | `wrangler.jsonc`: D1 `DB`, R2 `LIBRARY_BUCKET`, service binding `AI_TRANSLATOR`, var `PUBLIC_LIBRARY=1` — **không có KV** |
| Auth hiện tại | `PUBLIC_LIBRARY=1` ⇒ middleware bỏ qua đăng nhập, mọi route thư viện công khai theo URL — `functions/_middleware.ts:3-7`; `server/auth.ts` vẫn còn nguyên (login/session, rate-limit 8 lần/10 phút) nhưng đang bị bypass |
| CSP | `connect-src 'self' https://ottsy.weilbyte.dev` — `server/auth.ts:15` ⇒ **trình duyệt không gọi thẳng Google được**, mọi key phải đi qua Worker |
| Allowlist model | 8 model trong `src/ai-models.ts:7-19`, mặc định `gemini-3.5-flash-lite`; server dùng `isAiModelId` để từ chối model lạ (400 `ai_invalid_model`) — `server/ai-translate.ts:122-123` |
| Nguồn sự thật mặc định | **Bị trùng 2 nơi**: `DEFAULT_AI_MODEL` (`src/ai-models.ts:19`) vs `AI_DEFAULTS.model` literal (`src/ai-reading.ts:5`) |

Hệ quả trực tiếp của D1 (đồng bộ mọi thiết bị) + CSP: **không thể** để key trong localStorage từng máy rồi "đồng bộ" qua thư viện cloud hiện tại, vì thư viện đang công khai (`PUBLIC_LIBRARY=1`) — ai có URL cũng đọc được. Muốn đồng bộ thì key phải nằm **phía máy chủ**.

## 4. Dữ kiện quota Gemini (tra 10/10/2026, có nguồn)

Nguồn chính thức: [Gemini API — Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) (trang ghi cập nhật 2026-10-09 UTC; tôi tải bản pt-BR nên trích nguyên văn tiếng Bồ). Mục nào không có nguồn thì ghi rõ **chưa xác minh**.

- Hạn mức đo theo 3 chiều **RPM / TPM / RPD**; vượt **bất kỳ** chiều nào cũng bị lỗi rate limit.
- **"Os limites de taxa são aplicados por projeto, não por chave de API."** ⇒ Hạn mức áp theo **project**, KHÔNG theo API key. Nhiều key trong cùng project dùng chung một hạn mức; muốn tăng phải khác project.
- **"As cotas de solicitações por dia (RPD) são redefinidas à meia-noite do horário do Pacífico."** ⇒ RPD reset nửa đêm giờ Thái Bình Dương (≈14:00–15:00 giờ VN, lệch theo DST). Đây là mốc để hiển thị "hết lượt hôm nay".
- Bậc sử dụng: **Free / Tier 1 / Tier 2 / Tier 3** (Tier 1 cần gắn billing, hạn mức chi tiêu US$250; Tier 2 US$2.000; Tier 3 US$20.000–100.000+). Có thêm **giới hạn theo chi tiêu trong cửa sổ 10 phút** (Tier1 $10, Tier2 $50, Tier3 $200); vượt cũng trả `429 RESOURCE_EXHAUSTED`.
- Hạn mức **phụ thuộc model** và **không được bảo đảm** ("Os limites de taxa especificados não são garantidos"). Số thực của tài khoản xem ở [AI Studio rate limit](https://aistudio.google.com/rate-limit).
- Danh mục model của Google vẫn có `Gemini 2.5 Flash`, `Gemini 2.5 Flash Lite`, `Gemini 3.5 Flash Lite`, `Gemini 3.6 Flash`, `Gemini 3.8 Flash`… ⇒ id `gemini-2.5-flash` là id thật. Việc xoá 3 model khỏi app là **lựa chọn UI của mình**, không phải Google khai tử model.
- **Chưa xác minh** (AI kế tiếp tự kiểm nếu cần phân loại quota chính xác): cấu trúc body 429 của Google (`error.details[].retryDelay`, `quotaId`/`quotaValue`), việc Google có gửi header `Retry-After` hay không, và điều khoản chính sách cụ thể về dùng nhiều project để tăng hạn mức. Mã hiện tại chỉ tin `Retry-After` dạng số hoặc HTTP-date đã sanitize.
- **Rủi ro chính sách:** dùng nhiều key/project để "nhân" hạn mức miễn phí có thể bị coi là lạm dụng. Phạm vi dự án: chỉ dùng key do chính người dùng cấp, không tự bật billing/paid tier, không đua song song nhiều key cho cùng một chương.

## 5. Kiến trúc đề xuất (2 phase, làm Phase 1 trước)

### Phase 1 — Key pool phía Worker + xoay key (không thêm hạ tầng)

- Nguồn key: secret mới `GEMINI_API_KEYS` = JSON mảng `[{"label":"proj-a","key":"..."}]`, Worker đọc lúc chạy. Giữ `GEMINI_API_KEY` làm fallback tương thích khi chưa cấu hình pool.
- Xoay: ngay khi upstream trả 429, đánh dấu key đó "cooling" rồi thử key kế tiếp **tuần tự**, cùng một request, không chạy song song.
- Trạng thái cooling: `Map` trong bộ nhớ isolate, khoá `${keyId}:${model}` + khoá dự phòng `${keyId}`. Chấp nhận mất khi cold start (ghi rõ giới hạn); nâng lên KV ở Phase 2 nếu cần.
- Đồng bộ mọi thiết bị: tự động, vì key nằm ở Worker — **không cần code client nào**.
- Thêm/xoá key: một lệnh `wrangler secret put` (xem Phụ lục B). Không có UI nhập trong app ở phase này.

### Phase 2 — Nhập key trong app + đồng bộ thật

- Thêm KV namespace (ví dụ `AI_KEYS`) bind cho **cả** Pages (`wrangler.jsonc`) và Worker AI (`wrangler.ai.jsonc`).
- Route quản trị (ví dụ `POST/GET/DELETE /api/ai/keys`) yêu cầu header token `X-AI-Admin` khớp secret `AI_ADMIN_TOKEN`; rate-limit như `server/auth.ts:26-28`; **chỉ trả bản che** (`••••1234`, `label`, trạng thái, số 429, lần dùng cuối) — không bao giờ trả lại key.
- UI trong ⚙AI: mục "API keys" — thêm (ô password + nhãn + nhãn project), danh sách che, nút xoá, nút "Kiểm tra key" (gọi `GET /v1beta/models` phía server để xác nhận key sống), cảnh báo nếu mọi key cùng một project.
- Token admin lưu local mỗi thiết bị một lần (người dùng nhập). **Đây là điểm đánh đổi phải báo rõ**: app đang public nên quản trị key buộc phải có một lớp xác thực riêng; không có nó thì bất kỳ ai có URL đều xoá/thêm được key.

### Phương án bị loại

- **Key trong localStorage rồi "sync" qua thư viện cloud**: thư viện công khai ⇒ lộ key. Loại.
- **Key trong bundle/VITE**: vi phạm ràng buộc tuyệt đối. Loại.
- **Client gọi thẳng Google**: CSP `connect-src` không cho, và lộ key trong tab. Loại.
- **Chạy song song nhiều key cho cùng một chương để đua**: tăng tải, dễ bị coi là lách hạn mức, khó kiểm toán. Không dùng làm mặc định (chỉ tuần tự).

## 6. Hợp đồng mới (đề xuất, phải chốt khi code)

| Thành phần | Quy ước |
|---|---|
| Request client→Worker | Không đổi body; **không** đưa key vào body |
| Response header mới | `X-AI-Key-Label: proj-a` (chỉ nhãn), `X-AI-Rotation: 1` khi đã xoay, `X-AI-Keys-Available: n`, `X-AI-Quota-Scope: day\|minute\|unknown` (best-effort, sanitize) |
| 429 khi hết key | Trả 429 `ai_rate_limited` như hiện tại + `Retry-After` = thời gian chờ **sớm nhất** trong pool; client giữ cooldown hiện có |
| Log server | Chỉ `{keyIndex/label, status}`; tuyệt đối không log key, không log body Google, không log prompt |
| Lỗi key hỏng | Nếu Google trả `API_KEY_INVALID` ⇒ đánh dấu key `invalid` (không xoay vòng lại trong session) rồi thử key kế; nếu hết key ⇒ 503 `ai_auth_error` |

## 7. Thuật toán xoay key (đề xuất chốt)

```
keys = pool đang bật (thứ tự cấu hình)
thử tối đa MỘT vòng qua pool cho mỗi request (không dùng lại key đã thử)
chọn key: bỏ key invalid; bỏ key đang cooling; ưu tiên key lâu chưa dùng (LRU)
gửi Google (x-goog-api-key) — tuần tự, không song song
  - 200 hợp lệ: reset consecutive429 của key; trả kết quả
  - 429: cooling(key, model) = now + (Retry-After hợp lệ ? Retry-After : 60s)
         consecutive429++; nếu ≥3 hoặc Retry-After > 1h ⇒ cooling đến nửa đêm giờ Thái Bình Dương (best-effort)
         nếu còn key chưa thử ⇒ xoay ngay (D3)
  - 401/403/API_KEY_INVALID: key invalid (session) ⇒ xoay
  - 400/5xx khác: theo phân loại hiện có; KHÔNG xoay mù (chỉ 429/401/403 mới xoay)
hết key khả dụng ⇒ 429 + Retry-After sớm nhất
ngân sách: tổng thời gian các lần thử phải nằm trong REQUEST_TIMEOUT_MS 60s hiện có
```

Biên bắt buộc: không quá 1 request Google đang bay tại một thời điểm; không thử lại cùng một key hai lần trong cùng request; không đổi model khi xoay; không tự bật billing.

## 8. Đổi allowlist model (§ yêu cầu 4) — có RỦI RO MIGRATION phải xử lý

Thay đổi: xoá `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash`; thêm `gemini-2.5-flash`; mặc định `gemini-3.5-flash`; giữ `gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`, `gemini-3-flash-preview`.

**Rủi ro đã xác minh bằng đọc mã (chưa chạy test):** `validatePromptSettings` NÉM lỗi khi `model` không còn trong allowlist (`src/prompt-stock.ts:13-17`), và `readStock()` gọi nó cho cả `prompt-stock-v1` lẫn row legacy `ai-book-settings:*` (`src/prompt-stock.ts:31-39`). Nghĩa là: chỉ cần một profile đang lưu model bị xoá, **toàn bộ kho prompt** có thể không đọc được (AiPanel báo "Không mở được kho prompt", không chọn được prompt nào) — mất chức năng dù prompt còn nguyên trong DB. Đường Reader thì an toàn hơn vì `readReadingAiSettings` fallback về mặc định thay vì ném (`src/ai-reading.ts:13-16`).

Cách xử lý tối thiểu đề xuất (chọn 1, phải có test):
- **(A) Legacy map khi ĐỌC (khuyến nghị):** thêm `LEGACY_AI_MODELS` trong `src/ai-models.ts`; `isAiModelId` giữ nguyên nghĩa "id hợp lệ để gửi", thêm hàm `normalizeAiModel(id)` map id legacy → `DEFAULT_AI_MODEL`; `validatePromptSettings`/`readReadingAiSettings` dùng hàm này; **không ghi đè** dữ liệu người dùng (chỉ chuẩn hoá khi đọc/áp dụng). Ưu: không migration phá dữ liệu, tab cũ vẫn chạy.
- **(B) Migration một lần:** khi mở kho prompt, viết lại mọi row có model legacy sang mặc định mới trong transaction. Nhược: ghi đè dữ liệu người dùng, khó rollback, phải test kỹ đa tab.

Dù chọn cách nào, **phải** xử lý cả 2 phía:
- Server: tab đang mở gửi model đã xoá sẽ bị 400 `ai_invalid_model` (`server/ai-translate.ts:122`). Đề xuất map legacy→mặc định mới ở server trong giai đoạn chuyển tiếp để không làm gãy tab cũ, kèm test.
- Gộp nguồn sự thật: `AI_DEFAULTS.model` (`src/ai-reading.ts:5`) nên lấy từ `DEFAULT_AI_MODEL` thay vì literal, tránh lệch lần sau.

Danh sách chỗ chắc chắn phải sửa (audit tự động, còn phải đối chiếu lại khi code):

| Nhóm | File |
|---|---|
| Nguồn allowlist | `src/ai-models.ts`, `src/ai-reading.ts:5` |
| Server | `server/ai-translate.ts` (chỉ nếu map legacy) |
| Unit test | `tests/ai-translate.test.ts:129-135`, `tests/ai-native-runtime.test.ts:7`, `tests/ai-service-binding.test.ts:21` |
| E2E mock trả `model:'gemini-3.5-flash-lite'` (client kiểm tra `result.model===settings.model` ⇒ sẽ fail) | `e2e/ai-reader.spec.ts:9,30,39,59`, `e2e/ai-inline.spec.ts:9`, `e2e/prompt-stock.spec.ts:9,16`, `e2e/prompt-stock-review.spec.ts:8`, `e2e/reader-controls.spec.ts:4`, `e2e/tts-resume.spec.ts:10` |
| Script smoke | `scripts/smoke-ai-production.mjs:5` (gửi model cũ) |
| Tài liệu | `docs/AI-DEPLOY-GUIDE.md:6`, `docs/AI-READING-PRELOAD.md:22`, `docs/AI-TRANSLATION-PLAN.md:30`, `docs/DECISIONS.md:356`, `HANDOFF.md:26`, `NEXT-AI-PROMPT.md:15` |

Cache AI (`ai-reading-cache:v1`, key gồm model — `src/ai-reading-cache.ts:58, 67`) không cần dọn: entry của model đã xoá chỉ trở thành không truy cập được, bị LRU đẩy dần; không gây lỗi. Ghi rõ điều này trong log thay vì viết migration cache.

## 9. UI Phase 2 — mô tả tối thiểu

- Mục "API keys" trong ⚙AI (cùng chỗ với Model/Nhiệt độ, `src/ui/AiPanel.tsx:131-138`).
- Trạng thái mỗi key: nhãn, project, `••••1234`, "đang dùng / chờ 3 phút / hết lượt hôm nay / key không hợp lệ", số lần 429, lần dùng cuối.
- Nút: Thêm, Kiểm tra, Xoá, "Chuyển sang key này" (đặt thủ công thứ tự ưu tiên).
- Cảnh báo đỏ nếu tất cả key cùng một project: "Các key cùng project dùng chung hạn mức; thêm key project khác mới tăng được."
- Không hiển thị, không log, không export key; ô nhập là `type=password`, tự xoá sau khi lưu.

## 10. Đánh giá các cải tiến tự phục hồi (D7)

| # | Cải tiến | Phán quyết | Lý do / điều kiện |
|---|---|---|---|
| 1 | Nghe `online` để tự thử lại khi mạng trở lại | **Nhận — P1** | Hiện `src/` không có chỗ nào dùng `navigator.onLine`; lỗi mạng chỉ nằm im. 1 lần thử lại/job, tôn trọng cooldown, không lặp |
| 2 | Bền hoá cooldown 429 | **Đổi hướng — P1** | Với key pool, trạng thái cooling nên nằm **phía server** (sống qua reload, dùng chung mọi thiết bị). Cooldown client chỉ còn là lớp chặn cuối |
| 3 | Hiện trạng thái phục hồi cho người dùng | **Nhận — P2** | Thêm trạng thái "đang thử lại 2/3", "đang chờ quota ~18s", `data-ai-recovery` cho E2E; không lộ reason thô |
| 4 | Đọc `Retry-After` cho cả 5xx | **Nhận — P2** | Hiện chỉ đọc khi 429 (`src/ai-translate.ts:147`) và Worker chỉ set khi 429 (`server/ai-translate.ts:201`) |
| 5 | Circuit breaker khi 5xx liên tục | **Nhận — P2** | Dùng chung cơ chế cooling: N lỗi 5xx liên tiếp ⇒ nghỉ ngắn 15–30s, tránh đập khi upstream sập |
| 6 | Giới hạn song song theo key/model | **Nhận — P1 (bắt buộc)** | Với xoay key, phải đảm bảo 1 request Google đang bay; nếu không sẽ thành fan-out ngoài ý muốn |
| 7 | Debounce khi nhảy chương nhanh | **Hoãn — P3** | Abort không hoàn quota; nhưng phải đo số call thực tế trước khi thêm độ trễ 250–400ms |
| 8 | Phối hợp nhiều tab | **Giảm ưu tiên — P3** | Server-side cooling giải phần lớn; chỉ còn cooldown client |
| 9 | Smoke real Gemini khẳng định không nhân đôi request | **Nhận — P2** | Smoke prewarm hiện là `aiMocked`; thêm ca 1 chương + assert request==1 sau reload |
| 10 | Kiểm tra key khi thêm | **Nhận — P2 (Phase 2)** | Gọi server kiểm `GET /v1beta/models` để không lưu key gõ sai |
| 11 | Cảnh báo "cùng project" | **Nhận — P2** | Rẻ, tránh hiểu nhầm xoay key là tăng hạn mức |
| 12 | Legacy model map (mục 8) | **BẮT BUỘC — P0** | Nếu không, xoá model có thể làm hỏng toàn bộ kho prompt |
| 13 | Hiển thị "hết lượt hôm nay" chính xác | **Hoãn — P3** | Cần phân loại quotaId; D3 đã chọn xoay ngay nên chưa cần |
| 14 | Tăng prewarm sâu 2 chương | **Loại** | Tăng rủi ro quota, không có yêu cầu người dùng |

## 11. Chia việc — acceptance & test bắt buộc

**T1 (P0) — Model allowlist + legacy map**
Phạm vi: `src/ai-models.ts`, `src/ai-reading.ts`, `server/ai-translate.ts` (chỉ map legacy), test/E2E mock liên quan.
Invariant: (a) mặc định là `gemini-3.5-flash`; (b) dữ liệu đã lưu có model đã xoá **vẫn đọc được, không mất prompt**; (c) tab cũ gửi model đã xoá không bị 400 gây gãy đọc; (d) 8→ danh sách mới đúng yêu cầu.
Test: unit prompt-stock với profile lưu `gemini-3.5-flash-lite` ⇒ đọc OK, model = mặc định mới, prompt giữ nguyên; unit `readReadingAiSettings`; `tests/ai-translate.test.ts` + `ai-native-runtime` + `ai-service-binding` cập nhật; E2E `ai-inline`, `ai-reader`, `prompt-stock*`, `reader-controls`, `tts-resume` repeat3.

**T2 (P1) — Key pool + xoay tuần tự trong Worker**
Phạm vi: `server/ai-translate.ts`, `wrangler.ai.jsonc` (nếu cần binding), `tests/ai-diagnostics.test.ts`/test mới.
Invariant: 429 của key #1 ⇒ request đó được thử tiếp key #2 và trả 200; key bị cooling bị bỏ qua ở request sau; hết key ⇒ 429 + `Retry-After` sớm nhất; key không bao giờ xuất hiện trong response/log/header; chỉ 1 request Google đang bay; không thử lại cùng key trong một request.
Test: unit với fetch giả lập 429/200/401 và marker key giả (assert marker không có trong body/header/log); Miniflare native runtime; test ngân sách thời gian.

**T3 (P1) — Trạng thái cooling + header chẩn đoán**
Invariant: `X-AI-Key-Label`/`X-AI-Rotation`/`X-AI-Keys-Available` chỉ chứa dữ liệu an toàn; client parse allowlist (giống `SERVER_FAILURE_REASONS` hiện có).

**T4 (P2) — Client: auto-retry khi `online` + trạng thái phục hồi UI + `Retry-After` cho 5xx.**
Invariant: tối đa 1 lần auto/job; không phá dedupe promotion; 5xx vẫn transient như hiện tại.

**T5 (P2) — Phase 2: KV + route admin + UI key (cần người dùng chốt trước khi làm).**

**T6 (P2) — Smoke real Gemini**: 1 chương, assert đếm request == 1 sau reload; **không** cố tình tạo 429 thật để tránh đốt quota.

Lệnh bắt buộc sau mỗi lần sửa code (từ `private-novel/`):
```
npm.cmd test                     # TEMP/TMPDIR trỏ ..\.dsh-tmp (workerd không tạo được temp trong AppData)
npm.cmd run build
npm.cmd run test:e2e -- --reporter=line     # ca liên quan thêm --repeat-each=3
```
Rủi ro cao (secret/key/auth trong T2–T5) ⇒ **bắt buộc review độc lập**: reviewer phải đọc diff, chạy targeted test của chính phạm vi, kiểm riêng mất dữ liệu, race/cancellation, tương thích ngược, lộ secret, edge case và test còn thiếu; chưa đủ bằng chứng thì ghi "chưa xác minh".

## 12. Rủi ro & giới hạn phải nói thật

1. **Xoay key KHÔNG tăng hạn mức nếu các key cùng một Google project** — đây là dữ kiện đã ghi trong tài liệu dự án; D3 (xoay ngay mọi 429) sẽ nhanh chóng "đốt" cả pool nếu vậy. Bắt buộc có cảnh báo UI + nhãn project.
2. Xoay ngay mọi 429 có thể vô ích với giới hạn theo phút (RPM/TPM): key kế tiếp cũng có thể 429. Chấp nhận theo D3, nhưng phải giữ cooling để không đập liên tục.
3. Trạng thái cooling trong bộ nhớ isolate (Phase 1) **không bền** qua cold start và có thể không nhất quán giữa các isolate — ghi vào giới hạn, không tuyên bố chính xác tuyệt đối.
4. Phase 2 thêm một lớp xác thực quản trị (token) — trái tinh thần "bỏ PIN/xác nhận phụ" của 08/10; phải để người dùng quyết, và tuyệt đối không mở route ghi key cho khách vãng lai.
5. Chính sách Google về việc lạm dụng nhiều project/key để lách hạn mức — cần đọc kỹ mục §4 trước khi quảng bá tính năng; không hứa "không giới hạn".
6. Key từng dán vào chat/AI khác (ghi trong `AI-TRANSLATION-PLAN.md:13`) nên **coi như đã lộ**; khuyến nghị tạo key mới và thu hồi key cũ trước khi triển khai.
7. Không được để key trong `.dev.vars` bị commit, trong log Wrangler, trong thông báo lỗi, hay trong file export/backup.

## 13. Danh sách "KHÔNG được làm"

- Không đưa key vào VITE_*, bundle, Git, URL, log, `data-*`, thông báo lỗi, hay bản export backup.
- Không fan-out một chương ra nhiều key chạy song song; không thử lại cùng key trong một request.
- Không xoay key khi lỗi không phải 429/401/403 (schema/model/finish_reason/usage vẫn là lỗi vĩnh viễn).
- Không tự bật billing/paid tier; không tự thêm key người dùng chưa nhập; không đọc key từ nguồn ngoài.
- Không sửa/xoá/rename/chạy script trong `D:\linh tinh\tm`; không copy mã userscript.
- Không đánh dấu hoàn thành khi chưa chạy test/build/E2E liên quan và chưa review độc lập phần rủi ro cao.

## 14. Checklist bàn giao cho AI kế tiếp

1. Đọc `AGENTS.md` → `HANDOFF.md` → `WEB-READER-IMPLEMENTATION-PLAN.md` → `DECISIONS.md` → mục cuối `HANDOFF-LOG.md`, rồi tài liệu này.
2. Tự kiểm chứng §3 và §8 bằng code thực (đừng tin tài liệu này).
3. Điền §4 bằng tra cứu mới nhất (URL Google) trước khi chốt thuật toán xoay.
4. Làm T1 trước (P0, rủi ro mất chức năng prompt), rồi T2/T3; T4 sau; T5/T6 khi người dùng chốt.
5. Mỗi lần sửa: chạy đủ lệnh ở §11, cập nhật `HANDOFF.md` (trạng thái hiện hành), append `docs/HANDOFF-LOG.md` (giờ, model, file, lý do, lệnh, exit, fail, review, giới hạn, ID việc tiếp), append `docs/DECISIONS.md` khi đổi kỹ thuật (nhất là supersede mục §2).
6. Báo cáo trung thực: cái gì chạy thật, model nào, test nào đã chạy, còn gì chưa xác minh.

## Phụ lục A — Thao tác cho chủ máy (khi Phase 1 xong)

1. Vào Google AI Studio → tạo API key **cho từng project khác nhau** (đừng tạo nhiều key trong một project rồi mong tăng hạn mức).
2. Đặt pool vào Worker (ví dụ, một lệnh; giữ nguyên định dạng JSON):
   - `npx.cmd wrangler secret put GEMINI_API_KEYS --config wrangler.ai.jsonc`
   - Dán JSON: `[{"label":"proj-a","key":"..."},{"label":"proj-b","key":"..."}]`
3. Deploy lại Worker AI: `npx.cmd wrangler deploy --config wrangler.ai.jsonc`.
4. Kiểm tra: mở Reader → Dịch AI → Chạy thử; xem header `X-AI-Key-Label` trong DevTools nếu cần.
5. Thu hồi key cũ đã từng dán vào chat/AI khác.

## Phụ lục B — Câu hỏi cần người dùng chốt trước Phase 2

1. Có chấp nhận một **token quản trị** (nhập một lần mỗi thiết bị) để bảo vệ việc thêm/xoá key không? Nếu không, Phase 2 không thể làm an toàn trên site công khai.
2. Tối đa bao nhiêu key trong pool (đề xuất 5)?
3. Có cần "Kiểm tra key" gọi Google thật (tốn 1 request rất nhỏ) không?
4. Khi mọi key đều hết lượt: hiện thông báo tĩnh, hay hiện đồng hồ đếm tới lúc hạn mức reset?

## 15. Nhật ký triển khai Phase 1 — 10/10/2026 10:31–11:00 ICT (deepseek-flash, medium)

### 15.1 File đã sửa

| File | Thay đổi |
|---|---|
| `src/ai-models.ts` | Allowlist còn **6 model**: `gemini-3.5-flash` (mặc định), `gemini-3.8-flash`, `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-flash` (mới). Thêm `LEGACY_AI_MODELS` (`gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash`) và `normalizeAiModel()` map legacy → mặc định |
| `src/ai-reading.ts` | `AI_DEFAULTS.model` lấy từ `DEFAULT_AI_MODEL` (hết trùng nguồn sự thật); `readReadingAiSettings` chuẩn hoá model legacy thay vì rơi về mặc định trong im lặng |
| `src/prompt-stock.ts` | `validatePromptSettings` dùng `normalizeAiModel` ⇒ **kho prompt không còn ném lỗi** khi gặp model đã xoá; dữ liệu người dùng **không bị ghi đè** (chỉ chuẩn hoá khi đọc/áp dụng) |
| `src/ui/AiPanel.tsx` | Mặc định model lấy `DEFAULT_AI_MODEL`; đọc model legacy qua `normalizeAiModel`; bỏ mảng `MODELS` trùng |
| `server/ai-translate.ts` | (a) Model legacy được map về mặc định thay vì 400 `ai_invalid_model`. (b) **Key pool**: `GEMINI_API_KEYS` = JSON mảng chuỗi hoặc `{label,key}`, tối đa 8 key, dedupe, chỉ nhận ký tự in được, label ≤40 ký tự; pool hỏng/rỗng thì fallback `GEMINI_API_KEY` như cũ. (c) **Xoay tuần tự**: 1 request Google đang bay, mỗi key thử tối đa 1 lần trong một request; 429 → cooling theo `key:model` (dùng `Retry-After` hợp lệ, mặc định 60s, trần 6h) rồi thử key kế; 401/403 và 400 `API_KEY_INVALID` → retire key trong session; lỗi khác (schema/model/finish_reason/usage/5xx/400 khác) **không** xoay. (d) Hết key: 429 `ai_rate_limited` (chỉ kèm `Retry-After` khi **chính request đó** đọc được hint hợp lệ) hoặc 503 `ai_auth_error`. (e) Header an toàn `X-AI-Key-Label`, `X-AI-Rotation`, `X-AI-Keys-Available`. (f) `resetAiKeyState()` cho test |
| `tests/ai-translate.test.ts` | +6 case (legacy map, 2.5 Flash định tuyến, xoay key + không lộ key, mỗi key 1 lần/fail-fast, retire key invalid, pool hỏng, pool rỗng) + `resetAiKeyState()` trong `afterEach` |
| `tests/ai-diagnostics.test.ts` | `resetAiKeyState()` trong `afterEach` (tránh cooling rò giữa các test) |
| `tests/prompt-stock.test.ts`, `tests/ai-reading-review.test.ts` | Case model legacy → mặc định, prompt giữ nguyên, row lưu **không** bị ghi lại |
| `tests/ai-native-runtime.test.ts`, `tests/ai-service-binding.test.ts` | URL mặc định mới `gemini-3.5-flash` |
| `e2e/ai-reader`, `e2e/ai-inline`, `e2e/prompt-stock`, `e2e/prompt-stock-review`, `e2e/reader-controls`, `e2e/tts-resume` | Mock trả `model:'gemini-3.5-flash'`; `reader-controls` đổi số option model 8→6 |
| `scripts/smoke-ai-inline-production.mjs`, `scripts/smoke-ai-production.mjs` | Số option 8→6; model gửi đi `gemini-3.5-flash` |

### 15.2 Hành vi thay đổi so với trước (cần biết)

1. **Mặc định model** là `gemini-3.5-flash`; mọi cấu hình/prompt đã lưu dùng model đã xoá vẫn đọc được và chạy bằng mặc định mới.
2. **Pool 1 key (như production hiện tại)**: sau một 429, key đó bị cooling 60s (hoặc theo `Retry-After`) ⇒ các request sau **fail-fast 429** mà không gọi Google trong hạn đó. Trước đây server luôn gọi Google. Client vẫn có cooldown riêng như cũ.
3. `Retry-After` chỉ được phát khi request hiện tại đọc được hint hợp lệ từ Google; không bao giờ phản chiếu header thô/không đọc được.
4. Khi pool có nhiều key: hết quota key #1 → cùng request đó thử key #2 (**tuần tự**), không chạy song song, không thử lại key cũ trong cùng request; nhãn key dùng được hiển thị qua `X-AI-Key-Label` (không bao giờ là key).

### 15.3 Lệnh và kết quả

- `npm.cmd test` (TEMP/TMPDIR = `..\.dsh-tmp`) sau khi sửa theo review: **1025 test / 69 file, tất cả pass, exit 0** (~27s). Lần chạy trước có 1 fail `tests/folder-selection.test.ts` "supports more than 100 normal chapter files…" (timeout 5000ms khi chạy song song); chạy riêng file đó **14/14 pass, 342ms, exit 0** ⇒ flake do tải, không liên quan thay đổi AI; lần full sau không tái hiện.
- Targeted sau sửa: `ai-translate.test.ts` 115 + `ai-translate-client.test.ts` 34 + `ai-diagnostics.test.ts` 25 + `ai-reading-review.test.ts` 10 = **184/184 pass**.
- `npm.cmd run build`: **exit 0**, `✓ built in 3.45s`, `dist/assets/index-D-JdxhJr.js` 548.79 kB (warning chunk>500 kB có sẵn).
- E2E AI specs `--repeat-each=3`: lần 1 có 1 fail `ai-reader.spec.ts:29` (click `Hủy dịch` bị detach, `android-layout`); kết quả lần 2 ở `HANDOFF-LOG.md` cùng ngày.

### 15.4 Giới hạn còn lại (nói thật)

- Cooling key nằm **trong bộ nhớ isolate**: mất khi cold-start, không dùng chung giữa các isolate/tab; Phase 2 mới đưa vào KV/D1.
- **Chưa có UI nhập key** (Phase 2) — hiện nhập bằng `wrangler secret put GEMINI_API_KEYS` (Phụ lục A). Yêu cầu "key đồng bộ mọi thiết bị" **đã đạt** vì key nằm phía Worker, không nằm trên thiết bị.
- **Chưa deploy**: code mới chỉ ở máy; production vẫn chạy bản cũ cho tới khi deploy Worker + Pages.
- **Chưa thử pool >1 key với Google thật** (chỉ mock + Miniflare) ⇒ chưa có bằng chứng xoay key thật sự vượt được 429 thật.
- `X-AI-Quota-Scope` (phân biệt hết ngày/hết phút) chưa làm; chưa hiển thị "hết lượt hôm nay".
- Các cải tiến T4 (auto-retry khi có mạng, trạng thái phục hồi UI, Retry-After cho 5xx), T5 (Phase 2), T6 (smoke real Gemini đếm request) **chưa làm**.

### 15.5 Sửa theo review độc lập (10/10/2026 11:30, sau §15.1)

Reviewer read-only (133 targeted test pass) nêu 7 nhóm phát hiện; đã xử lý 6, ghi nhận phần còn lại:

| Phát hiện | Xử lý |
|---|---|
| **Cao**: `keyInvalid` không TTL ⇒ 1 lần 403 là tắt AI tới khi recycle isolate | Đổi sang `Map<id:model, invalidUntil>`, `KEY_INVALID_MS = 10 phút`; hết hạn thì **tự thử lại** (test: 403 → 503, tua 11 phút → 200) |
| **Trung→cao**: id key theo vị trí ⇒ đổi secret thì key mới thừa hưởng trạng thái cũ | id = **fingerprint FNV-1a của chính key** (test: pool `[A]` chết → pool `[B,A]` dùng đúng B) |
| **Trung**: tuyên bố "map legacy cứu tab cũ" **sai** với đường client | Server **echo lại model đã yêu cầu** khi đó là id đã xoá (header `X-AI-Model-Alias` = model thật đã gọi) **và** client chuẩn hoá hai phía khi so (`src/ai-translate.ts`, `src/ai-reading.ts`) ⇒ tab cũ vẫn dịch được; có test client cả hai chiều |
| Thấp: label do người vận hành đặt có thể bằng chính key ⇒ lộ key vào header công khai | Label bị thay bằng `key-N` nếu bằng hoặc là chuỗi con của key (có test) |
| Thấp: `keyLastUsed` chỉ ghi khi thành công ⇒ LRU sai khi đồng thời | Ghi **ngay lúc chọn key** (test: 2 request song song dùng 2 key khác nhau) |
| Thấp: `rateLimited` thắng `retired` ⇒ che lỗi credential chết | Đảo thứ tự: không còn key phục vụ được + có key bị retire ⇒ **503 `ai_auth_error`** (test 401+429) |
| Thấp: prune `size > 200` là dead code | Bỏ; ghi rõ hai map bị chặn bởi `≤8 key × 6 model` |
| Thấp: `X-AI-Rotation`/`X-AI-Keys-Available` cho người gọi ẩn danh biết số key | **Giữ** (metadata vận hành, không phải credential) — ghi nhận, không sửa |
| Thấp: cache ghi dưới model legacy phải dịch lại 1 lượt/chương | Chấp nhận (không hỏng, LRU tự đẩy) — ghi vào giới hạn §15.4 |
| Thấp: sửa 1 prompt profile ghi lại **toàn bộ** profiles nên model legacy của profile khác cũng bị chuẩn hoá khi ghi | Chấp nhận, **sửa câu chữ** cho đúng ở §15.6 |

### 15.6 Đính chính câu chữ về "không ghi đè"

- Đúng: hai khoá **legacy** `ai-translate-settings` / `ai-book-settings:*` **không** bị ghi lại khi chỉ **đọc** (test byte-equality).
- Nhưng khi người dùng **lưu/sửa một prompt** trong kho, `prompt-stock.ts` ghi lại toàn bộ `prompt-stock-v1`, nên model legacy trong **profile khác** cũng được chuẩn hoá thành mặc định mới tại thời điểm ghi. Không mất chức năng (id đã xoá vốn không dùng được), nhưng **không phải** "chỉ chuẩn hoá khi đọc".

## 16. Đánh giá: ý tưởng prewarm và hướng triển khai (10/10/2026)

Người dùng hỏi "ý tưởng prewarm có ổn không, làm ra có đúng hướng chưa". Trả lời kèm bằng chứng mã + dữ kiện quota §4.

### 16.1 Ý tưởng: ổn, nhưng đắt gấp đôi về quota

- **Đúng hướng về UX.** Đọc truyện là tuần tự nên "dịch sẵn chương kế tiếp" gần như chắc chắn có ích; nó giấu độ trễ 3–10s của Gemini sau thao tác đọc. Cách làm hiện tại (`Reader.tsx:145-153`) chỉ prewarm **sau khi** chương hiện tại trả `STOP`, chỉ khi đang ở chế độ Dịch AI và toggle "Dịch sẵn chương kế tiếp" bật ⇒ không đoán mò, không fan-out cả sách.
- **Chi phí thật:** mỗi chương đọc = **2 request** (hiện tại + kế tiếp). Theo [tài liệu rate limit](https://ai.google.dev/gemini-api/docs/rate-limits), hạn mức theo **project** và có chiều **RPD** ⇒ prewarm **nhân đôi** tốc độ tiêu hạn mức ngày, và request cho chương người dùng không đọc là **chi phí chìm**.
- **Kết luận:** giữ độ sâu 1, **không tăng lên 2** khi chưa có số đo; nên thêm "tạm ngừng prewarm khi quota đang cạn".

### 16.2 Hướng triển khai: lõi đúng, thiếu 3 thứ

Đã đúng (đọc mã + test/E2E): (1) **dedupe/promotion** theo `aiReadingKey` (`ai-reading.ts:36`) — đã kiểm bằng E2E + smoke production; (2) **huỷ đúng lúc** qua `retain([aiKey, nextKey])`, kết quả muộn bị từ chối theo `controller`; (3) **cache source-guarded** theo book/chapter/revision/text/settings/names, 100 bản ghi/32MiB (`ai-reading-cache.ts:44-61`); (4) **không ghi nguồn**, lỗi prewarm chỉ hiện notice riêng; (5) **recovery có hạn (client) + xoay key (server)** — server chỉ trả 429 khi mọi key cạn/cooling, nên cooldown ở client là lớp cuối và không chặn nhầm key khác.

Chưa đủ (đề xuất, **chưa làm**):
1. **Ngân sách prewarm**: khi prewarm vừa nhận 429 hoặc server báo `X-AI-Keys-Available: 0` thì nên **tạm tắt prewarm** tới hết cooldown thay vì thử lại mỗi chương (hiện chỉ hiện notice).
2. **Đo "prewarm có lãi"**: chưa biết bao nhiêu chương prewarm rồi được dùng thật. Đề xuất đếm cục bộ metadata-only (`prewarmed`/`usedBeforeRequest`), không lưu nội dung/prompt.
3. **Chương dài**: >32.000 ký tự thì prewarm **không chạy** (`Reader.tsx:152`) ⇒ giá trị prewarm bằng 0 cho truyện chương dài cho tới khi AI-READ2 (chunk/checkpoint) xong. Đây là điểm "chưa đúng hướng" lớn nhất, đã nằm trong backlog.

Rủi ro đã biết: cache key chứa `model` nên đổi/xoá model làm cache cũ vô dụng ⇒ dịch lại 1 lượt/chương; chưa kiểm Android thật/tab ẩn nên hành vi prewarm khi background **chưa xác minh**; chưa đo RAM/CPU khi prewarm chạy song song TTS.

### 16.3 Việc nên làm tiếp cho prewarm (thứ tự)

1. `PRE1` — Tạm ngừng prewarm khi quota cạn (dùng 429 trước đó hoặc `X-AI-Keys-Available: 0`); E2E: hai chương liên tiếp, chương sau **không** gọi API khi pool đang cooling.
2. `PRE2` — Đếm cục bộ `prewarmed/usedBeforeRequest` và hiển thị trong ⚙AI; không payload, không key.
3. `PRE3` — Sau khi có PRE2 mới quyết định giữ độ sâu 1 hay thêm "prewarm khi người dùng gần cuối chương".
4. `AI-READ2` — chunk >32k để prewarm không còn vô dụng với chương dài. **Giảm ưu tiên 10/10/2026:** người dùng xác nhận chương thực tế không dài quá 32k.

## 17. Phase 2 + deploy production — 10/10/2026 12:20 (deepseek-flash, medium)

### 17.1 Quyết định người dùng (chốt qua hỏi đáp)

1. **Deploy ngay**: nạp `GEMINI_API_KEYS` từ stdin (không ghi ra file/repo) rồi deploy Worker; Pages deploy sau khi xong UI. ✅ đã làm.
2. **Không dùng token quản trị** cho việc thêm/xoá key — chấp nhận rủi ro ai có URL cũng sửa được key (site đang `PUBLIC_LIBRARY=1`). ✅ đã làm, có cảnh báo ngay trong UI.
3. **2 key song song**: 2 job độc lập (chương hiện tại + chương kế) chạy song song trên **2 key khác nhau** là được; **không** đua nhiều key cho cùng một request. ✅ đúng hành vi hiện có (ghi nhận `keyLastUsed` ngay lúc chọn key).
4. Chương không dài quá 32k ⇒ bỏ lo phần giới hạn độ dài chương.

### 17.2 Code Phase 2 (mới)

| File | Nội dung |
|---|---|
| `migrations/0006_ai_keys.sql` | Bảng `ai_keys(id,label,secret,created_at,last_used_at)` + unique index trên `secret` |
| `server/ai-key-store.ts` | `KeyStore` (list/count/add/remove) + bản D1 (`ON CONFLICT(secret) DO NOTHING`, trần 50) |
| `server/ai-keys.ts` | HTTP `/keys`: GET (chỉ **bản che** `…abcd` + số lượng), POST (nhận `{keys}` hoặc `{text}`, **chỉ key dạng `AIza…`**, dedupe, báo `added`/`rejected`), DELETE `?id=`; rate-limit ghi 30 lần/10 phút theo IP; **không bao giờ trả secret** |
| `server/ai-translate.ts` | `loadAiKeyPool()`: key trong D1 **ưu tiên hơn** secret; cache 15s cho pool D1 (pool từ env parse mỗi request); `invalidateAiKeyPool()`; `resetAiKeyState()` xoá luôn cache |
| `server/ai-worker.ts`, `functions/api/ai/keys.ts` | Route `/keys` trong Worker + proxy từ Pages qua service binding `AI_TRANSLATOR` |
| `wrangler.ai.jsonc` | Thêm binding D1 `DB` (cùng database `thu-phong-auth`) |
| `src/ai-key-admin.ts` | Client list/add/delete + map lỗi sang tiếng Việt |
| `src/ui/AiPanel.tsx`, `src/stv-layout.css` | Mục “🔑 API keys” trong ⚙AI: dán nhiều key, danh sách che, nút xoá, cảnh báo site công khai |
| `tests/ai-keys.test.ts` (mới, 8 case) | Masked list, chỉ nhận key Gemini, dedupe, `keys_full`, rate-limit, ưu tiên D1 > secret, dịch bằng pool D1 + nhãn key |
| `e2e/ai-keys.spec.ts` (mới) | UI: list che, thêm (đếm đúng), xoá, không lộ key trong DOM |
| `scripts/smoke-ai-keypool-production.mjs` (mới) | 1 request Gemini thật + (tuỳ chọn `AI_KEYS_ROUNDTRIP=1`) round-trip thêm/xoá/cleanup trên production |

### 17.3 Lệnh và kết quả thật

- `npm.cmd test`: **1033/1033 pass, 70 file, exit 0** (~25s). `npm.cmd run build`: **exit 0**.
- E2E `ai-keys.spec.ts` repeat3 × 2 viewport: **6/6 pass, exit 0**.
- `wrangler secret put GEMINI_API_KEYS --config wrangler.ai.jsonc` (JSON 1208 byte, **19 key Gemini**; 1 dòng người dùng dán bị trùng; **2 key `gsk_` của Groq bị loại** vì chỉ hỗ trợ Gemini): exit 0.
- `wrangler d1 migrations apply thu-phong-auth --remote`: `0006_ai_keys.sql ✅`, exit 0.
- `wrangler deploy --config wrangler.ai.jsonc`: exit 0, Worker version **7553d030-7aa6-48f6-97cc-a8e1c2f3f8fb**, binding `env.DB (thu-phong-auth)`.
- `wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true`: exit 0, deployment **0811811e**.
- Production thật: `scripts/smoke-ai-keypool-production.mjs` → `{"status":200,"ms":3445,"keyLabel":"k1","keysAvailable":"19","model":"gemini-3.5-flash","finishReason":"STOP","vietnamese":true}`.
- Production round-trip (`AI_KEYS_ROUNDTRIP=1`): `{"activeBefore":19,"storedBefore":0,"added":1,"rejected":1,"storedAfterAdd":1,"listedMasked":true,"leaked":false,"removed":true,"storedAfterCleanup":0}` ⇒ thêm/xoá/mask/cleanup đều đúng, **không lộ key**.
- `GET /api/ai/keys` production: `stored=0 secretPool=19 active=19`; POST key Groq/junk → **400** (đúng thiết kế).

### 17.4 Giới hạn của Phase 2 (nói thật)

- **Không có xác thực**: ai có URL đều thêm/xoá key được (quyết định của người dùng). API chỉ trả bản che nên **không lộ key**, nhưng vẫn có thể bị **xoá hết key** hoặc thêm key rác. Giảm thiểu: rate-limit 30 lần ghi/10 phút/IP, chỉ nhận key dạng `AIza…`, trần 50 key.
- Pool D1 được cache 15s mỗi isolate: sau khi thêm key, **isolate khác** có thể chậm tối đa ~15s mới dùng key mới (isolate xử lý request thêm thì xoá cache ngay).
- Chưa có thống kê dùng theo key (số 429/lần dùng cuối) trong UI; chưa export/import key; chưa có circuit breaker theo model như userscript tham khảo.
- Key đã dán vào chat ⇒ coi như đã lộ; nên tạo/thu hồi key mới khi thuận tiện. Từ giờ **không** đưa key vào file/log/commit; thêm key qua UI hoặc secret.
- 2 key Groq **không dùng được**: app chưa có adapter Groq (ngoài phạm vi, cần quyết định riêng).
- Chưa kiểm: nhiều tab cùng sửa key, key bị xoá giữa lúc một request đang bay, hành vi khi cả 19 key cùng cạn quota (chỉ đo được khi thật sự hết hạn mức).

## 18. Thêm Gemma (10/10/2026 13:05) — có đo thật, không đoán

Người dùng yêu cầu "thêm cả gemma". Id model **không** lấy từ trí nhớ mà hỏi thẳng Google bằng chính key của người dùng (`GET /v1beta/models`, key truyền qua biến môi trường, **không** ghi ra file):

- Danh mục trả về 62 model, **đúng 2 model Gemma**: `gemma-4-26b-a4b-it` và `gemma-4-31b-it` (cả hai `generateContent`, input 262144 / output 32768 token).
- **`systemInstruction` được chấp nhận** (HTTP 200) ⇒ không cần workaround kiểu Gemma 3.
- **`thinkingConfig.thinkingBudget` KHÔNG được hỗ trợ** (400 "Thinking budget is not supported for this model") ⇒ server **không** gửi trường này (và hiện cũng chưa từng gửi) — ghi lại để sau này đừng thêm.
- **Gemma 4 trả kèm thought part**: `gemma-4-26b-a4b-it` cho `thought: true` (399 thought token) **cùng** bản dịch tiếng Việt sạch. Server cũ **từ chối mọi response có thought part** ⇒ sẽ hỏng với Gemma. Đã sửa: **bỏ qua part `thought: true`**, lấy phần chữ còn lại; nếu chỉ có thought ⇒ `ai_empty_result`.
- Trạng thái upstream đo được hôm nay: `gemma-4-26b-a4b-it` **200 + bản dịch đúng**; `gemma-4-31b-it` liên tục **500 "Internal error" / 503 "high demand"** từ phía Google (kể cả gọi trực tiếp, không qua app) ⇒ qua app trả 502 `ai_upstream_error`. Vẫn để trong allowlist để dùng khi Google sửa, nhưng **đừng hứa model này chạy**.

Đã làm: `AI_MODELS` 6 → **8** (thêm 2 Gemma, mặc định vẫn `gemini-3.5-flash`); sửa cách đọc `parts` trong `server/ai-translate.ts`; test mới "keeps the Gemma answer and drops its reasoning parts" + 2 id Gemma tự động vào các test tham số hoá theo `AI_MODELS`; đổi số option model trong `e2e/reader-controls.spec.ts` (8) và `scripts/smoke-ai-inline-production.mjs` (8); mở rộng `scripts/smoke-ai-keypool-production.mjs` với `AI_GEMMA_SMOKE=1`.

Bằng chứng: `npm.cmd test` **1040/1040 pass, 70 file, exit 0**; build **exit 0**; E2E `reader-controls` + `ai-keys` repeat3 **24/24 pass, exit 0**; deploy Worker **c3475c16-85ab-4b13-959f-007320b18ec4** + Pages **dc516643**; production thật: Gemini `200` (3.7s, key `k1`), `gemma-4-26b-a4b-it` **200, STOP, bản dịch tiếng Việt** (12.2s), `gemma-4-31b-it` 502 `upstream_http` (lỗi Google).

Giới hạn: Gemma chậm hơn Gemini (~12s vs ~3.7s cho cùng đoạn); chưa đo chất lượng trên chương dài; chưa biết quota/billing riêng của Gemma theo project; nếu Google trả 5xx cho Gemma thì **không** xoay key (đúng thiết kế: lỗi model không phải lỗi key) nên người dùng phải tự đổi model.
