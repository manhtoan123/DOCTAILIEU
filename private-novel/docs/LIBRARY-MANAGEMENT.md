# Quản lý truyện theo view Album

## Thẻ Album — 02/11/2026

Đã bổ sung xem trước 3 truyện, mở rộng tại chỗ, tìm theo tác giả/tên truyện và Đọc tiếp. Giữ Quản lý/Xong và luồng dữ liệu hiện có. Hành vi, nguồn tham khảo, bằng chứng và phát hành: [Album preview](ALBUM-PREVIEW-2026-11-02.md).

## Điều chỉnh mới nhất — Quản lý/Xong (01/11/2026)

Mặc định ẩn toàn bộ checkbox. Nút Quản lý ở đầu Phòng tối và từng Album bật chọn trực tiếp trên danh sách; nút đổi thành Xong, bấm Xong xóa lựa chọn và ẩn checkbox/thanh thao tác. Đổi phạm vi thư viện cũng thoát chọn; tìm kiếm xóa lựa chọn cũ. Vẫn chỉ Sửa tên (một mục)/Xóa (nhiều mục) sau khi chọn, dialog và dịch vụ dữ liệu không đổi.

Ô tích truyện nằm trong phần riêng trước bìa, không absolute đè chữ. Album ở chế độ chọn tăng bề rộng tối thiểu ô lên260px (giới hạn100% màn hình), tránh checkbox làm tên bị bó quá hẹp. Tắt Quản lý trả về lưới ban đầu. Compact vẫn có checkbox cùng hàng, đủ vùng bấm44px. Không đổi màu hoặc provider/DB/schema.

