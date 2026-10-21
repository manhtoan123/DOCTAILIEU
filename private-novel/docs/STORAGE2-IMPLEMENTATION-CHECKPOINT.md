# STORAGE2 — checkpoint thiết kế và spike nhỏ

09/10/2026 12:19 ICT. Thực hiện: Codex subagent, GPT-6.1-sol/medium theo metadata dispatch của root. Phạm vi phiên: đọc mã/tài liệu, đo catalog tổng hợp trên Node, chỉ tạo tài liệu này. Không sửa app/server/migration, không đọc D/nội dung người dùng/secrets, không mạng/deploy/R2 thật. Đây là thiết kế đề xuất, chưa nghiệm thu tính năng.

Đã đọc HANDOFF, WEB-READER-IMPLEMENTATION-PLAN, DECISIONS, READER-MINIMAL-2-PLAN, BULK-LIBRARY-PLAN; đối chiếu src/cloud-snapshot.ts, cloud-client.ts, db.ts, domain.ts, albums.ts, folder-import.ts, ui/ImportDialog.tsx, ai-reading.ts, ui/Reader.tsx; server/cloud-library.ts và migrations0002–0004. Tham khảo local skill cloudflare và cloudflare/references/r2/README.md; hướng dẫn yêu cầu kiểm tài liệu API hiện hành trước triển khai. Phiên này không kiểm mạng nên signatures/limits/pricing provider hiện hành chưa xác minh. Không đưa thư viện hoặc dịch vụ mới vào dự án.

## Lệch giữa mục tiêu và code

| Mục tiêu | Mã thực hiện tại | Phần còn thiếu |
|---|---|---|
| Giữ file gốc tải lại | SourceFile chứa Blob/name/path/encoding/SHA/bytes local | CloudSnapshot v1 chỉ book/chapters/names; không originals |
| Truyện lớn/cloud RAM bounded | Client/server snapshot32MiB; server boundedBody gom chunks rồi copy | Chapter parts và manifest; hiện reader cloud tải cả snapshot |
| Name/prompt/Album/progress nhiều thiết bị | Snapshot Name lúc nhập; client ACK bỏ các lần upload sau; perbook AI settings local | Metadata revision API, conflicts, local outbox/ACK theo revision |
| Album rỗng/rename/remove/move | Book.album label, App distinct/filter, import label atomic | Registry stableID/membership; root đang triển khai riêng, không nhận là đã cloudsynced |
| EPUB ảnh/spine/TOC/Convert | ImportDialog từ chối EPUB; folder chỉ nhận TXT | Archive parser, sanitized reading blocks, image model/source anchors |
| AI>32k/cache/resume | Reader chặn32000; AiReadingSession Map RAM current+next; modeAI không save canonicalprogress | Chunk/checkpoint/result storage/AI progress riêng |
| Backup hoàn chỉnh | Portable/compact có sources; known failures riêng | A1/A4/A5/A6 và globalNames; A7 audit có thể stale vì splitter đã surrogate-safe |
| Corpus lớn/Android | Metadata inventory lịch sử; không upload corpus trong phiên này | Catalog/RAM/request/encoding overhead thật, Android thật, bulk checkpoints |

