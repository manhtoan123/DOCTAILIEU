# TikTok TTS — kết quả khảo sát và bước tích hợp

**Cập nhật15:08 ICT: TTS-1 đã triển khai/deploy1472c005.** Gateway/2voiceIDs phía dưới dùngtrongapp. NativeHTMLAudio productionWindows ở1280/522 giải mã/phát/currentTime/highlight/pauseResume/autonext/stop đạt. Root446unit/build/120E2E+48finalrace, independent90targeted; CSPexactorigin+canonicalverified. Chưanghe bằngtai/Androidhardware/chươngdài/background; chưaprefetch/cache nên cógap. Phần kế hoạch ban đầu dưới đây giữ lịch sử; prefetch chưa làm, không coi toàn bộ đề xuất đã hoàn tất.

08/10/2026 14:55 ICT. Root Codex khảo sát; không thay code ứng dụng hoặc deploy.

## Gateway thực sự trả audio

- Tài liệu cộng đồng: https://github.com/philipp-luettecke/tiktoktts ; voice definitions: https://raw.githubusercontent.com/philipp-luettecke/tiktoktts/main/custom_components/tiktoktts/const.py . Đây là API cộng đồng, chưa tìm thấy sản phẩm TTS công khai trong https://developers.tiktok.com/products/ .
- Endpoint cũ `https://tiktok-tts.weilnet.workers.dev/api/generation` trả307 Location `https://ottsy.weilbyte.dev/api/generation`. Python urllib không tự giữ POST khi307; phải kiểm Location rồi thử endpoint mới. Một request với User-Agent mặc định trả403/1010, không bỏ qua lỗi này trong kết luận.
- Endpoint mới POST JSON `{text, voice}` trả `{success, data, error}`, data là base64 MP3. Đã dùng câu tổng hợp “Xin chào, đây là thử giọng tiếng Việt.”, không nội dung truyện/secret.
- `BV074_streaming`: tiếng Việt nữ theo danh sách cộng đồng; HTTP200/success true,58880 base64 characters→44160 bytes, MPEG frame header `fff3e4c4`, lần đầu3.62s.
- `BV075_streaming`: tiếng Việt nam theo danh sách cộng đồng; HTTP200/success true,60800 characters→45600 bytes, cùng MPEG header, lần đầu3.23s.
- Xác nhận lại với Origin production: cả2 trả200/base64 strict decode/headerMP3 đạt; Access-Control-Allow-Origin `*`. OPTIONS preflight204, allow GET/POST/OPTIONS và Content-Type/Authorization. `/` endpoint mới404 không đồng nghĩa API chết. Status endpoint cũ200 available true trước đó chỉ chứng minh status, không là audio.
- Đã kiểm truyền tải và header; **chưa nghe bằng tai, chưa giải mã toàn MP3 bằng player, chưa kiểm Chrome Android thật hoặc độ ổn định dài chương**. Không cam kết dịch vụ miễn phí luôn tồn tại hoặc giọng đúng như STV chỉ dựa tên cộng đồng.

## Cách ít thao tác nhất đề xuất

Nối trực tiếp trình duyệt tới API công khai trên sau consent hiện có; không cần TikTok session cookie/API key hoặc dựng server mới. CORS đã đo cho phép hướng này. Không dùng private `/io/s1213/tiktoktts` của STV, không đưa credential vào VITE. Truyện gửi từng đoạn cho nhà cung cấp cộng đồng khi người dùng chọn nghe.

Phạm vi TTS-1: sửa adapter trong src/tts.ts từ GET/audio sang POST JSON/base64→Blob, cho2voiceIDs thật; không đổi database/cloud/auth, không nối WebSpeech fallback. Giữ settings cũ qua mapping tiktok-female-1→BV074 và tiktok-male-1→BV075; nữ2 chưa xác minh, không tự gán giọng khác. Không retry bỏ voice hoặc đổi provider âm thầm. Điều chỉnh splitter≤200 Unicode code points, giữ offsets highlight/không cắt surrogate; timeout/AbortController/latest-generation, giới hạn byte response và kiểm audio. Playback speed qua HTMLAudioElement thay vì gửi các tham số gateway không công bố.

Invariant: stop/chuyển chương/đổi Name/revision không phát đoạn cũ; URL được revoke; không blank Reader, không sửa nguồn/Names; lỗi gateway báo rõ, không fallback giọng khác. Prefetch chỉ1đoạn, memory cache có giới hạn; không lưu toàn audio vào R2. Nút Nghe hiện có giữ, không thêm menu cấu hình rải rác.