Tham khảo tiếp [React Aria Selection](https://react-aria.adobe.com/selection): giữ selection theoID và tách thao tác mở khỏi checkbox. Không thêm dependency. Build exit0 tsc client/server+Vite, diff-check0; không viết/chạy test theo yêu cầu, chưa kiểm render thật. Đã deploy Pagesca9b96e6/index-DiDvYMCn.js. GET /phong-toi, /phong-toi?album=PLUTO và asset HTTP200 đúngbundle. Logs .dsh-tmp/library-management-toggle-{build,deploy}.log và release.json. Worker/schema/dữ liệu không đổi.

## Giao diện hiện hành — 01/11/2026, chưa deploy

Theo chốt mới: bỏ nút Quản lý và danh sách quản lý riêng. Ngoài Phòng tối, mỗi Album có ô tích bên cạnh liên kết mở Album; thanh thao tác chỉ xuất hiện khi có lựa chọn, gồm Sửa tên và Xóa. Trong Album, truyện và Album con/Series cũng chọn trực tiếp. Đổi phạm vi hoặc tìm kiếm xóa lựa chọn cũ; ngoài Phòng tối chỉ thao tác Album. Một mục được sửa tên; nhiều mục chỉ được xóa. Hủy chọn bằng chính ô tích. Không thêm thao tác quản lý vào Tủ sách thường.

Dialog chỉ nhận bản chụp IDs/đường dẫn đã chọn. Sửa tên Album tái dùng renameManagedAlbum (giữ cây Series), sửa truyện tái dùng renameManagedBook. Xóa tái dùng previewLibraryDeletion/executeLibraryDeletion không sửa service: Album bao gồm cả cây con, danh sách xác nhận hiển thị tổng truyện và tên từng truyện, cloud ACK vẫn đi trước dọn local. Hủy không xóa dữ liệu. Batch lỗi một phần hiển thị số hoàn tất và yêu cầu chọn lại thay vì gửi lại plan cũ. Không migration, không đổi khóa lưu hay bytes nguồn.

Tham khảo [React Aria Selection](https://react-aria.adobe.com/selection): selection có kiểm soát theo ID ổn định, checkbox tách khỏi thao tác mở, toolbar có điều kiện. Áp dụng checkbox HTML/React state hiện có, không thêm thư viện; không áp dụng chọn tất cả ngoài phạm vi đã xem.

Bằng chứng mới: review độc lập đọc diff cuối đạt; đã sửa finding Album cha suy ra/Album chỉ trên kho không có registry entry: dialog chụp path ảo, chỉ materialize qua service khi bấm Lưu. Build cuối exit0 (tsc client/server + Vite), diff-check0, log .dsh-tmp/library-inline-selection-build.log. Không tạo/chạy test theo yêu cầu trước đó; chưa kiểm render ba theme/Android hoặc mutation dữ liệu thật. Chưa deploy. Các test/deploy dưới đây là lịch sử của giao diện cũ, không phải bằng chứng cho bản này.

Triển khai 29–30/10/2026; tối giản theo phản hồi người dùng ngày 30/10.

Nút **Quản lý** có ở `/phong-toi` và trong từng Album. Album chỉ là view/phạm vi lọc: ngoài Phòng tối hiển thị toàn bộ truyện có Album; trong một Album chỉ hiển thị truyện trực tiếp của Album đó, không kéo theo Series con. Giao diện giống quản lý chương: checkbox từng truyện, chọn tất cả, **Sửa**, **Xóa đã chọn**, xác nhận rồi **Xong**. Không còn chọn, đổi tên hoặc xóa Album trong màn này.

**Sửa** áp dụng từng truyện. Truyện cập nhật metadata title/displayTitle/updatedAt qua đường lưu hiện có, giữ nguồn/chương/tiến độ. Truyện chỉ trên kho được tải về khi người dùng lưu tên.

**Xóa** có bước xác nhận ngắn, hiển thị đúng các tên truyện đã chọn. Preview vẫn lấy catalog mới và khóa chính xác ID; lỗi catalog chặn thao tác, không tự chuyển thành xóa local. Hủy không gửi DELETE hoặc sửa dữ liệu truyện.

Thực thi chỉ xử lý ID đã xem lại. Trước batch kiểm tra Album ID/tên và snapshot local/remote riêng; trước từng DELETE giữ book lock, kiểm tra lại local ownership/metadata và gửi snapshot remote đã xem lại làm điều kiện tại server. Chỉ dọn local sau ACK cloud. Sau ACK kiểm tra lại local trong chính transaction xóa, từ chối bản mới/đã đổi owner hoặc snapshot. Marker `cloud-delete-review` bảo vệ bản cần giữ trước purge nền, kể cả sau reload và khi tác vụ purge đã xếp hàng; marker chỉ được dọn khi local đã mất hoặc xóa thành công. Batch cloud không có tính atomic/undo; kết quả tách số cloud đã xác nhận xóa, số local đã dọn và số truyện hoàn tất. Album chỉ được gỡ khi catalog và local không còn truyện trong cây; registry được kiểm tra và gỡ empty từ dưới lên trong transaction, không kéo truyện/Series mới vào batch.

Để xóa nhiều mục nhanh hơn, sau kiểm tra snapshot ban đầu, tối đa 4 truyện được xử lý đồng thời; mỗi DELETE vẫn mang snapshot precondition để server từ chối nếu metadata/bytes đã đổi. Mỗi truyện chỉ dọn local sau ACK riêng. Khi một mục lỗi, không lấy thêm mục mới khỏi hàng đợi; các mục đã chạy đồng thời được chờ hoàn tất và ghi nhận chính xác, còn việc gỡ Album bị bỏ qua. Thực thi chỉ tải catalog một lần thay vì tải lại trước từng truyện. Cách giới hạn concurrency tham khảo mô hình của [sindresorhus/p-limit](https://github.com/sindresorhus/p-limit); triển khai bằng worker pool nhỏ tại chỗ, không thêm dependency.

Kiểm tra tối ưu batch: `npm.cmd test -- tests/library-management.test.ts` — 18/18 pass, gồm regression concurrency tối đa 4 và đúng một catalog read trong execute. `npm.cmd run build` pass khi dùng `.dsh-tmp` cho TEMP/TMP; lần build đầu gặp lỗi Windows Access Denied khi esbuild dọn temp hệ thống. Chưa benchmark trên kho/mạng thật và chưa deploy thay đổi này.

Khi tải bản chỉ trên kho để đổi tên, snapshot file bất biến có thể chứa tên/Album cũ. Chỉ bản vừa thêm mới được reconcile metadata từ catalog mới đã kiểm tra: CAS với `shared-download-baseline`, kiểm capacity Name sau khi thử đổi metadata trong cùng transaction (vượt giới hạn rollback), rồi mới đổi tên yêu cầu. Bản local có sẵn hoặc bản vừa có chỉnh sửa đồng thời không bị ghi đè bởi bước này. Bytes/SHA/đường dẫn nguồn, chương và tiến độ không được viết lại.

## Nguồn tham khảo và điều chỉnh

[TanStack Table v8: Row Selection Guide](https://tanstack.com/table/v8/docs/guide/row-selection) và [mã nguồn TanStack Table](https://github.com/TanStack/table) hướng dẫn quản lý selection có kiểm soát theo ID dữ liệu ổn định. Áp dụng React state lưu book ID và đường dẫn Album (registry ID được đóng băng trong preview), không dùng chỉ số hàng. Triển khai bằng checkbox HTML và component Modal sẵn có, không thêm dependency. Catalog và ràng buộc bytes/SHA/cloud ACK của ứng dụng quyết định luồng xóa; tài liệu TanStack không phải bằng chứng an toàn dữ liệu.

## Kiểm tra và giới hạn

- Targeted unit: `npm.cmd test -- tests/library-management.test.ts tests/album-registry.test.ts tests/album-registry-review.test.ts` — 42/42 pass; `.dsh-tmp/library-management-unit.log`. Bao phủ remote-only, dedupe/subtree, snapshot thay đổi, fail ACK giữ local, partial completion, import đồng thời giữ Album, rename nguồn/progress/Series lồng, immutable metadata cũ và Name capacity rollback. Ca 20.001 Name dùng projection query tổng hợp với membership và transaction IndexedDB thật; không phải benchmark nhập 20.001 hàng.
- `npm.cmd run build` — pass với TEMP/TMP riêng `.dsh-tmp/chapter-runtime`, app/server typecheck và Vite; bundle `index-CbtBSNVs.js`, log `.dsh-tmp/library-management-build.log`. Hai lượt lỗi trước (server TextDecoder type và Windows esbuild TEMP AccessDenied) có log riêng, đã xử lý.
- E2E lượt đầu: **10/10 fail**, app trắng sau mở Quản lý. Trace xác nhận `ReadOnlyError`: `getAlbumRegistry()` có ghi registry được gọi trong `useLiveQuery`, không được phép trong transaction quan sát chỉ đọc. Đã tách đọc registry sang `readStoredAlbumRegistry()` và discovery sang effect độc lập; **đang chờ build/E2E kiểm lại bản sửa**, chưa coi luồng UI đạt. Log lượt lỗi `.dsh-tmp/library-management-e2e.log`, trace trong `.dsh-tmp/document-results/`; ảnh chẩn đoán `.dsh-tmp/management-failure.jpeg`.
- `e2e/library-management.spec.ts` gồm root và trong Album, đổi tên giữ nguồn/tiến độ, hủy preview, lỗi ACK giữ local, ACK thành công chỉ xóa lựa chọn, ACK→đổi owner giữ local qua purge/reload, cùng selected/disabled/focus/preview đủ Trắng/Giấy/Tối trên desktop và Android mô phỏng. Fixture dùng native IndexedDB và chặn/fulfill toàn bộ `/api/**`; không dùng hoặc xóa dữ liệu thật. Kết quả cuối sẽ cập nhật sau lượt chạy lại.
- Chưa xác minh Android thật, kho thật, lỗi mạng thật giữa các pha hoặc dữ liệu người dùng. Không commit/push/deploy trong công việc này.

## Nghiệm thu 30/10/2026

Đã sửa lỗi observer ghi từ liveQuery bằng observer chỉ đọc + effect reconcile riêng; ca mở modal thực đã pass. Chặn retry đổi tên Album khi local giữ đường dẫn cũ sau materialization thất bại. Sau ACK đúng ID, lỗi lưu ACK local được báo riêng là cloud đã xóa/local còn giữ, không báo nhầm cloud0.

Bằng chứng: targeted 52/52 pass trước bản vá chỉ báo pha; scoped regression cuối37/37 pass gồm client ACK, management17, guard4, clientreview7, native HTTP5. Review độc lập20/20 cho fix observer/retry;21/21 cho phase ACK. Full root2670pass/6fail/218files,2unhandled errors ở testAI ngoài phạm vi; không khẳng định toàn bộ suite xanh. Ảnh Trắng/Giấy/Tối desktop/mobile và luồng chính10/10E2E đã pass; lượt release cuối bổ sung quota sau ACK được ghi HANDOFF-LOG. Android thật/kho dữ liệu thật chưa thử; browser test chặn mọi /api, không xóa dữ liệu người dùng.

Đối chiếu [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html): conditional INSERT...SELECT...WHERE và ON CONFLICT giữ tombstone idempotent. Dùng điều kiện owner/title/source đã xem ngay trong một statement ghi,409 khi stale; DELETE không body cũ giữ tương thích. Nguồn tham khảo không thay thế 5 runtime HTTP/workerd regression của dự án. Không migration hoặc dependency mới.

### Release cuối

Pages production **bca36aef**, bundle **index-COmG6w7C.js**, ngày30/10/2026. App/server typecheck+Vite pass; E2E cuối **12/12 pass14,8s** desktop/Android mô phỏng cho luồng chính, postACK ownership, postACK receipt quota và Trắng/Giấy/Tối. Build/E2E logs: `.dsh-tmp/library-management-release-build.log`, `library-management-release-e2e.log`. Full run trước bản vá báo pha:2670pass/6AI-fail +2AI unhandlederrors; sau bản vá dùng regression37/37 và reviewer21/21 như phạm vi thay đổi, không lặp toàn suite. Không deployWorkerAI/đổi cấu hình/bindings/migration. Smoke online cuối xem HANDOFF-LOG và `library-management-production.log`, dữ liệu tổng hợp, chặn mọi API, không dữ liệu thật. Quy tắc cũ về quota/khả năng tải file vẫn áp dụng; không benchmark thư viện lớn/Android thật.

## Deploy 01/11/2026 — bản tổng hợp đã phát hành
Pages **1ea43d81**, asset **index-DDP66Cv4.js**; AI Worker **9f48a8f1-a14c-4841-abec-6e2ab871aeb1**. Deploy exit0. GET production /, /phong-toi, /r/10019/1 và JS asset HTTP200, đúng asset mới; /epub-bridge-v2.js HTTP200 và SHA khớp file build. Logs .dsh-tmp/nov01-final-{worker-deploy,pages-deploy}.log và nov01-final-release.json. Không chạy test/E2E, gọi AI/TTS thật hoặc sửa/xóa dữ liệu người dùng. Bằng chứng GET xác nhận phát hành, không thay cho kiểm chứng thao tác thực tế. Các ghi chú chưa deploy phía trên mô tả trạng thái trước lần phát hành này.