vitest.config.ts chỉ include tests/**. A1/A4/A5/A6/A7 trong audit/2026-10-04.repro.test.ts qua audit/vitest.config.ts, không thuộc npm test mặc định. globalNames it.fails nằm tests/convert-names-review.test.ts:54. Phiên này không chạy audit; không kết luận known-failure đã sửa hoặc vẫn tái hiện từ nhãn test.

## Spike catalog tổng hợp đã chạy

Host Windows, Node v24.14.0; lệnh PowerShell here-string dưới đây pipe vào node --expose-gc, exit0. Số đo một lượt, tạo rows + stringify + parse, GC trước từng case; delta heap/RSS có allocator/JIT noise, không peak và không device RAM budget. Payload không chứa chương, Name hoặc prompt. 1000 là aggregate local, server hiện vẫn page≤100; client listCloudBooks hiện gom toàn catalog.

| Rows | Shape | JSON UTF8 bytes | Generate/stringify/parse ms | Heap delta bytes | RSS delta bytes |
|---:|---|---:|---:|---:|---:|
|100|v1|22965|0.337|170808|364544|
|100|proposed-v2|41565|0.343|256000|147456|
|1000|v1|230415|2.388|1141080|3162112|
|1000|proposed-v2|416415|2.967|2508608|1388544|

Reproduction không đọc filesystem/network; run từ private-novel/:

```powershell
@'
const {performance}=require('node:perf_hooks');
for (const count of [100,1000]) {
 for (const variant of ['v1','proposed-v2']) {
  global.gc(); const before=process.memoryUsage(); const t0=performance.now();
  const books=Array.from({length:count},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,title:`Truyện tổng hợp ${i} 漢字`,album:`Root/Album ${i%20}`,sha256:'a'.repeat(64),bytes:1048576,updatedAt:1791494400000,...(variant==='v1'?{}:{storageVersion:2,manifestSha256:'b'.repeat(64),metadataRevision:1,contentRevision:1,originalBytes:1048576,originalCount:1})}));
  const json=JSON.stringify({books,cursor:null}); const utf8=Buffer.byteLength(json); const parsed=JSON.parse(json); const elapsed=performance.now()-t0; const after=process.memoryUsage();
  console.log(JSON.stringify({count,variant,utf8,elapsedMs:Number(elapsed.toFixed(3)),heapDelta:after.heapUsed-before.heapUsed,rssDelta:after.rss-before.rss,rows:parsed.books.length}));
 }
}
'@ | node --expose-gc
```

Kết luận hẹp: cần pagination/projection metadata, không gắn Name/prompt/full manifest vào mỗi shelf row. Chưa đủ bằng chứng chọn virtualization/compiled dictionary hoặc chứng minh73k/20GB chạy tốt. Spike tiếp theo phải chạy browser fixture100/1000 + original40MiB/parts và đo peak, cold/warm, cancellation latency; Android thật riêng. Không ngoại suy heap một lượt ra73k.

## Bước triển khai đầu tiên: original TXT sidecar cho v1

STORAGE2-1 chỉ thêm original TXT đã được người dùng chọn cho book v1 sẵn có. Giữ bytes/format/key/ID/restore hiện hành của v1; không rewrite cloud_books hoặc snapshot để thêm sourceId giả. V1 có thể đọc chữ khi sidecar chưa sẵn sàng; UI chỉ nói “file gốc đã lưu” khi manifest original ready và mọi part đã verify. Chưa hỗ trợ original EPUB, chapter parts, metadata sync hoặc auto upload D.

Đề xuất object immutable theo bookId + sourceSHA + partIndex + partSHA (không cross-book dedupe giai đoạn đầu để tránh refcount/GC sai). Part target1MiB, maximum2MiB là giới hạn ứng dụng dự kiến, không giới hạn provider. Client Blob.slice upload tuần tự, incremental hash whole source + từng part, cancellation abort và checkpoint local; không base64 hoặc arrayBuffer toàn40MiB. Manifest version1 gồm bookId, originalId, source name/relativePath/encoding, fullSHA/bytes, ordered part descriptors index/bytes/SHA, format TXT. Path chỉ provenance, không thành filesystem/server key và không expose absoluteDpath. Manifest nhỏ có cap dự kiến256KiB/count4096; điều chỉnh sau số đo và review.

Server tạo keys từ UUID/hash/index validated, không nhận arbitrary key. Mỗi request part cap2MiB đếm bytes thực, verify SHA trước ACK; existing exactpart idempotent, same identity/different bytes409. Request reservation kiểm totalbudget trước R2 write. Manifest ready là publication point sau server đối chiếu mọi part/reference/count/hash/bytes và tombstone; HEAD metadata đơn thuần không thay full-object checksum verification. SHA toàn original phải được kiểm ở client download streamed/incremental trước commit hoặc xuất thành công; không gọi bộ phận hợp lệ là cả source hợp lệ. Resume status chỉ trả descriptor trạng thái thuộc original đó, không bucket listing.

Nếu original upload lỗi, source local và v1text vẫn giữ. Cancel/close giữ pending reservation và checkpoint để resume hoặc báo rõ; không tự gọi deleteBook/cloudBook. BookDELETE tombstone có ưu tiên cao hơn mọi originalPUT/publish; GET không phục vụ original đã tombstone. Cleanup chỉ exact keys sở hữu book, sau tombstone; không trả budget khi chưa chứng minh không còn latePUT/orphan. Khi gỡ Album không gọi API storage.

## API và migration dự kiến — chưa được áp dụng

| Bề mặt | Phạm vi dự kiến |
|---|---|
| POST /api/cloud/books/:id/originals | Khai báo original immutable, validate limits/hash/count, reserve bytes; yêu cầu book ready/nondeleted |
| PUT /api/cloud/books/:id/originals/:originalId/parts/:index | Exactpart bounded checksum/idempotency; declaration phải tồn tại |
| GET original status/manifest/part | Status metadata bounded; download streams; route tùy loại ContentType an toàn |
| POST original publish | Conditional pending→ready sau verified descriptors và book tombstone guard; response manifestSHA |
| Migration additive proposed0005 | Separate cloud_originals + cloud_original_parts; PK identity/checks bytes/hash/state; indexes book/state; không update v1 snapshots |

Chưa chốt tên route/schema/migration số vì root có thể thêm migration khác. Cần independent review SQL invariants và targeted actual transaction tests trước remote apply. R2/D1 không có transaction chung: reservation→immutable put→conditional publish, retry reconcile; test crash ở từng boundary. Không giả R2 put và D1 ready atomic.

Budget phải tính SUM v1reservations + originalparts + originalmanifest + futurechapterparts + retainedmetadata, kể cả pending/deleted và dict allocation được trình bày riêng. Current v1 PUT chỉ SUM(cloud_books.bytes): khi bật originals, cả v1reservation và originalreservation phải cùng sharedbudget accounting/SQLite serialization; chỉ cộng ở API mới gây tổng vượt9GB. Do vậy STORAGE2-1 cần thay query budget v1 có review nhưng không đổi v1 format/immutable semantics. Đồng thời overwrite-key retries không tính hai lần; full-original khai báo và part thực không bị charge double. Không bật storage2 khi hai phía còn kiểm budget khác nhau. Không cam kết9GB thực còn trống,20GB hoặc0VNĐ từ spike này.

STORAGE2-2 sau đó mới chapterparts/contentmanifest v2: text UTF8 bytes/SHA bounded, chapter index page riêng và fetch current+next; giữ revision/source provenance/surrogate boundary; book publication cuối cùng. Old client/v1 API đọc v1 như cũ; v2 feature detect rõ, không trả v2manifest vào v1 GET JSON. Không tự migrate oldbooks để hợp kế hoạch; original bytes chỉ có thể khôi phục từ SourceFile thực, cloud v1 restore không có originals.

## Metadata revisions tách khỏi immutable content

STORAGE2-META là phạm vi riêng sau registry/prompt local đã review. Đề xuất resource CAS riêng cho bookNames, bookPromptLibrary/activePrompt, bookAlbumMembership, canonicalProgress và aiProgress; libraryAlbumRegistry/globalPromptLibrary có revision riêng. Separate scopes tránh cuộnReader gây conflict Name. Có endpoint GET + PUT conditional expectedRevision, operationId idempotency, tombstone + metadata schema/contentIdentity; 409 trả currentRevision và conflict summary bounded. Không last-write-wins theo client clock; không silent overwrite hoặc tự merge rồi báo synced. Khi409 giữ localdirty+base/cloudcopy để chọn xử lý, retry chỉ sau resolve và revision mới. No-PIN/no-confirm phụ không đồng nghĩa bỏ conflict integrity; UI giải quyết dữ liệu là hành động có ý nghĩa.

Tên riêng theo bookId, globalNames riêng: v1 snapshot Names đã merge chỉ là baseline thực tế, không thể suy ngược origins global/book đã mất. Prompt profiles snapshot riêng không bị cập nhật chung âm thầm. Album stableID/name registry và membership, xóaAlbum chỉ clear memberships; registry/membership CAS cần publication/transaction đủ để không treo reference. Canonicalprogress chỉ hợp chapter/contentRevision và anchor schema; AIprogress identity gồm rawSHA, model, prompt effective signature, matchedName signature, translated resultSHA và paragraph/offset riêng. Không lấy AIparagraph ghi RAW progress hoặc tự restore lên bản dịch khác.

Client metadata outbox trong local settings/table thiết kế riêng: capturebook/scope/revision/source identity; stale ACK không mark newer edit clean; tab đồng thời serializes via IndexedDB transaction, no network await giữtransaction. Late cloud response không overwrite dirtylocal/source change; cloud delete wins và chặn tái publish. Cloud-onlybooks có thể sửa metadata mà không upload fulltext; local originals không bị đụng khi metadata cập nhật. BookDELETE phải chặn tất cả new scopes; schema mới hơn local không silently reset.

## Tests và nghiệm thu bắt buộc

1. STORAGE2-1: original empty/invaliddeclaredlen/oversizeactual/truncatedpart/hashmismatch/duplicateid/wrongindex/wholeSHA, originalUTF8/16 binary roundtrip, file40MiB tổng hợp, maliciouspath; sourceBlob SHA/bytes còn nguyên sau fail/cancel. API idempotent and exactkey restrictions, reservedquota concurrent v1+original, tombstone before/after PUT/publish, R2failure/D1failure/crash/retry, stale ACK, downloadcancel, samebook unrelatedoriginal preserved. Manifest không ready khi thiếupart; no localready partiallyrestored source.
2. Regression v1: existing fixture catalog/upload/409/downloadSHA/delete+latePUT, unchanged snapshotbytes/IDs, oldclient restore, no neworiginal auto publication from missingSource marker. Cloud-delete trước local-delete; removeAlbum giữ tất cả bytes/Names/prompt/progress.
3. METADATA: two devices samebaseconflict, repeatedoperation exactACK, operationId reused payload409, localeditedduringrequest/lateACK/multitab/clouddelete/offline/reload, newer schema/invalidtemplate/revision overflow, Name/global scope, prompt deletion active fallback, Albumremove memberships across boundedtransactions and crash consistency, revision-specific progress. Không secret/body logging.
4. EPUB-1 riêng: fflate đã dependency local và có streaming Unzip/UnzipInflate/AsyncUnzipInflate; chưa có XML/EPUB parser. Không dùng unzipSync toànarchive lớn. Test zip traversal/absolutepath/duplicatecanonicalname/zipbomb/decompressed total/entrycounts/mimetype/container/OPF namespace/spineorder/TOC/nav/NCX/missingentries/cycle; runtime bytecounts vì ZIP size có thể absent. Sanitization allowlist readingblocks, remove script/eventhandler/iframe/form/remoteURL, CSS url remote, SVG activecontent; image decode/size/type limits, safe relative URI+percent traversal, BlobURL lifecycle. No archiveHTML execute. Image positions/spine/TOC giữ qua Convert+Name, backup/restore and originalSHA roundtrip. Async inflate không tự đảm bảo RAM/cancel bounded: đo/test Worker cancellation.
5. AI-READ2 riêng: >32k chunk by semantic/source bounds with Unicode safety; <=requestcaps effectiveprompt/Names; perchunk STOP only, partial not promoted as fullprose; durablecheckpoint/result cache signature bounded quota, cancellation epoch/dedupe/invalidation, transientretry finite explicit, no unbounded backgroundfanout. Resume currentchunk/result/AIanchor after shelf/reload and stale settings/Name change test; giữ RAW/chapter/canonicalprogress. Không dùng phần này để mở cloud metadata trước review.

Sau code từng scope: npm.cmd test, npm.cmd run build, npm.cmd run test:e2e -- --reporter=line với specs liên quan; race/flake --repeat-each=3 và giữ fail. Backup/storage/atomicity/migration cần model mạnh nhất khả dụng cùng reviewer độc lập chạy targeted regressions + actualdiff; root chạy integratedchecks. Chưa có lệnh test/build trong phiên doc-only, không lấy suite trước nghiệm thu feature mới.

## Nhật ký phiên và bước tiếp theo

- File duy nhất sửa: docs/STORAGE2-IMPLEMENTATION-CHECKPOINT.md, toàn file mới; lý do ghi contract/data boundaries và số đo để AI sau không coi snapshotv1 là lưu trữ đầy đủ.
- Commands: Get-Content/rg đọc workspace+bundledskill+localfflate, Node --version24.14.0 exit0; synthetic node --expose-gc exit0, số đo ở bảng. Một số path suy đoán ban đầu không tồn tại, đã đọc đúng src/db.ts/domain.ts/ui/App.tsx và migrations0003_cloud_book_deletions/0004_cloud_book_albums. Không test/build vì không codechange, không remote verification.
- Review: chưa có independentreview tài liệu/API/migration, chưa triển khai. Root cập nhật HANDOFF/log theo phiên chung để không đụng các file root đang sửa.
- NEXT STORAGE2-1A: chỉ pure originaldescriptor/key/manifest validators + synthetic tests và mocked server reservation/upload/publish spike, khóa invariants ở trên; không remote migration/production/UI upload trước review. Tiếp STORAGE2-1B bounded client upload/download+local checkpoint+UI status, targeted E2E/review. Chốt budget SQL atomicity và đo browser original40MiB trước enable.
- NEXT STORAGE2-META-0: thu hẹp Name riêng sync trước, đo boundedmetadata và chốt CAS/outbox; không giao một task mơ hồ “fullsync tất cả”. EPUB1/AI-READ2/BULK2 là scope tiếp riêng; chưa cam kết toàn bộ hoàn tất hôm nay.

## Review độc lập 09/10/2026 — contract STORAGE2-1A trước code

Reviewer: Codex GPT-6.1-sol/medium, cấu hình do người dùng/root chỉ định; chỉ định này được ưu tiên trước lựa chọn model mặc định trong AGENTS. Chỉ đọc app/server/migrations; phần duy nhất thêm vào tài liệu này là mục review cuối. Không migration/local schema/UI/network upload/deploy hoặc đọc nguồn D. Đây là quyết định triển khai đề xuất và blocker trước enable, chưa phải tính năng đã chạy. Gate independent review actualdiff/targeted regressions cho code backup/storage/migration vẫn bắt buộc; review tài liệu này không thay gate code mới.

Baseline actual: `npm.cmd test -- tests/cloud-library.test.ts tests/cloud-delete.test.ts tests/public-library-review.test.ts tests/cloud-snapshot-review.test.ts tests/cloud-client-review.test.ts --maxWorkers=1`: exit0, 70/5files, 2.45s. Các test server dùng SQLite thật qua Node adapter, R2/transport mocked; không chứng minh runtime R2 thật hay STORAGE2 mới. Đọc server/cloud-library.ts, cloud-device-auth.ts, src/cloud-client.ts, migrations0002–0004 và functions/api/cloud/[[path]].ts. Hai path suy đoán `server/library.ts`/`0002_cloud_books.sql` không tồn tại; đã đối chiếu file đúng, không coi lỗi đọc là kiểm chứng.

### Quyết định phạm vi nhỏ

STORAGE2-1A chỉ contract/validators/key builder + migration D1 đề xuất chưa apply + server reservation/parts/publish spike qua SQLite thật và R2 adapter. Chỉ original TXT tối đa40MiB được người dùng chọn, gắn với cloudbook v1 đã ready; không tạo cloudbook mới từ sidecar, không cloud-only placeholder source, không EPUB/chapterparts/metadata sync hoặc upload tự động. Client UI/chunk/checkpoint là1B. Không đổi bytes/format/API GET/PUT của snapshotv1; oldclient vẫn nhận đúng snapshotv1. Route dispatch phải nhận original routes trước regex `/books/:id` hiện tại; vẫn qua handleCloudDeviceAuth với PUBLIC_LIBRARY=1, không đưa PIN/login/token mới vào UX. Same-origin mutation guard hiện hành được giữ; không đổi quyết định công khai ai có URL đều dùng.

Contract tối thiểu dự kiến:

| Endpoint | Invariant |
|---|---|
| POST `/api/cloud/books/:bookId/originals` | JSON≤256KiB; caller gửi originalId UUID ổn định qua retry, bookSnapshotSHA và declaration đầy đủ. Exact duplicate→200, lần đầu201; same identity khác declaration→409. Book phải ready, snapshotSHA khớp và chưa tombstone trong chính SQL reservation. |
| PUT `/api/cloud/books/:bookId/originals/:originalId/parts/:index` | Chỉ index đã khai báo; body octet-stream, actual bytes đúng descriptor, SHA đúng; cap2MiB. Key server sinh, conditional create; retry chỉ ACK exact stored size+R2 checksum. Không tạo descriptor/charge mới từ PUT. |
| GET `/api/cloud/books/:bookId/originals/:originalId` | Bounded status/declaration; pending trả các verified indices, ready trả canonical manifest+manifestSHA. Không bucket listing hoặc arbitrary object key. Không trả data nếu book tombstone. |
| POST `/api/cloud/books/:bookId/originals/:originalId/publish` | Chỉ exact declaration; kiểm đầy đủ parts và wholeSHA qua stream; immutable canonical manifest, rồi D1 conditional pending→ready. Retry ready trả cùng manifestSHA. |
| GET `/api/cloud/books/:bookId/originals/:originalId/parts/:index` | Chỉ ready original/nondeleted book; lấy đúng key, kiểm size/checksum trước stream và tombstone sau awaited R2get; octet-stream + attachment + nosniff. Filename chỉ header encode an toàn. |

POST declaration gồm bookId/originalId/bookSnapshotSHA, version1/formatTXT, source name/relativePath/encoding, whole bytes/SHA, ordered parts `{index,bytes,sha256}`. Name/path chỉ provenance được validate bounded/control/surrogate/absolute/traversal; không thành object key hoặc URLkey. Không lưu absoluteDpath. V1 chaptertext có thể đã normalized/edited nên sidecarSHA không chứng minh source→chapters cùng bytes; chỉ user association với đúng immutable bookSnapshotSHA. Không quảng cáo tự khôi phục source gốc từ cloudv1 thiếu bytes.

Khóa part policy trong1A: fixed1MiB mỗi part trừ tail; source>0≤40MiB, count=ceil(bytes/1MiB)≤40, indices liên tục0..count-1, tail>0≤1MiB, SUMpartBytes=sourceBytes. Cap2MiB là transport defense, không cho arbitrary fragmentation4096 trong phạm vi nhỏ này. Validators bắt safe integers, SHA64lowerhex, UUID, duplicate/extra/missing indices, newer version và canonical manifestSHA. Metadata canonical được server dựng từ declaration đã validate, serialize deterministic UTF8; không hash raw callerJSON hoặc nhận manifest object key từ client.

### D1 và accounting đề xuất

Hai bảng additive, không sửa row snapshotv1: `cloud_originals` PK(book_id,original_id), book_snapshot_sha, declaration_sha, declaration_json bounded, source_bytes/source_sha, reserved_bytes, manifest_bytes/manifest_sha/object_key, state pending|ready, created_at/updated_at; `cloud_original_parts` PK(book_id,original_id,part_index), declared bytes/SHA, object_key UNIQUE, state pending|verified. FK nếu dùng phải kiểm enable/behavior trong runtime; không coi FK thay tombstone guard. Key namespace tách `originals/v1/{bookUUID}/{originalUUID}/{declarationSHA}/parts/{index}-{partSHA}` và manifestSHA; không crossbook dedupe/refcount/GC ở1A.

Reservation tạo original + toàn descriptor atomically bằng D1 batch/transaction semantics được đo thật; không giữ transaction qua R2/network. Chốt shared budget bằng **cùng expression trong hai writer**: SUM(cloud_books.bytes) + SUM(cloud_originals.reserved_bytes), không lọc pending/ready/deleted. reserved_bytes charge sourceBytes + exact canonical manifestUTF8bytes; phần metadata D1 có cap riêng và không được nói là physical R2 bytes. Nếu chọn charge thêm metadata/quota overhead, ghi rõ khoản dự phòng và dùng giống nhau mọi writer. Part verified receipts không charge lần hai. Retain reservation vô thời hạn trong1A, kể cả failed/canceled/deleted; không có release endpoint hoặc TTL reclaim trước thiết kế quiescence/GC riêng. Reserve per original trong **một SQL conditional write** gồm budget, cloudbookready+snapshotidentity+tombstone guards và proposed cap100 original declarations/book tính tất cả state; retry cùng identity không tăng count. Cap100 giữ giới hạn source selection100files hiện có, không giả40part cap đã giới hạn số original; thay cap cần quyết định rõ trước enable.

Không bật original upload khi server v1 còn chỉ `SUM(cloud_books.bytes)`. Existing v1 ready GET/catalog không cần bảng mới. V1 PUT sau thay budget nếu bảng mới chưa có phải503, không fallback về phép cộng cũ. Trình tự rollout dự kiến: additive migration→mọi v1 writer kiểm shared budget khi originals disabled→enable original writer sau xác minh serving revision. Rollback về bundle chỉ biết v1 budget trong khi originals có reservedbytes sẽ phá9GB invariant; phải cấm rollback đó hoặc giữ nguyên disable-all-storage-write flag cho tới recovery reviewed. Migration local fixture phải giữ nguyên existing cloud_books/auth/tombstones và exact v1 snapshotkeys.

### Blocker có bằng chứng và cách khép

1. **WholeSHA chưa được xác thực bởi partSHA.** Các part hashes đúng không cho phép suy ra hash của concatenation. Current server crypto.subtle.digest gom một snapshot≤32MiB; không tái dùng cách đó với original40MiB. Publish cần incremental wholeSHA và bytecount trên ordered R2 streams (mỗi part bounded), hoặc giữ state chưa verified; không được báo ready/verifiedwhole từ declaration. Cần spike thực workerd hash implementation +40MiB peak/cancel/CPU trước enable; hash-wasm frontend dependency hiện có không chứng minh server runtime tương thích.
2. **R2+D1 không atomic.** D1 descriptor được reserve trước bất kỳ PUT. R2 conditional-create thành công nhưng D1 verified update fail phải retry bằng exact key HEAD/checksum rồi commit receipt; receipt lost không cho tạo key mới. Manifest write thành công nhưng ready update fail vẫn pending; retry reconcile. Chỉ ready state cuối mới public download. Repeatedpublish/idempotence phải bao gồm exact declaration, không chỉ originalId.
3. **Delete hiện chỉ cleanup key books/v1.** cloudBook tombstone là chung cho originals; reservation, verifiedreceipt, publish đều conditional NOT EXISTS tombstone trong mutation SQL và kiểm lại sau R2await. DELETE mới cleanup chỉ descriptor keys được derive/validate đúng book; không tin arbitrary persisted key. LatePUT có thể tạo orphan sau cleanup: GET luôn404/410, retry cleanup exact keys, giữ reservation. DELETE200 là logical deletion; không cam kết physical erase/đã lấy lại budget. Không thêm cloud-delete original làm local-delete source.
4. **Manifest integrity và binary response.** R2 customMetadata riêng không đủ: dùng stored checksums.sha256 +size +derivedkey, và server so wholeSHA trước ready. Client incremental rehash whole download trước final localcommit/export vẫn bắt buộc vì transport/truncation. Không dùng cloud-client.request hiện tại cho binarypart vì helper bắt application/json và timeout120s là toàn request, chưa chunk cancellation/checkpoint. New client adapter cần ContentType/streamcap/currentgeneration riêng, không sửa requestJSON chung để nhận mọi contenttype.
5. **Public administration giữ nguyên.** Ai có URL có thể thêm/xóa/quota-consume theo quyết định user, không ngầm thêm auth như cách chữa quota. Giới hạn request/body/count/budget/deadline vẫn cần; không dựa ownership token để xác định objectkeys. No-secret/no-source logging, errorcodes fixed. Không giả tenant-private với PUBLIC_LIBRARY=1.

Nguồn API đã mở trực tiếp [Cloudflare R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) trong lượt review: conditional PUT không thỏa trảnull; successful write/delete strong consistency; GET body là stream và checksums nằm trong R2Object. Điều này hỗ trợ exact conditional-key protocol, không tạo transaction chung D1/R2 hoặc xác minh khả năng incrementalSHA runtime. Chưa gọi R2/D1 thật.

### Nghiệm thu để bắt đầu implementation1A

Root chốt fixedparts/wholehash/sharedbudget/rollout bằng quyết định tài liệu trước giao code. Fixture SQLite thật cần concurrent v1reservation+originalreservation ngay mép9GB, duplicate declaration conflicts, sameid/no doublecharge, cap/count overflow, tombstone trước SQL/mỗi R2await/conditionalpublish, crash/retry từngboundary; giữ v1 snapshotGET/PUT409/catalog/delete fixtures. Manifest missing/altered part/declaredwhole wrong phải không ready, dù mọi part metadata đúng. Mock-only pass không đóng runtime40MiB/hash gate;1A spike vẫn disabled/not deployed. Không độc lập auditSQL mới vì chưa có SQL/code mới.

Nhật ký reviewer: chỉ append mục này vào docs/STORAGE2-IMPLEMENTATION-CHECKPOINT.md. Unit baseline70/5files exit0 như trên; GET/rg readcode exit0 ở file đúng; một số guessedpaths lỗi đã ghi. Không build lại cho doc-only; build Album trước đó không nghiệm thu STORAGE2. Root giữ HANDOFF/log hiện hành và append checkpoint riêng khi có quyết định.

## Review bổ sung — single-object original thay part assembly cho1A

Root steering sau review: ưu tiên một immutable R2 object/original TXT≤40MiB; surveyagent đang nghiệm thu native Miniflare/workerd40MiB stream+checksum. Reviewer GPT-6.1-sol/medium đã đọc lại server/r2-stream.ts/SourceFile và mở lại official R2PutOptions/Checksums. **Single-object là hướng đề xuất thay thế multipart ở STORAGE2-1A nếu spike cuối đạt**; sections parts/two-tables phía trên là phương án lịch sử, không cộng thêm vào implementation mới. Reviewer chưa chạy/đọc final spike của agent khác, không lấy firstprobe self-report làm nghiệm thu hoàn chỉnh. Không sửa app/schema/migration trong lượt này.

Official [R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) ghi R2PutOptions.sha256 kiểm integrity của received object; checksum được cấp cho put xuất hiện trong returned checksums. Vì vậy single PUT của toàn original có thể offload wholeSHA verification cho R2, không cần server WASM/incrementalhash ghép parts. Phải so object.checksums.sha256 exactly expected +object.size+derivedkey; customMetadata.sha256 riêng không đủ. Không suy ra miễnCPU/quota/productionRAM từ đặc tính này.

### Contract và ledger tối thiểu sau khi spike đạt

- POST `/api/cloud/books/:bookId/originals`: declaration strict version1/formatTXT gồm sourceId UUID ổn định từ local SourceFile.id, bookSnapshotSHA, name/relativePath/encoding, bytes>0≤40MiB và SHA64lowerhex. Exact declaration retry200, first201; cùng(bookId,sourceId) khác descriptor409. Readybook+snapshotidentity+tombstone+budget/count guards trong một atomic reservation. Không source thiếu `dataStatus:missing`, không tạo lại sourceId để né conflict.
- PUT `/api/cloud/books/:bookId/originals/:sourceId/data`: stream binary toànfile của row pending; server sinh `originals/v1/{bookUUID}/{sourceUUID}/{sha256}.bin`; onlyIf.etagDoesNotMatch='*', sha256=row.sha256. ACK sau stored matching checksums/size/key và conditional D1 ready publication. Không riêng publish endpoint/manifestr2/parts table ở1A. Declaration canonical là manifest nhỏ trong ledger, immutable; descriptorSHA có thể dùng để bind exactretry/response, không cần R2manifest riêng.
- GET `/api/cloud/books/:bookId/originals`: list/status bounded theo sourceId, tối đa100 rows/book includingpending để resume theo cả object, không exposekey/bucketlisting. GET `/api/cloud/books/:bookId/originals/:sourceId/data`: chỉ ready+bookready+nondeleted, check returned R2checksum/size/key rồi recheck tombstone sau awaitedget; stream qua FixedLengthStream(row.bytes), binary attachment/nosniff. Không Range/resumepart ở1A.
- Một additive `cloud_originals` ledger PK(book_id,source_id), book_snapshot_sha, descriptor_sha và strict metadata, bytes/SHA, object_key UNIQUE, state pending|ready, timestamps. rows/bytes vẫn giữ sau booktombstone. Count cap100 declarations/book tính allstate; sameidentityretry không tăng count. Không backfill v1 SourceFile giả, không thay snapshotv1bytes/IDs/format.
- Shared quota cùng expression cảv1PUT lẫn originalPOST: SUM(cloud_books.bytes)+SUM(cloud_originals.bytes), mọi trạng thái/tombstoned rows đều tính. Singleobject không có R2manifest nên không reserve/charge phantommanifestbytes; D1metadata capped riêng, không nói sum này là mọi physicalbyte củaD1/R2. OriginalPUT chỉ sử dụng existingreservedrow, không charge lại. Migration/rollout/rollback failclosed trong review trước vẫn áp dụng.

### Gaps phải kiểm bằng native + SQL tests

1. **Knownlength không thay actualbytes guard.** Request Content-Length không đáng tin. Pump stream qua native FixedLengthStream(row.bytes), đếmactualbyte và abortwriter/cancelreader nếu truncated/oversize; checksumfail hoặc streamfail không publish. Không arrayBuffer/chunksconcat40MiB. R2PUT và pump phải chạy đồng thời/backpressure; R2failure/shortcircuit cần kết thúc pump, tránh treo tại writer.write hoặc unhandledreject. Native spike phải gồm đúng40MiB và boundary40MiB+1/truncation/mismatch; Node TransformStream substitute không là bằng chứng nativeknownlength.
2. **Conditionalretry semantics.** R2PUT trảnull khi key đã tồn tại có thể shortcircuit trước khi consume/check retrybody. Khi đó ACK chỉ chứng minh existing immutable object trùng reserveddescriptor qua HEAD checksums/size/key; không báo retrybody đã verified. Hủy/khép requestreader/pump đúng cách. Readyrow retry có thể ACK sau matching storedobject và cancelunusedbody. Existingkey checksum absent/wrong hoặcsizewrong→503, không overwrite/repair tự động. Không dùngetag thay cryptographicSHA.
3. **Object write và publication vẫn không atomic.** Crash sau R2PUT trước D1ready được reconcile bằng exact HEAD/knownkey, rồi SQL update guard all descriptorfields+book ready/snapshotSHA+NOT EXISTS tombstone. Zero row update phải trả503 hoặc410, không trả success từ objectwrite. Requestcancel không tự release/delete committedobject/source; pending state/ledger giữ để sameidentityretry. Không TTL/quotaGC trong1A.
4. **Delete/latePUT.** TombstoneSQL đứng trước exactcleanup của v1 và originals; guard mỗi newreservation/publication, recheck sau R2await. Lateobject may survive crash cleanup nhưng GET blocked và bytes vẫncharged; retryDELETE cleanup chỉ keys derivedfrom ownedvalidatedrows. Nếu uploadcancelled mà khôngtombstone, không xóa object của uploaderđồng thời thành công. Không gọi book/localdelete vì sidecar fail.
5. **Publicanyadmin và v1compat giữ.** Dùng existing PUBLIC_LIBRARY=1/noPIN/no-newauth cùng mutationorigin guard. Route dispatch originalscope trước v1regex, binary adapter tách JSONhelper ởclient1B. Không thay cloud-client32MiB snapshotcap thành40MiB toànJSON. Uploadfailed/truncated/clientcancel giữ localBlob/chapter/Names/prompt/progress và pendingreservation. Singleobject hỗ trợ retry cảfile, chưa chunkresume; ghi rõ giới hạn đó.

Quyết định độc lập: single-object contract giảm đáng kể receipt/manifest assembly states và khép wholeSHA gap của part-only protocol nếu nativechecksumspike cuối xác minh. Cho phép bắt đầu puredescriptor/key/SQLmockspike theo contract này; vẫn chưa enable/migrate/deploy trước actualnewSQL review, v1+originalbudget concurrenttest, tombstoneraces, productionruntime evidence. Không yêu cầu serverWASM để triển khai hướng này. Reviewer chỉ append mục này; không heavytests/browser song songroot và không thay kết quả baseline70 đã ghi.

## Final independent protocol/spike review — 09/10/2026

Codex GPT-6.1-sol/medium actual configured. Đã đọc src/cloud-original-schema.ts, tests/cloud-original-schema.test.ts, tests/original-hash-spike.test.ts, docs/ORIGINAL-HASH-SPIKE.md và code importer/SourceFile; thêm chỉ tests/cloud-original-schema-review.test.ts +append section này. Không app/backend/migration/UI upload implementation, không remote storage/D/key/deploy.

Lệnh actual final: `npm.cmd test -- tests/cloud-original-schema.test.ts tests/cloud-original-schema-review.test.ts tests/original-hash-spike.test.ts --maxWorkers=1` exit0, **82/3files:69 schema +5 reviewer +8 spike**,5.64s. Reviewer chạy thật native spike, không chỉ tin báo cáo agent: single R2object41943040bytes, returnedSHA/HEAD khớp Node reference, observedchunkmax4096, exactretry khôngoverwrite; mismatchednewkey/truncated/oversize khôngđểobject. Existingkey retrywrongSHA bị localnativechecksum reject422 và oldobject unchanged. Direct hash-wasmcompile500 expectedunsupported đúng lỗi codegeneration, khôngsuccessfulserverWASM. WholeR2put~1029ms hostlượt này; parentprocessRSSdelta~33.6MiB khôngWorkerCPU/peak/Android/realR2. Các số đo không làSLA/freequota claim. No timingassertion.

Reviewer5regressions: literalentity+Unicodecombiningexact, literalpercentfilenames, rawUTF8JSONexact16KiB/+1byte, samekey≠exactdeclaration, rejectSourceFileextra/protocolextensions. Phát hiện originalvalidator cũ chặn các literal%2e/%2f/%25/%3a legal trong tênFile Windows dù provenancekhôngdecode; lượt đầu85/3filesexit0 gồm1it.fails ghi lỗi biếttrước, khôngcoi lỗi đóđãfix. Root chọn giữliteralpercent, bỏUNSAFE_ESCAPE và đổi fixtures; reviewer đọcactualsource mới rồi bỏfails, final82positiveallpass. **Supersede escapedpercent rejection trong proposal trước:** khôngURLdecode/HTMLentitydecode/NFC/trim provenance; rawactual../absolute/separator/colon/control/loneUTF16 vẫnreject, keychỉUUID/hash. Currentimporter actual encoding lowercanonical; legacyencodingalias cần clientadapter quyếtđịnhriêng, khôngrewrite SourceFile. Metadata names/path/bytes/encoding khácnhau cóthểcùngkey vì keychỉbook/source/hash; backend bắtbuộc soexactcanonicaldescriptor trước idempotentACK, không lấykeyequals làmidentityequals.

### Cải tiến shared quota: migration-level counter/triggers thay chỉ dựa writer mới

Khuyến nghị concrete cho migration review tiếp: thêm một row `cloud_storage_budget(id=1,total_bytes,budget_bytes=9000000000)`; seedtotal=SUM(cloud_books.bytes)+SUM(cloud_originals.bytes), allrows/pending/ready/tombstoned. CHECKtotal>=0 vàtotal<=budget; migrationphải fail nếu baselinevượtbudget, khôngtruncate/clamp hoặc bỏ pending. Add BEFOREINSERT guard và AFTERINSERT charge cho **cảcloud_books vàcloud_originals**. SQLite serializes guard+charge của statement/transaction, nên oldv1writer vẫn dùngSUMcloud_books bịtriggertừchối khi originals làmsharedtotalvượtcap. Writernew đọccounter để trả507đúng; oldwriter cóthể503generic vì catch hiệnhành, giữintegritynhưngerrorUX chưachuẩn.

Guard chỉ chạy khi NEWidentity chưa córow: cloud_books.id hoặc original(book_id,source_id). BEFOREINSERT củaSQLite cóthểchạytrướcONCONFLICTDONOTHING; không skipexistingidentity sẽ reject exactretrygầnquota dù khôngallocate. AFTERINSERT chỉchargeactualinsert nênduplicate khôngdoublecharge. Guard phải reject nếu budgetrowmissing, không đểNULLcomparison bypass. Existingrowdifferentdescriptor khôngcharge mới và vẫnbackend409exactcompare. Forbid bytes/identity/objectkey immutableupdates; state pending→ready khôngcharge. Không choDELETEledgerrows/releasereservation trong1A; protectcounterrowdeletion/budgetchange hoặc failclosedexplicit. Tombstone chỉmarkbookdeleted/cleanupR2, countertotalgiữ. FutureGC làmigration/designreviewriêng, khôngdecrementblindly. Migration idempotence không reseedcounter thànhSUMv1-only; auditcounterequalsSUMcảtables vàbackfillfixtures bắtbuộc. Foreignkey/tombstoneguards vẫnriêng, quotatrigger khôngthay bookready/identitypublicationguards.

Reviewer đã chạy **prototype transient in-memory SQLite**, PowerShellhere-string pipeto`node`/node:sqlite, exit0:budget10, existingv1=5, original=4; oldwriter INSERT guardedonlySUMv1 attempts2 đượctriggerreject `storage_budget_exceeded`; repeatedv1/originalONCONFLICTDONOTHING khôngcharge, finaltotal9. CóBEFOREguardboth +AFTERchargeboth, skipexistingidentity vàmissingpoolguard. Không tạo migrationfile hoặcDBngườidùng. Đây chỉproofsingleSQLiteprototype, **chưaD1migration/runtime/concurrentconnections/rollback/immutableupdate/deleteguard tests**; khôngbỏ gateSQLactualreview. D1batch seed/triggers atomicity, rollback oldbundlewithtrigger-safe table compatibility và503→507mapping cầnthử trướcenable.

Nextbackendtask rõ: additive reviewedmigration+singleobjectserverhandlers/reservationguards/nativeboundedstream+checksummatching/publication/headreconcile/tombstonedeletecleanup, khôngclientUIyet. Mandatorytests native40MiB/shortcircuitcancel/declaredlengthfail, SQLitequotaold+newwritersconcurrent/duplicate/migrationidempotence, D1writefailafterR2/lateDELETE/GETaftertombstone/exactkeycleanup; existingv1GET/PUT409/catalog/delete/sourcepreservation regressions. Puremodule chưa được app/server gọi; localspike không tính originalcloudfeatuređãdeploy. Rootchạyfullintegration/build/logs saureview, không dùng82này thaycácgatebackendchưacó.

## Checkpoint 09/10/2026 22:25 ICT — code và migration đã kiểm, Pages gate còn chạy
- Supersede proposal fields: actual ledger lưu descriptor_json canonical, sha256/bytes/object_key/state/updated_at; không book_snapshot_sha/descriptor_sha riêng. Identity sourceId bất biến, sách phải ready +nondeleted ở reservation/publication; snapshotv1 không được overwrite. Key và descriptor được đối chiếu từng lần.
- Sharedquota actual cloud_storage_budget(id=1,used_bytes), 9GB hard guard; seed all-state v1+originals, trigger guards trước seed, reconcile chỉ tăng. BEFORE INSERT chống REPLACE identity/key-owner/counterdecrease; UPDATE/DELETE guards vẫn giữ. Reviewer nativeD1/SQLite14 +backend24/legacy13=51positive finalSQL.
- Remote0005 đã áp dụng: first7500 CASE-END parsing error rollback, bọc SELECT(CASE..END) và rerun independent51positive; retry18commands✅. Readonly total70832187bytes khớp SUMreserved,0005marker có. Không đổi secret/AIWorker/compat/Wrangler4.147.
- Backend/client gọi schema thật; boundednative40MiB/R2SHA, streamGET heldtail, crashHEADretry, tombstonecleanupbatch, counter/races đã nghiệm thu riêng. Không multipart/byte-resume/quotaGC/secureerase claim.
- Auto originals sau snapshot chỉ khi GETbooks?features=1 reports originalsV1true. SnapshotACK giữ khi original thất bại; retry sourcewholefile, RAW/BOM/path giữ. Oldserverv1 không gọi original routes.
- StoryDetail có File gốc thu gọn, ưu tiênlocalverified/sourceidentity/currentbook, fallbackcloudready exactdescriptor+SHA/bytes; khôngpersistSource khi tải, không thêm nútSync. Close/unmount bỏkếtquảmuộn, không tức thì abortHTTP; deadline120s.
- Final review GPT-6-astra/medium sauuserinterrupt:42/42repeat3 E2E +58/58 targetedclient/reviewer/integration, no blocker. Root final36repeat3 integration/UI +fullunit/build/diff đang chạy; chưa deployPages từmãSTORAGE.
- Chỉ syntheticfixtures. Không tải corpusD. Androidhardware/CFCPU/peakRAM/20GB chưa kiểm. Metadata CAS/outbox và EPUBspine/images còn scope tiếp theo; originals không giải quyết sync edits.

## Release 10/10/2026 03:31 ICT
- Pagesbb87cd4d/master, index-BEkSBsdn/CSSCRZu. Nativeoriginal API/auto client/FilegốcUI vàcompletedAIcache đã production. Module/schemaactual vàfinalgates tạiHANDOFF;890unit/build92/6streamrepeatE2E, independent53positive finalserverCD2C...
- Actual40MiB firstproduction exposedCPU214msPUT; sharedBYOBreadAtLeast256KiB choGET/PUT/drain giữSHA/count/heldtail. Threeproductionwhole40MiB/count+SHA runs saufix exit0; tinyfreshdeviceUI1280/510exit0. CPU mới/peakRAM không đo; fullimporter32MiBJSONsnapshot maxcap chưaproductionproof.
- MetadataCAS/outbox/EPUBassets/bulkresumecorpus vẫn chưa làm; originalsidecar không giải quyết chỉnhsửa Name/prompt/Album/progress hoặc20GBfree. Khôngclaimrefund/secureerase.
