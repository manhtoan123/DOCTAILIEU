# Đối chiếu kế hoạch với mã — 05/10/2026

> **Tài liệu lịch sử.** Các trạng thái và việc còn mở bên dưới thuộc những mốc ghi trong tài liệu, không phải backlog hiện tại. Xem [HANDOFF hiện hành](../../HANDOFF.md) và [chỉ mục tài liệu](README.md) trước khi chọn việc.

**Trạng thái mới 08/10/2026 14:39 ICT:** UI/Reader production454f94ce đã330repeatE2E/427unitreported/build80/finalreview57unit+72repeatE2E vàcanonicalproductionChineseName/noBlank/reload/font/menu smoke. Title18/20, freshReader19/1.65/760 giữprofile, compactNameinline/advanced/lazy, sourceRangeanchor/cancellation/progressguards, VNsearchcontextsafe đã đạt phần mềm. Android thật/IME/zoom/RAM/M0/EPUB/storage/cloudNameupdates/backupknownfails vẫn mở. HANDOFF hiện hành và UI-READER-UX-PLAN statusmatrix là nguồn tiếp tục; các đoạn05/10 phía dưới là lịch sử, không là trạng thái mới.
Chỉ kiểm code/local tests; chưa phải nghiệm thu thiết bị thật hay deploy.

Checkpoint21:23: Reader popup STV đang WIP, mặc định Convert/chạm từ,139unit(1expected)/4popupE2E/buildpass. Full68 và reviewer48 bên dưới thuộc bản21:00; chưa nghiệm thu persistence/popup mới. Việc kế tiếp chi tiết ở NEXT-AI-PROMPT.md.

| Mốc | Trạng thái | Mã/bằng chứng và thiếu gì |
|---|---|---|
| M0 | Chưa làm đủ | Đã benchmark dictionary43,7MB Windows; còn tổng RAM Worker, streaming và auth CPU mục tiêu |
| M1 | Một phần | Reader/settings + StoryDetail read-only/resume/start; guard Back sớm/reviewer48repeat3, root68E2E; CRUD lỗi/IO/migration dữ liệu cũ chưa đủ |
| M2 | Một phần/lệch | Một TXT, worker/split preview; crash/resume chưa đầy đủ; A7 còn lỗi |
| M3 | Luồng local đã kiểm | Pipeline tham khảo, VP/HV/nhiều nghĩa/optional dictionaries; hiện116unit(1knownfailure),68fullE2E; parity toàn bộ/RAM Android chưa xác minh |
| M4 | Một phần đã kiểm | Name List chung cố định: merge/concurrent/rollback/reload/multi-tab qua; Reader sửa từ/selection và backup Nameglobal chưa hoàn tất |
| M5 | Ngoài R0 | TikTok adapter/mock; không có gateway/audio thật; BrowserPlayer chưa nối UI |
| M6 | Chưa đạt | A2/A3 qua nghiệm thu nhỏ; A1/A4/A5/A6 mở |
| M7 | Chưa đủ nghiệm thu private | Log AI khác17:39 ghi deploy/mở khi chưa cấu hình auth theo yêu cầu riêng; phiên20:05 không kiểm lại live/KDF/logout |
| M8 | Chưa đạt | Edge desktop/Pixel viewport; Android hardware chưa kiểm |

