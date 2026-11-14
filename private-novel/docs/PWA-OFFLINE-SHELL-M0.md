# PWA offline app shell

## Mục tiêu và ranh giới

Sau khi người dùng đã mở ứng dụng online và service worker cài shell thành công, giao diện và truyện đã lưu trong IndexedDB có thể mở khi mất mạng. Đây không phải offline sync: `/api/**`, cloud, AI, đồng bộ và tạo audio mới không được cache.

Precache chỉ gồm `index.html`, JS/CSS đã build có hash cần cho app/Reader và các `epub-bridge-vN.js`; bỏ các chunk chuyển đổi import PDF/DOCX và PDF worker/wasm lớn. Không cache EPUB/TXT, dữ liệu cá nhân, API response hay nội dung đọc. Chỉ đăng ký service worker trong production trên browser hỗ trợ HTTPS/secure context.

## Cơ chế và vòng đời cập nhật

Build script ghi manifest allowlist vào `dist/sw.js`; build ID băm nội dung worker và từng asset để mỗi phiên bản có cache riêng. Install tải đủ shell trước khi service worker có thể active; install lỗi thì xóa cache dở và worker mới không thay worker đang chạy. Navigation dùng network trước, khi fetch lỗi mới trả `index.html` đã precache. JS/CSS chỉ đọc từ cache khi URL có trong manifest.

Không gọi `skipWaiting()` hoặc `clients.claim()`. Worker mới chờ tab do worker cũ điều khiển đóng rồi mới active; lúc activate chỉ xóa cache thuộc app này. Đây giữ nguyên lazy chunks của tab cũ trong lúc phiên bản mới đã deploy. Tab đang mở có thể tiếp tục dùng bản cũ cho đến khi đóng/mở lại.

## Nguồn tham khảo

- [GoogleChrome/Workbox](https://github.com/GoogleChrome/workbox) và [Workbox precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching/): precache theo danh sách asset versioned, tải trong install và dọn cache cũ ở activate. Chỉ áp dụng ý tưởng; không thêm Workbox hay sao chép mã.
- [Workbox: cập nhật service worker](https://developer.chrome.com/docs/workbox/handling-service-worker-updates/): lifecycle mặc định chờ client cũ; tài liệu cảnh báo `skipWaiting` có thể làm hỏng lazy hashed assets sau khi cache cũ bị dọn. Vì vậy app dùng chờ tab cũ đóng.
- [Cloudflare Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/): `_routes.json` điều khiển Functions được gọi trên đường dẫn nào. Giữ middleware/auth hiện tại; xác nhận `/sw.js` là JS tĩnh sau deploy trước khi cân nhắc exclusion route.

## Tiêu chí nghiệm thu

- Build tạo worker và manifest không còn marker; chỉ các đường dẫn shell đã nêu nằm trong precache.
- Edge production build: đăng ký worker, tải trang lần đầu, reload để page được điều khiển, tắt mạng rồi mở route truyện đã có trong IndexedDB.
- CacheStorage không có `/api/**` hay dữ liệu người dùng; `/sw.js` trả JavaScript, không phải SPA HTML.
- Deploy mới đổi cache version; worker cũ không bị skip trong khi tab cũ còn mở. Kiểm tra update trên Pages sau lần deploy tiếp theo.

## Kết quả và giới hạn

Trạng thái: build và kiểm thử local đạt; production deploy đang chờ. Baseline commit `29e47f3`: 83 lỗi/48 file, 2.671 pass, 105 skipped; E2E dictionary persistence trên Edge 1/1 pass; build pass. Sau PWA: 84 lỗi/47 file, 2.670 pass, 105 skipped; danh sách file lỗi thay đổi ba file theo lượt, không có lỗi PWA trong unit suite. PWA E2E trên built app/Edge 1/1 pass (install, reload, API không cache, mở truyện local offline); build tạo 10 URL, 1.296 KiB shell. Log ở `.dsh-tmp/baseline-unit.log`, `baseline-e2e-dictionary.log`, `baseline-build.log`, `pwa-unit-final.log`, `pwa-e2e-final.log`, `pwa-build-final.log`.

Chưa nghiệm thu Android phần cứng. Lần đầu và browser không hỗ trợ service worker vẫn cần mạng. Offline shell không bảo đảm cloud, AI, TTS mới hoặc backup hoạt động offline; các asset PDF/import lớn bị loại khỏi cache.
