Bạn tiếp tục Private Novel Reader tại C:\Users\toann\OneDrive\Documents\ChatGPT\DOCTAILIEU.

Đọc AGENTS.md, HANDOFF.md, WEB-READER-IMPLEMENTATION-PLAN.md, private-novel/docs/DECISIONS.md, private-novel/docs/AI-KEY-POOL-PLAN.md (§15–§16) và phần cuối docs/HANDOFF-LOG.md. Không mặc định tin báo cáo trước. Đối chiếu code/test thực.

Model/effort: giữ medium, không high hoặc đổi vendor giả. Model chính không tự đổi nếu công cụ không hỗ trợ. Subagent chỉ khi có phạm vi độc lập hữu ích; mỗi agent quyền/file/invariant/test rõ, không sửa cùng file. Khi quota ghi cấu hình/công việc dở rồi root tiếp quản.

Trạng thái 10/10/2026 13:10 ICT:
- Production https://thu-phong-private.pages.dev/ **đã phát hành KEY-POOL-1 + Gemma 4**: Pages deployment **dc516643**/master, AI Worker `thu-phong-ai` **c3475c16-85ab-4b13-959f-007320b18ec4** + binding D1 `DB`; D1 thu-phong-auth đã áp migration 0001–0006; R2 thu-phong-library. Wrangler4.147/compat2026-01-01 giữ.
- **Key pool đang chạy thật**: secret `GEMINI_API_KEYS` = **19 key Gemini** (nạp từ stdin, không lưu file; 2 key Groq `gsk_` bị loại). `GET /api/ai/keys` → `stored=0 secretPool=19 active=19`. Thêm/xoá key ngay trong ⚙AI (mục “🔑 API keys”) qua `GET/POST/DELETE /api/ai/keys`, lưu ở D1 `ai_keys` (trần 50, chỉ nhận key dạng `AIza…`, rate-limit 30 ghi/10 phút/IP, **không xác thực** theo quyết định người dùng ⇒ ai có URL cũng sửa được key; API chỉ trả bản che `…abcd`).
- Allowlist **8 model**: 6 Gemini (default `gemini-3.5-flash`, có `gemini-2.5-flash`; legacy map `3.5-flash-lite`/`3.6`/`3.7` ở server + client) + **2 Gemma 4** (`gemma-4-26b-a4b-it` chạy tốt ~12s; `gemma-4-31b-it` hiện Google trả 500/503). Gemma: `systemInstruction` **được** hỗ trợ, `thinkingConfig` **không** (đừng gửi), part `thought:true` **bị bỏ qua** khi ghép kết quả (nếu chỉ có thought ⇒ `ai_empty_result`). Xoay key tuần tự ngay khi 429 (cooling `key:model`, retire 10 phút rồi tự thử lại, id theo hàng D1/fingerprint, label không chứa key); header `X-AI-Key-Label`/`X-AI-Rotation`/`X-AI-Keys-Available`/`X-AI-Model-Alias`; 2 job độc lập (chương hiện tại + kế) chạy song song trên 2 key khác nhau, **không** đua nhiều key cho cùng request; **không** xoay key cho 5xx (lỗi model ≠ lỗi key). Key không bao giờ vào body/header/log/URL/file/commit.
- Kiểm chứng: unit **1040/1040 exit0** (70 file); build **exit0**; E2E `ai-keys` + `reader-controls` (8 model) repeat3 × 2 viewport **24/24 exit0** (+ 5 spec AI cũ **156/156 exit0**); review độc lập đã sửa 6 phát hiện (plan §15.5). Production thật: `smoke-ai-keypool-production.mjs` exit0 (`keyLabel k1`, `keysAvailable 19`, tiếng Việt) + `AI_GEMMA_SMOKE=1` exit0 (Gemma 26B 200/STOP/tiếng Việt ~12.2s; 31B 502 đúng lỗi Google); round-trip `AI_KEYS_ROUNDTRIP=1` exit0 (`added1/rejected1/listedMasked/leaked:false/removed/cleanup stored0`); `smoke-ai-production.mjs` exit0 (realGemini 2 lượt + `gemini-3.8-flash` + bundle canonical verified); `smoke-ai-ui-production.mjs` exit0 (1280×800 và 522×524).
- Không tự đọc/đổi secrets; không PIN/login/AIcode/xác nhận phụ theo user, PUBLIC_LIBRARY1 anyURLadmin giữ. **Không** ghi key vào file/log/commit — chỉ nhập qua UI hoặc `wrangler secret put` (stdin). Khi cần biết id model mới: **hỏi `GET /v1beta/models` bằng key thật**, đừng đoán.

