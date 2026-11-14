# Chỉ mục tài liệu

Đọc [HANDOFF hiện hành](../../HANDOFF.md) trước, sau đó chọn đúng chủ đề bên dưới. Ngày và kết quả kiểm thử trong từng tài liệu chỉ áp dụng cho lần kiểm được ghi; không phải bằng chứng bản hiện tại đã được kiểm lại.

Rà soát hiện hành: [lỗi tích lũy qua các bản deploy — 26/10/2026](RELEASE-REVIEW-2026-10-26.md).

Rà soát thay đổi gần đây: [hồi quy AI/TTS/cache/tên TXT — 02/11/2026](REGRESSION-AUDIT-2026-11-02.md).

Rà soát code web và ý tưởng GitHub: [so sánh hiện trạng và cơ hội cải tiến — 14/11/2026](WEB-CODE-GITHUB-IDEAS-REPORT-2026-11-14.md). PWA shell: [phạm vi, update lifecycle và nghiệm thu](PWA-OFFLINE-SHELL-M0.md). Hiệu năng Album: [gom nhóm theo cây và benchmark](ALBUM-GROUPING-PERF.md).

## Hướng dẫn sử dụng và phát triển

- [Chạy ứng dụng](../README.md), [bản đồ code](../src/README.md), [scripts](../scripts/README.md).
- [Hướng dẫn sử dụng](USER-GUIDE.md), [hướng dẫn học dự án](PROJECT-LEARNING-GUIDE.md).
- [Quy tắc làm việc](../../AGENTS.md), [chỉ mục phạm vi](../../WEB-READER-IMPLEMENTATION-PLAN.md).

## Tra cứu theo tính năng

