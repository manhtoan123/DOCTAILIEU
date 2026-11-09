# Loại trừ key–model, thứ tự Groq và reload chương — 01/11/2026

## Key–model

Người dùng yêu cầu ghi nhớ cặp key/model bị403/404 không thể phục hồi, không làm mất key cho model khác. Bảng mới `ai_key_model_blocks(id,model)` có khóa kép, id là SHA256 credential; không chứa key rõ/prompt/nguồn. Đọc khi tải pool; D1 reservation kiểm tra bảng trong UPDATE nguyên tử, cả Google và Groq. Không xóa dữ liệu key hợp lệ/model khác. Chỉ migration0017 tạo bảng mới idempotent, không chạy các migration đang chờ khác.

403 có lỗi provider có cấu trúc PERMISSION_DENIED/quyền truy cập model và404 model NOT_FOUND được loại theo cặp, xoay key còn lại của cùng model. Khi hết cặp khả dụng, trả lỗi model để chế độAuto chuyển tiếp; Fixed dừng, không đổi model. Lỗi key invalid/expired/leaked/revoked rõ ràng vẫn loại toàn key như cũ. HTML403/404 hoặc diagnostic chưa rõ không được coi là bằng chứng loại vĩnh viễn; giữ phân loại/cooldown tạm. 429/5xx/timeout không vào bảng loại vĩnh viễn.

Danh sách key chỉ trả masked key và blockedModels; giao diện ghi “Đã loại khỏi: …”. Không phát sinh reset/mở lại tự động. Nếu operator thay quyền/quyền truy cập model về sau, cần thao tác khôi phục riêng; lần này chưa có UI khôi phục cặp.

Thứ tựAuto đã thêm Qwen3.8-27B(Groq) ngay sau Gemini2.5Flash, trước3.5Flash-Lite. Cùng helper được dùng để hiển thị và chọn model; giữ pin sau phần hoàn tất, tối đa2request và poolGroq riêng.

## Trang đọc trực tiếp/reload

Trước sửa, GET production `/` trả200 HTML; `/r/10001/1479` trả404 rỗng, khớp ERR_HTTP_RESPONSE_CODE_FAILURE trong browser. Middleware cho phép auth hiện có trước; khi downstream404 trên GET/HEAD đúng dạng `/r/<book>/<chapter>` hoặc `/read/<book>/<chapter>`, phục vụ rootSPA bằng ASSETS binding và giữ URL gốc. Không đổi API404, asset404, POST, login hoặc chính sách quyền/CSP. Dùng rootasset để tránh redirect chuẩn hóa index.html làm mất URL chương.

## Nguồn và điều chỉnh