## Hợp đồng dữ liệu và layout
| Kế hoạch | Thực tế đọc mã | Quyết định |
|---|---|---|
| content chunks, không toàn văn chương | Chapter.text chứa toàn chương; sources.blob giữ TXT | Lệch có chủ ý ghi nhận, chưa chốt migration; không tự refactor |
| dictionary/chunk protocol | dictionaries store chứa Blob; worker giữ engine | Cần spike RAM trước chọn cấu trúc thay thế |
| checkpoint/resume đầy đủ | importJobs/restoreJobs theo dõi trạng thái, chưa crash resume hoàn chỉnh | Không quảng cáo resume đầy đủ |
| cây module §10 | src/*.ts, src/ui, src/workers; server/functions riêng | Cây dự kiến không bắt buộc rename |
| backup streaming | Base64 gộp part đầu, ngưỡng nhận 16 MiB | A1 mở; không data-safe với bộ lớn |
| nhận dạng filename | DictionaryPanel suy loại rồi cho đổi loại | Chưa kiểm chất lượng nội dung; PhienAm nhỏ vẫn có thể được nạp |

## Rủi ro đã xác minh trong mã
- .env.example/tts.ts còn route STV-like /io/s1213/tiktoktts và ID tiktok:1..3.
- fetch TTS hiện dùng GET text trong query; có thể vào URL/log. Cần route trung tính,
  POST body, hợp đồng gateway và test trước bật TTS thật; chưa có gateway để gọi.
- R0 không cần TTS theo quyết định người dùng; không ngầm coi BrowserPlayer là fallback đang chạy.
- A3 candidate dictionaries đã vào final transaction; 14 regression mới, reviewer38/38 backup, root75unit và native IndexedDB E2E qua.
- Kế hoạch cũ đã archive; không dùng D1 content sync/Gemini/Azure cũ để lấp thiếu local.

## Thứ tự thực thi
M0 backup/dictionary/auth spike → quyết định kiến trúc bằng số đo; A3 đã đóng phạm vi nhỏ.
Ưu tiên UI STV từng luồng sau Convert theo yêu cầu mới; STV-3a đã kiểm, STV-3b/Readerwordedit còn phạm vi nhỏ. Kết quả mới nhất tại HANDOFF; benchmark tại CONVERT-VALIDATION-2026-10-05.md. Android thật là gate riêng, không thay bằng viewport.


## 06/10/2026 16:44 — Trạng thái mới ưu tiên
BatchTXT và cloudadd-onlycompact đã có:234unitreported(1knownfails),build0,42targetedE2Erepeat3+30finalrepeat3; medium17snapshot/high39reviewpass. R2tài khoảnchưabật10042/AUTHsecretabsent nênlivecloudchưahoạtđộng. Localworkerd/D1/R2smokepass. docs/R2-SETUP.md và HANDOFF.md là checkpointhiệnhành; bảng cũ bên trên là lịch sử. EPUBảnh/fullsync/progress/dict/20GB0VNĐ/Androidhardware vàM0private/backup gates vẫn mở.

## 06/10/2026 18:54 — FAST-1 checkpoint mới
PersistentConvertcache e789c046 production:251unitreported(knownfails1),build0,19independentreview,14E2E+30finalrepeat3pass,productionChinesefixture79mswhileloadblocked/0Workerconvert. Khôngcompiledindex/dictionarycloud,Androidhardware/RAM43MB/chươngmới warmload chưađóng. Kếhoạchítthao tác ở MINIMAL-STEPS-PLAN.md; LIBRARY-1/EPUB-1/R2activation tiếp theo.

## 06/10/2026 22:07 — R2 production đang hoạt động
R2privatebucket+binding+remote0001/0002+CLOUD_ACCESS_TOKEN_HASH đãprovision,final1f4733f0HTTP200,anonymous401/connected200.282unitreported(1knownfails)/build0/68independent/48repeatE2E+18finaldevice-linkpass. ActualR2synthetic/browserroundtrip và exactfixturecleanup count0 pass. Deviceconnectionone-time/nopassword;source/dict/progress/EPUB/fullupdatesync chưa có. HANDOFF/R2-SETUP làactualcurrentstate.

## 06/10/2026 22:51 ICT — UI-2 production9971e099
Hai mục chính Tủ sách/Cài đặt, một select4groups, UI-1 cùng deploy;282unitreported/build/108repeatE2E/smokeproduction đạt. Known backup it.fails giữ mở; Androidhardware/fullrelease/catalog chung chưa đạt.

## 07/10/2026 18:29 ICT — Public auto-library finaleca0c5c4
363unitreported/31files,build0,72repeatE2E/134as­trareview/119solreview, actualnativeVP43687000SHA3GET+freshprofilecold9s/reloadnodicttransfer+syntheticadd/delete pass. ChưaAndroidhardware/fullsync/originals/EPUB/GC/backupgates. Modepublic2settingsgroupsConvert/Thôngtin, khôngmanualbackup/sync. XemHANDOFFcurrent.