Đánh giá prewarm (đã trả lời người dùng, plan §16): ý tưởng current+next **đúng hướng** (chỉ prewarm sau STOP, dedupe, retain, cache source-guard, không ghi nguồn) nhưng **đắt gấp đôi quota** (2 request/chương, RPD tính theo project). Người dùng xác nhận chương không quá 32k nên bỏ lo phần đó. Quyết định: giữ độ sâu 1, **không tăng** khi chưa có số đo.

Việc tiếp theo đề xuất (thứ tự):
1. PRE1: tạm ngừng prewarm khi quota cạn (429 trước đó hoặc `X-AI-Keys-Available: 0`) + E2E "chương sau không gọi API khi pool cooling". PRE2: đếm cục bộ `prewarmed/usedBeforeRequest` (không payload). Chỉ sau đó mới cân nhắc PRE3.
3. TTS-SENT: highlight đúng từng câu trong đoạn (Convert tokens cần map rendered offset) + kiểm Android thật/background/nghe bằng tai nếu có thiết bị.
4. AI-READ2: chunk>32k/checkpoint/AIprogress riêng/resume dịch chương dài; giữ RAW/Convert không overwrite.
5. STORAGE2-2: cloud metadata CAS/outbox/conflict/tombstone cho Name/prompt/Album/title/chapter/progress + registry nhiều thiết bị; không overwrite immutable snapshot v1.
6. EPUB spine/images/sanitization/Convert/Name + cloud assets.
7. Backup A1/A4/A5/A6 known expectedfail + multitab; BULK resume/corpus M0 (inventory 73839 files chưa upload, không hứa 20GB/0VNĐ).
8. Chrome Android thật/IME/background/rotation/fontscale/audio.

Ràng buộc: D:\linh tinh\tm chỉđọc, không sửa/xóa/rename/run/copy/upload/Git. Khôngreset/clean/commit/push dirtytree hoặc tựimportcorpus. Secrets khôngVITE/bundle/URL/Git/log. Chỉownsynthetic productionprobe; không read/upload/delete truyệnthật đểtest. Không nâng paidtier/Wrangler/compat đểné giới hạn. Xoay key **được phép** (quyết định 10/10/2026) nhưng chỉ key do người dùng cấp, **không fan-out song song một chương**, không xoay với lỗi không phải 429/401/403/400-`API_KEY_INVALID`, không tự bật billing.

Kiểm chứng bắt buộc sau code: npm.cmd test (TEMP/TMPDIR trỏ ..\.dsh-tmp vì workerd bị từ chối AppData\Local\Temp trong môi trường hiện tại) + npm.cmd run build; E2E liên quan repeat3; thay đổi rủi ro cao (secret/key/auth/dữ liệu người dùng) cần review độc lập actual targeted tests/diff. Tránh chạy fullunit/native/browser đồng thời.

Cuối đợt: HANDOFFcurrent khoảng100lines; HANDOFF-LOG append-only chi tiết giờ/model/file/lýdo/lệnh/exits/fails/review/giới hạn/nextID; DECISIONS append nếu đổi kỹ thuật. Báo ngắn cái thậtđãchạy/model/tests/deploy/remaining. Không tuyên bố toànwebhoànthành khi EPUB/metadata/AI32k/Android thật chưađạt; không tuyên bố deploy khi mới build/deploy local.