Nghiệm thu: unit request/body/voice/badJSON/base64/timeout/abort/Unicode offsets; npm.cmd test và npm.cmd run build; E2E TTS/Reader race repeat3 với mocks (ghi rõ mock); smoke thật2giọng trong browser nghe audio/next/highlight/stop rồi Windows+Android thật riêng. Kiểm CORS lại tại thời điểm triển khai. Nếu gateway ngừng thì dừng/ghi lỗi, chỉ chọn gateway khác có công bố API sau xác minh; không scrape session người dùng hoặc dùng proxy nội bộ bên khác.

## Đối chiếu nguồn local

Đã đọc chỉ đọc các dòng getVoices/PROXY_URL trong D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\stv.tts.v2.min.js và tìm endpoint trong2userscript. Mã tải về chỉ có alias tiktok:1/2/3 và relative proxy, không chứa server/gateway thật. Không sao chép/chạy mã nguồn D, không upload dữ liệu.


## 08/10/2026 15:14 ICT — TTS-2 khảo sát tốc độ theo STV
User báo loadchậm, yêu cầu nghiên cứu STV. Chỉđọcreference D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\stv.tts.v2.min.js, khônggọiproxyprivate hoặcchạymãD. Webhome https://sangtacviet.vip/ đãmở nhưngkhôngđo liveTTS/networkserverSTV; source tải về khôngbảođảm trùngproductionhiện hành.

Bằngchứngsource: AudioCaching568–650 cóMapcache+pendingAudio dedupe; preloadAhead1515–1545 tải các câu phía trước; constructor835 mặcđịnh0 nhưng controller2395 gọi player.setMaxPreload(2), nên cấuhìnhthamkhảobật2câu. Player1409/1468 gọi preloadAhead khi audiođangphát. TikTokgetCutTime4833: min(0.4,0.015*(wordCount-1))/rate, player1433–1452 lênlịch kếtthúcsớm theo duration đểrút khoảnglặng. Provider4803 dùngprivate relative/io/s1213/tiktoktts,4925–4975 POSTtext nhậnBlob; khôngcóbackend trongfile, khôngkếtluậncookie/cacheserver hoặcTTFBnhanhhơn.

Local src/tts.ts100awaitfetch rồi104onended mớiindex++/play/fetchnext: khôngprefetch/cache. Đây là bằngchứngcode về khoảngchờgiữacâu, khôngchứngminh toànbộchậm do mạng hoặcCORS. Gateway synthetic đãđo3–4s/request trước; chưabenchmarkfair cùngtext liveSTV.

Đềxuất taskTTS-2 nhỏ: tải trước2đoạn khi currentaudio đãready/playing, dùngMappromise theo voice+exacttext, chỉ2prefetch/khôngfloodgateway; RAMLRUmax8MiB/32entries, khôngR2/IDB/cachecrossvoice. Stop/chapter/Name/voicechange hủy cảprefetch; latecompletion khôngcache/khôngplaynhầm generation. Prefetchfail khôngunhandledrejection; khiđếnđoạn lỗi cho boundedretry500/502/503/504giữcùngvoice vàdeadline/stopabort, khôngcookie hoặcproviderfallback. Gomcâungắn thànhrequest≤200codepoints nếubenchmarkcho thấy lợiích, nhưngphảigiữsubsentenceoffset+highlight; khôngđổi segmentation ngay trongtaskprefetch nếuchưacóproof.

Ưutiênprefetch+dedupe trước, đo time-to-firstaudio vsinter-chunkgap riêng. Khôngcắt0.4sđuôi audio mặcđịnh: chưachứngminh đó làimlặng cho mọi câuViệt, cónguycơmấtâmcuối. Câuđầu cold vẫnđợigateway; prefetchkhôngchữaTTFBcâuđầu hoặc500 từupstream.

Gates: controlledunit delayedfetch chứngminh requestnexttrướconended/dedupe/boundedmemory/generationstop/pause/error; actualnativeAudio benchmark coldstart/gap trước-sau samefixture+voice/rate vànetworkvariance; npmtest/build +relatedE2Erepeat3; reviewerindependentrace. Production hiện1472c005 giữnguyên, chưa triểnkhaiTTS-2.


**15:35 ICT TTS-2 triểnkhai:** releasea2e5f8ce, windowcurrent+2prefetch/dedupe/cancelall; supersedeproposedLRU32/retry: no crossgenerationcache/noHTTP retry, khôngcắtđuôiaudio.453unit/build/48+12E2E/independent47pass; actualnativeproductiongapnumbers trongHANDOFF-LOG saucompletion. Câuđầu/Androidhardware/peakRAM/SLA vẫnchưaxácminh.
