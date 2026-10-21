# Original TXT — whole SHA / streaming spike

09/10/2026 12:30 ICT. Codex subagent GPT-6.1-sol/medium theo actual dispatch metadata của root. Phạm vi: chỉ tests/original-hash-spike.test.ts và tài liệu này. Không app/server/migration/dependency upgrade, D/secrets/network/remoteR2/deploy. Đọc workers-best-practices SKILL.md và runtime-patterns local; dùng versions installed và compatibilityDate2026-01-01 giống native-stream-review.test.ts. Chưa enable tính năng giữ original cloud.

Installedversions đã kiểm: hash-wasm4.12.0, Miniflare5.20261001.0-alpha, workerd1.20261001.1, esbuild0.28.2. Root đã đối chiếu tài liệu hiện hành [R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/): R2.put option sha256 kiểm received whole object và returnedchecksums; FixedLengthStream cung cấp knownlength cho R2.put stream. Subagent không browse lại theo giới hạn phiên; bằng chứng dưới dùng installed local workerd/R2 simulator, không production Cloudflare.

## Kết quả và quyết định đề xuất

**Ưu tiên original TXT40MiB: một object immutable, upload request streaming vào R2.put với native wholeSHA**, FixedLengthStream declaredbytes + bytecountguard; v1 text snapshot vẫn immutable riêng. Nativechecksum đã đáp ứng nhu cầu whole-source verification mà không cần serverWASM/save-load/ordered part assembly. Client vẫn hash incremental/chỉ giữchunk và SHA trước upload; manifest sidecar chỉready sau R2checksums/size/identity verified và tombstone/budget guards. Interrupted upload có thể retrywholefile40MiB; chưa gọi đó là byte-resume. Chapterparts cho snapshot lớn và EPUBassets là scope riêng, không suy ra được từ testoriginal này.

Local workerd R2.put40MiB hợp lệ thành công, seen41943040, SHAreturned và HEAD khớp Nodecrypto, streamchunkobserved tối đa4096bytes. Exactretry với onlyIf etagDoesNotMatch '*' không overwrite, HEAD size/SHA exact xác nhận. Newobject wrongSHA bị reject và HEAD không có object. Truncated/oversize actual stream so declaredlength bị reject và không để object. Existingobject retrywrongSHA bị nativechecksum reject trước conditionalmiss, giữ existingbytes/hash.

**Không dùng direct hash-wasm4.12 server như hiện tại:** runtime `/wasm` trả500 `CompileError: WebAssembly.compile(): Wasm code generation disallowed by embedder`. Đây là probe báo khả năng, không appfailure. Test-only staticWASM adapter từng được soạn nhưng chưa chạy và đã bỏ khi root xác định nativeR2 checksum đủ; không giả đã chứng minh staticWASM trên Workers. Không monkeypatch CSP hoặc dependency.

Node hash-wasm save/load qua freshinstance ở mỗi0.25MiB và1MiB boundary, whole40MiB khácbytesperpart khớp Nodecrypto; savedstate116bytes, đều<1024. Corruptalgorithm prefix bị loadreject; duplicate/reorderedpart thay hash, chứng minh save/load không cung cấp dedupe/order validation. Nếu sau này multipart thật cần state servertrusted/checkpointCAS+cursor+operation identity, versionpin và checksumcontent, không tin state phía client. Library README cảnh báo state có thể chứa plaintext; không log/store công khai state hoặc coi state là secret-free metadata.

## Số đo lượt cuối

| Phạm vi | Wall-time ms | State/chunk | Parentprocess memory delta |
|---|---|---|---|
|Node0.25MiB hash/init/load/save|median0.858; min0.806/max14.155|state116bytes|heap+4005816; RSS+90099712bytes|
|Node1MiB hash/init/load/save|median3.286; min3.121/max5.101|state116bytes|heap−5918784; RSS−5992448bytes|
|NativeR2 first40MiB streamedput incldispatch/JSON|1061.217|observed readchunk4096bytes|parentheap−2306672; parentRSS+32735232bytes|

Đây là wallclock một host/lượt và Nodeparent GC/allocator noise, không WorkerCPU, không peakRAM, không Android, không budgetCF10ms. Miniflare nativeput thực nhưng R2storage local mô phỏng, backend maybuffer internally; readchunkbounded không chứng minh processpeakbounded. Không assert timing thresholds trong tests. Cần đo productionfixture tối thiểu sau review+authorization nếu cần chứng minh realCPU/quota/performance; không upload nội dung thật để đo.