| Chủ đề | Tài liệu đầu vào | Tài liệu chi tiết khi cần |
|---|---|---|
| Giao diện đọc gọn | [Tủ sách, nhập, thông tin truyện và cài đặt](QUIET-UI.md) | Đường dẫn Album, tìm kiếm, điều hướng và bằng chứng kiểm tra |
| Mở app và truyện đã lưu khi offline | [PWA app shell](PWA-OFFLINE-SHELL-M0.md) | Chỉ cache shell/versioned assets; không cache API, dữ liệu truyện hay sync |
| Nghe trong lúc AI streaming | [Nghe streaming TXT](AI-STREAMING-LISTEN-2026-11-02.md) | Đọc đoạn đã đóng, tự chờ/nối theo thứ tự khi bản dịch đổi; EPUB chỉ prefix đã kiểm tra |
| Đổi model giữ chương đã dịch | [Giữ cache hoàn tất](AI-COMPLETED-CHAPTER-REUSE-2026-11-02.md) | Auto/Fixed/model mới chỉ áp dụng khi chưa có bản hoàn tất tương thích; không tái dùng từng phần khác model |
| Gemma 4 31B chậm/lỗi | [Nghiên cứu 02/11](GEMMA31-RESEARCH-2026-11-02.md) | Đối chiếu tài liệu Google, lượt2357ký tự/214,3s và khoảng trống telemetry; chưa đổi cấu hình |
| Đồng bộ lỗi chữ/tên quá dài | [Metadata cloud thống nhất](CLOUD-METADATA-COMPATIBILITY-2026-11-01.md) | Tên 1.000 ký tự, migration0018 và lỗi ghi rõ trường/độ dài; giữ nguyên dữ liệu |
| Chữ Hán còn sót và nghe sách | [Sửa đúng cụm chữ Hán](AI-HAN-REPAIR-2026-11-01.md) | Sửa trước khi chấp nhận phần dịch; giữ cache/vị trí nghe cũ, cùng model/key/lease |
| Dư chữ 的 trong Convert | [Lọc đuôi 的 bị lặp nguyên văn](CONVERT-CHINESE-RESIDUE.md) | Chỉ bỏ sau tên Latin/dấu đóng khi kết quả trùng nguyên văn; không xóa trợ từ theo từ khóa toàn cục |
| Sửa Auto và xem lỗi/thời gian từng model | [Lịch sử lượt dịch](AI-REPAIR-AND-TIMELINE-2026-11-01.md) | Warm pin, chuyển provider, trạng thái lỗi thật và lịch sử request riêng từng chương |
| Key lỗi theo model, Groq dự phòng, reload chương | [Loại trừ key–model](AI-KEY-MODEL-EXCLUSION-2026-11-01.md) | Bảng0017, phân loại403/404, Groq sau2.5 và fallbackSPA cho URL đọc |
| Tự động hạ model hoặc cố định model | [Hai chế độ AI](AI-DUAL-MODE-2026-11-01.md) | Hai nút chọn, thứ tự dự phòng, lưu lựa chọn độc lập với prompt; pin cùng model sau phần hoàn tất |
| Sắp xếp mọi model dự phòng | [Thứ tự model dự phòng](AI-FALLBACK-ORDER-SETTINGS.md) | Danh sách toàn bộ model ở Cài đặt → Dịch AI; kéo thả và lưu dùng chung trên thiết bị |
| Khôi phục CapCut, model cố định, Groq | [Khôi phục web 01/11](WEB-RECOVERY-2026-11-01.md) | Chẩn đoán production, retry cùng model, pool key server và phương án tách hai web riêng dữ liệu |
| Chọn/sửa/xóa truyện và Album | [Quản lý Phòng tối](LIBRARY-MANAGEMENT.md) | Xem lại ID, giữ cây Series, cloud ACK trước local; trạng thái nghiệm thu trong tài liệu |
| Xem trước truyện trong Album | [Thẻ Album và tìm kiếm](ALBUM-PREVIEW-2026-11-02.md) | 3 truyện trước, mở rộng 12; 2/1 cột; ưu tiên đang đọc; ô tích khi Quản lý |
| Hiệu năng danh sách Album | [Gom sách theo đường dẫn Album](ALBUM-GROUPING-PERF.md) | Index một lượt theo mọi Album tổ tiên; có kiểm tra cây legacy và microbenchmark tổng hợp |
| Lọc quảng cáo lúc nhập | [Quy tắc lọc và bảo toàn nguồn](IMPORT-ADVERTISING-CLEANUP.md) | Tên/chương TXT, EPUB, PDF, DOCX; chỉ nhận diện rõ; giữ original và sách cũ |
| Trau chuốt Convert | [Prompt riêng, thay Convert](CONVERT-POLISH.md) | Công cụ → Trau chuốt bản Convert; bản hoàn tất thay Convert để đọc/nghe; giữ nguồn |
| Convert/tra Name cục bộ | [Chỉ dùng từ điển trên máy](LOCAL-CONVERT-ONLY.md) | Bỏ nhánh máy chủ trong Reader và khung chọn cụm từ |
| Cài đặt, prompt và thao tác tủ sách | [Thống nhất cài đặt](SETTINGS-UNIFIED-UX-PLAN.md) | [Danh sách prompt](PROMPT-LIST-1.md), [giao diện AI](AI-UNIFIED-UI-1.md) |
| Nhật ký và dữ liệu cải tiến dịch AI | [Nhật ký dùng chung và kế hoạch đo đạc L1–L4](AI-LOG-M0.md) | V1 deploy28/10; L1–L4 đã triển khai/deploy29/10, xem bằng chứng và giới hạn trong tài liệu |
| Liên kết Album, truyện và chương | [Liên kết thật và tab mới](NATIVE-NAVIGATION-LINKS.md) | Chuột phải/Ctrl+click/chuột giữa; Album con giữ vị trí trong URL |
| Tên truyện, chương và tên file TXT | [Lưu tên hiển thị](TXT-PERSISTED-TITLES-PLAN.md) | [Bổ sung chương từ TXT](TXT-APPEND-1.md), [chia chương](CHAPTER-SPLIT-2.md) |
| TXT tự nhận diện | [Tự chọn encoding và tiêu đề dính](TXT-AUTO-READING.md) | Một file/lô/folder/tuyển tập/cập nhật; giữ nguồn gốc và bước xem trước |
| Sửa/xóa chương tại mục lục | [Thiết kế sửa, xóa và khôi phục](CHAPTER-EDIT-DELETE-DESIGN.md) | Đã triển khai bản tối giản 21/10; giữ chương để khôi phục, xem hợp đồng trong thiết kế |
| Nhập nhiều file và thư mục | [Kho truyện lớn](BULK-LIBRARY-PLAN.md) | [Bộ chia chương](CHAPTER-REPAIR-M0.md) |
| Một TXT chứa nhiều truyện | [Nhập tuyển tập](ANTHOLOGY-IMPORT-1.md) | Xem/sửa mốc truyện rồi chia chương trong từng truyện |
| EPUB | [Nhập EPUB](EPUB-IMPORT-2.md) | [Reader EPUB](EPUB-READER-3.md), [file lớn](EPUB-LARGE-1.md), [bìa](EPUB-COVER-1.md) |
| Sửa Name không tải lại tài liệu | [Cập nhật tại chỗ](EPUB-LIVE-NAME-UPDATE-2026-11-01.md) | Dùng chung EPUB và PDF/DOCX đã nhập; giữ iframe, CSS và tài nguyên gốc |
| PDF / DOCX có ảnh | [Nhập tài liệu thành truyện](PDF-DOCX-IMPORT.md) | Chọn nhiều file, mỗi file một truyện; chia theo tiêu đề chương, giữ ảnh/gốc; xem trước và trạng thái deploy trong tài liệu |
| Convert và Name | [Name STV](NAME-STV-2.md) | [Đồng bộ Name](NAME-SYNC-1.md), [hình ảnh Name](NAME-IMAGE-1.md), [Convert → AI](CONVERT-AI-NEXT-1.md) |
| Thêm Name từ đoạn AI của TXT | [Kế hoạch tái sử dụng công cụ Name](AI-TXT-NAME-EDIT-PLAN.md) | Đúp đoạn AI → cụm Convert → lưu Name; giữ bản AI/TTS, dùng mốc nguồn khi có và đối chiếu gần đúng cho bản cũ |
| Name chung theo Album tác giả | [Phạm vi và bảo toàn dữ liệu](ALBUM-NAMES-M0.md) | Dùng chung qua series; truyện ngoài Album giữ kho riêng; xung đột cũ chờ chọn, UI tìm/phân trang/bulk |
| Wiki nhân vật export/import cùng Name và prompt riêng | [Roadmap đề xuất](CHARACTER-WIKI-ROADMAP.md) | Nhân vật, quan hệ/xưng hô theo thời điểm, quy ước thể loại, thế giới truyện và nguồn dữ kiện; chưa xếp lịch/triển khai |
| Convert từ điển trên OCI | [Hướng dẫn và giới hạn](OCI-CONVERT.md) | [M0](OCI-CONVERT-M0.md), một profile TXT qua mTLS, giữ chỉ mục trong RAM, local chọn riêng. Chưa deploy |
| Convert cụm qua Worker/D1 (lịch sử) | [M0 thử nghiệm](SERVER-CONVERT-FREE-M0.md) | Thử nghiệm tra cụm Name trước khi [chuyển về local](LOCAL-CONVERT-ONLY.md) |
| Dịch AI | [Kế hoạch dịch](AI-TRANSLATION-PLAN.md), [dịch song song](AI-PARALLEL-PLAN.md) | [Dịch cả chương](AI-WHOLE-1.md), [hybrid](AI-HYBRID-HALVES-PLAN.md), [prompt nửa sau](AI-HYBRID-PROMPT-2.md) |
| Cấu hình AI thực dùng và thử prompt | [Phạm vi và kiểm chứng](AI-EFFECTIVE-CONFIG-M0.md) | Metadata theo bản dịch, nhiệt độ theo khả năng model và fallback; A/B thủ công tại Cài đặt → Dịch AI & Prompt |
| Hiệu suất dịch AI | [Chia theo output và đọc/nghe sớm 26/10](AI-LATENCY-RESEARCH-2026-10-26.md) | Plan mới theo output; giữ checkpoint cũ; lease mở slot2 khi an toàn; prefix child hoàn chỉnh và nối audio không lặp; số đo API thật chưa xác minh |
| Lỗi dịch, streaming và key | [Retry UX](AI-RETRY-UX-PLAN.md) | [Stream](AI-ACTIVITY-STREAM-1.md), [phục hồi](AI-RECOVERY-3.md), [pool key](AI-KEY-POOL-PLAN.md) |
| Tiến độ đọc và dịch sẵn | [Tiến độ AI](AI-READING-PROGRESS-1.md) | [Dịch sẵn](AI-READING-PRELOAD.md), [capacity/fallback29/10](PREWARM-CAPACITY-FALLBACK-2026-10-29.md) |
| Nghe sách | [Hoàn thiện TTS](TTS-COMPLETION-PLAN.md) | [Gateway](TIKTOK-TTS-GATEWAY.md), [giữ phiên nền](TTS-MEDIA-KEEPALIVE-M0.md), [mất mạng](TTS-NETWORK-RESUME-1.md), [phục hồi phát](TTS-PLAYBACK-RECOVERY-1.md) |
| CapCut v2 và phục hồi nghe sách | [Kết nối phiên](CAPCUT-TTS-SETUP.md), [cache/bộ đệm/phục hồi](TTS-AUTONOMY-M0.md) | Đã bật 10 giọng Việt, cache audio riêng, tối đa 3 request, giữ mốc và Dừng; chưa có cầu nối đăng nhập lại từ điện thoại, chưa xác minh Android nền |
| Reader và điều hướng | [Kế hoạch Reader/AI 24/10](UI-READER-UX-PLAN.md#ke-hoach-reader-ai-2026-10-24), [URL số](NUMERIC-READER-URL-M0.md) | D1–D2 và phần tách UI của D6 đã làm; D3–D5/controller chưa làm. URL theo vị trí mục lục, link cũ còn dùng; đề xuất UX0 trong cùng tài liệu là việc tiếp theo |
| Đồng bộ, lưu trữ và sao lưu | [Đồng bộ chỉnh sửa](SYNC-ALL-1.md), [giảm đọc D1](D1-DELTA-1.md) | [Sao lưu](BACKUP-GUIDE.md), [kiểm TTS và khôi phục](TTS-BACKUP-STABILITY-1.md), [checkpoint lưu trữ](STORAGE2-IMPLEMENTATION-CHECKPOINT.md), [R2](R2-SETUP.md) |
| Triển khai | [Hướng dẫn AI](AI-DEPLOY-GUIDE.md) | [Checklist phát hành](RELEASE-CHECKLIST.md); kiểm tra cấu hình thực tế trước khi dùng lệnh cũ |

## Trạng thái cần phân biệt

- **Hiện hành:** [HANDOFF](../../HANDOFF.md) ghi trạng thái triển khai và giới hạn mới nhất; [AGENTS](../../AGENTS.md) quy định cách làm việc.
- **Kế hoạch gần nhất:** [Settings](SETTINGS-UNIFIED-UX-PLAN.md) đã triển khai theo ghi nhận 18/10; [tên TXT](TXT-PERSISTED-TITLES-PLAN.md) đã triển khai theo ghi nhận 17/10. Đây là hồ sơ thực hiện, không phải backlog tự chạy lại.
- **Còn kiểm thực tế:** TTS khóa màn hình Android và zoom thủ công theo [kế hoạch Settings](SETTINGS-UNIFIED-UX-PLAN.md). Giả lập viewport không thay thế Android thật.
- **Lịch sử:** [STATUS.md](STATUS.md), [ưu tiên STV cũ](../../STV-FEATURE-PARITY-PLAN.md), audit/validation có ngày và các bản trong `archive/`. Chỉ đọc khi cần truy nguyên.
- **Nhật ký chuẩn:** [HANDOFF-LOG ở gốc](../../HANDOFF-LOG.md), [DECISIONS ở gốc](../../DECISIONS.md). Các file cùng tên trong `docs/` giữ lịch sử cũ.

## Chuẩn bị bản Android

- Giữ React/Vite làm phần giao diện chung. Khi làm APK, đóng gói thư mục build vào app để Reader có thể mở ngay khi mất mạng. Thử nhập TXT/EPUB, mở Reader và Convert trên Android thật trước khi mở rộng. [Quy trình Capacitor](https://capacitorjs.com/docs/basics/workflow)
- Dùng lại engine Convert local. Có thể chuẩn bị bộ từ điển được phép đóng gói để bỏ thao tác nhập thủ công. Đo lần Convert đầu và RAM trước khi quyết định biên dịch trước chỉ mục. Dịch AI và tạo audio mới gọi gateway hiện có khi có mạng, với cấu hình API riêng cho APK. Khóa vẫn ở server.
- Lưu bản chữ và audio đã tải theo chương, phiên bản nội dung và giọng trong kho ngoại tuyến riêng. Chuyển dữ liệu Chrome sang APK qua xuất/nhập có chọn lọc. Nghiệm thu bằng chế độ máy bay, mở lại sau khi đóng app và nghe qua chương đã tải.

## Đặt tài liệu mới

1. Bổ sung tài liệu hiện có nếu cùng tính năng; tránh tạo thêm một kế hoạch tổng hợp trùng nội dung.
2. Tài liệu tính năng ghi ngày, phạm vi, trạng thái, bằng chứng và giới hạn. Thêm liên kết vào bảng trên khi cần một điểm vào mới.
3. Log/output/screenshot tạm đặt trong `../.dsh-tmp/<tác-vụ>/`; chỉ đưa fixture tổng hợp và bằng chứng cần lưu lâu dài vào Git.
4. Chỉ chuyển tài liệu vào `archive/` khi đã xác nhận bị thay thế và sửa các liên kết liên quan. Không di chuyển nhật ký chỉ để làm đẹp cây thư mục.

## Nguồn tài liệu hiện hành

HANDOFF, HANDOFF-LOG và DECISIONS chính thức nằm ở **gốc repository** (hai cấp phía trên thư mục này). Các file cùng tên trong `private-novel/docs/` do lượt triển khai trước tạo chỉ là ghi chép cũ; không tiếp tục append ở đó. Đọc trạng thái sửa undo/dịch song song tại [AI-PARALLEL-PLAN.md](AI-PARALLEL-PLAN.md); không dùng tuyên bố hoàn tất cũ thay kết quả kiểm checkout hiện tại.

Quy trình agent: [AGENTS-MD-RESEARCH.md](AGENTS-MD-RESEARCH.md) — nguồn gốc, cơ chế nạp hướng dẫn và cập nhật giới hạn delegation/kiểm thử24/10.