- [Google troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting): phân biệt403/config với429/5xx có thể retry; không suy ra toàn bộ key hỏng từ một model không có quyền.
- [LiteLLM cooldown source](https://github.com/BerriAI/litellm/blob/main/litellm/router_utils/cooldown_handlers.py): tham khảo phân loại lỗi và loại route khỏi lựa chọn; app giữ cơ chế D1 lease/model-pair riêng, không thêm dependency.
- [Pages Functions API](https://developers.cloudflare.com/pages/functions/api-reference/), [Pages assets binding](https://developers.cloudflare.com/pages/functions/bindings/#accessing-static-assets), [SPA serving](https://developers.cloudflare.com/pages/configuration/serving-pages/): phục vụ asset của SPA ở client route qua middleware, giữ auth wrapper. Không thay framework/hạ tầng.

## Kiểm chứng

Theo chỉ đạo không thêm/chạy test của người dùng, chỉ đọc diff/review độc lập/build; không gán test cũ làm bằng chứng runtime mới. Mã HTTP trang đọc thật trước/sau deploy và ID deploy được ghi cuối tài liệu. Không backfill403/404 cũ từ log vì thiếu diagnostic để kết luận từng cặp bị hỏng vĩnh viễn.


Triển khai01/11: migration0017exit0 (tạo bảng mới, không backfill); Worker10a0a796, Pages93eae628/index-C2Pd7Y5R.js. Buildfinalexit0; reviewerđộc lập SolHigh đọc diff, sửa helpermodelLabel đãbuildxác nhận. GETthật: /=200, /r/10001/1479=200, /r/10001/1477=200. Giữ URL chương, khôngredirect. Không thêm/chạy tests theo yêu cầu; chưa xác minh trìnhduyệt/Android thật hoặc gọiAIupstream saudeploy. Gitdiffcheck gặp mmapInvalidargument của môi trường, không xem là pass. Logs .dsh-tmp/key-model-{route-build-final,migration,worker-deploy,pages-deploy}.log và key-model-route-http.json.


## Sửa tiếp sau rà soát (01/11)

- Cặp keyA429/Retry-After + keyB403/404 không còn trả404 vĩnh viễn nếu A vẫn có thể phục hồi. Tính cooldown chỉ từ key chưa globallydisabled/chặn model/retire tạm và trả429 cùng thời gian chờ trước các nhánh lỗi cuối. Chỉ coi model mất khả dụng khi tất cả key bị loại thật; không suy ra từ available rỗng.
- Poolprovider không có key hợp lệ trả safe code `ai_provider_unavailable` để Auto đi tiếp. Fixed vẫn singleton và dừng; lỗi D1/store không giả thành thiếu key provider. Bổ sung error code vào whitelist nhật ký server và thông báo/actionkeys của client. Không thêm provider/credential/billing.
- Groq allocator dùng CTE key_pool, bind ID một lần và MATERIALIZED claim_clock. N+7 tham số, tối đa39 với32key thay vì136; monotonic usedAt/lease owner/releaseCAS và thứ tựLRU được giữ trong một UPDATE. Bảng0017 không đổi, không migration mới.
- Gemma26B/31B gọi Google với `thinkingConfig.thinkingLevel:minimal`, metadata thinkingdisabled; theo [Gemma GeminiAPI chính chủ](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api), minimal tắt thinking. Thời gian chờ answer đầu của streamGemma90s, cả client/server dùng helperchung; modelkhác45s, idle7s, hard180s và Stop giữ nguyên. Không dùng heartbeat/thought làm answeractivity. JSONlegacy vẫn giữ deadline30s như cũ; không tăng timeout tất cả model.
- Tham khảo và điều chỉnh [LiteLLM router mã mở](https://github.com/BerriAI/litellm/blob/main/litellm/router.py) về ranh giới retry/fallback và [giới hạnD1](https://developers.cloudflare.com/d1/platform/limits/)100params; tái sử dụng scheduler/lease của app, không càiSDK/hạ tầng mới.
- Reviewer độc lập đọc diff server, kiểm đại sốclaim/release và phân loạiquota/provider, không thấy blocker. Theo chỉ đạo người dùng, chưa thêm/chạy test hoặc AIupstream thực cho các thay đổi này; build/deploy và GETrelease ghi sau. Không coi review đọc hoặc build là bằng chứng hiệu năng Gemma thực.


## Chốt tích hợp và triển khai

Build cuối exit0 (tsc client+server, Vite), asset index-hh6m9Xg6.js. Review độc lập đọc phạm vi server/client cuối, đóng các finding, gồm guard timer và mãhủy ai_cancelled; không còn blocker trong phạm vi. Worker69d97149, Pages69a5194b, không migration/schema/dependency/provider mới. GETrelease / HTTP200 /assets/index-hh6m9Xg6.js; /r/10001/1479 HTTP200 /assets/index-hh6m9Xg6.js. Logs .dsh-tmp/ai-repair-timeline-{build-final,worker-deploy,pages-deploy}.log và release.json. Không thêm/chạy test/E2E/render/AIupstream theo chỉ đạo tiết kiệmusage. Chưa chứng minh hiệu năng/chất lượngGemma mới hay giao diệnAndroid thật. Không dùng các testpass cũ làm bằng chứng tínhnăngnày. Lịch sử chỉRAM của phiên/lượt dịch mới, reload hoặc cache cũ có thể không có lịch sử.

Server chi tiết: [quota/provider/Gemma/SQL](AI-KEY-MODEL-EXCLUSION-2026-11-01.md#sửa-tiếp-sau-rà-soát-0111).