## Test invariant và giới hạn quyền

Fixture generated theo chunk, không giữ full40MiB buffer trong testcaller. NativeWorker testentry bundledinmemory bằng installedesbuild; onlylocal R2bindingBUCKET, khôngD1auth/migrations. R2.size/SHA từ native checksum và Node reference; không chỉ customMetadata. Stream pump và put settle trước response, pipe errors abort/cancel peer; exactconditionalretry dựa HEADknownobject, không earlysuccess chỉ từ nullput. Không đây là production module hay APIs đã có.

Phần spike không test concurrentbudget/tombstone/localatomicrestore/originalmanifest/schema/endpointauth/cancellationdisconnect/latepublish races hoặc realdata. Những guards phải được implement/review/test ở scopeSTORAGE2-1, giữ cloud-delete trước local-delete, sourceBlobSHA/bytes, no staleACK/no silentoverwrite, không autoimportD. Global noPIN/publicendpoint quyết định user giữ.

Lệnh tại private-novel/: `npm.cmd test -- --maxWorkers=1 tests/original-hash-spike.test.ts`.

- Lượt12:29:09 exit1:7pass/1fail,4.94s. Toàn40MiB upload/exactretry/checksummismatch/trunc/oversize và Nodehash đãpass; solefail nativewrongSHA retryexpected409 nhưng actual422 vì checksumvalidation trước condition. Giữ fail này, không đổ lỗi model.
- Sửa đúng invariant spike: wrongchecksum retry phải bịreject và existingobject không đổi; ghi nativeactual422, không gán API409. Lượt12:29:32 exit0:8/8pass,5.18s. No timingassertion.
- DirectWASM500 là khả năng unsupported đã đo và expectedprobe, không successfulserverWASM. Nodecheckpoint hashes thật chạy, không mock.
- Build đầu exit1 TS2322: DOMReadableStream fixturebody không khớp Miniflare/Undici BodyInit type. Sửa caller thành asyncgenerator Uint8Array64KiB supportedBodyInit, không typecast. `npm.cmd run build` sau sửa exit0: app/serverTS và Vite88modules, bundle520.69kB warning>500kB hiện hành; không deploy. Rerun targeted12:31:32 exit0:8/8pass,5.46s với bodygenerator, số đo cuối ở bảng.
- Test tích hợp và independentreview root phải chạy riêng; không lấy suite650 hoặc buildtrước khi thêmfile làm bằng chứng phạm vi mới. Không E2EUI vì không UIchange.

## Phạm vi tiếp theo cụ thể

STORAGE2-1 implementationcontract nên dùng wholeoriginalobject≤40MiB thay orderedpart machinery cho bước đầu. Serverdescriptorvalidator+keybuilder+boundedstream/nativechecksum+sharedquotareservation+tombstoneguard+conditionalpublish+headreconcile; tablemanifestoriginal mới additive (review SQL), không overwrite v1 snapshots. SourceoriginalwholeSHA/bytes; nofalseACK nếu workercrash sauput nhưng trướcready. Separate clientcheckpoint có trạng thái pendingready/error; retrywholebytes nếu fail, không byte-resumeclaim. Tests independent bắt buộc crash/retry/cancel/delete+PUT/publish/concurrentbudgetv1original and identical/mismatchkeys, unchangedlocalbytes/v1fallback.

Nếu chương hoặc original vượtcap trong tương lai mới orderedparts/checkpoint/CAS hoặc R2multipartspike mới. EPUBspine/images/sanitization và AI>32k/persistentcache/resume giữ scope riêng. Không nhận phiên này đã hoàn tất fullR2/originals/multidevicesync.

Nhật ký perfile: tests/original-hash-spike.test.ts mới8cases (Nodecheckpoint/reference/incompatibility/replay/order +nativecompileprobe+nativeR2stream/retry/checksummismatch/length), docs/ORIGINAL-HASH-SPIKE.md mới results/limits/nextcontract. Model/giờ/phạmvi/invariant/lệnh/exit/fail/reviewlimits ghi tại đây; root appendHANDOFF-LOG và cập nhật HANDOFF/DECISIONS phiên chung, tránh writerconflict. Không sửa docs/STORAGE2-IMPLEMENTATION-CHECKPOINT.md đang do reviewer quản lý.
