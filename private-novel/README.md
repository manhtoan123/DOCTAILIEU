# Thư Phòng — hướng dẫn bắt đầu với code

Ứng dụng đọc TXT/EPUB bằng React + TypeScript, lưu dữ liệu trên trình duyệt bằng Dexie/IndexedDB. Có Convert bằng từ điển, dịch AI, nghe TikTok TTS và đồng bộ qua Cloudflare.

**Tra cứu nhanh:** [Tài liệu theo tính năng](docs/README.md) · [Bản đồ mã nguồn](src/README.md) · [Scripts kiểm tra/vận hành](scripts/README.md) · [Trạng thái hiện hành](../HANDOFF.md).

**Đọc trước:** [Báo cáo nghiên cứu và hướng dẫn học project](docs/PROJECT-LEARNING-GUIDE.md). Tài liệu này giải thích kiến trúc, luồng dữ liệu, các file nên đọc và thay đổi làm gọn ngày 16/10/2026.

**Nếu mới học lập trình:** bắt đầu ở mục 7 của báo cáo (biến, hàm, JavaScript/TypeScript, React), rồi làm bài thực hành đầu tiên ở mục 8. Chưa cần đọc toàn bộ `App.tsx` hay `Reader.tsx` ngay.

## Chạy trên máy

Mở PowerShell ở thư mục `private-novel`:

```powershell
npm.cmd run dev
```

Mở `http://127.0.0.1:5173`. Lệnh này chạy giao diện Vite; không tự khởi động backend Cloudflare. Với checkout đã có `node_modules`, không cần cài lại để bắt đầu. Checkout mới cần `npm.cmd ci` theo lockfile hiện có.

```powershell
npm.cmd run build
npm.cmd test -- tests/reader-route.test.ts
npm.cmd run test:e2e -- e2e/shelf-title-readability.spec.ts --workers=4 --reporter=line
```

`build` kiểm tra TypeScript và tạo `dist/`; không triển khai lên mạng. Playwright hiện cấu hình dùng Microsoft Edge, gồm desktop và giả lập bố cục Pixel 7.

## Đọc code theo thứ tự

1. `src/main.tsx`: điểm khởi động.
2. `src/ui/LibraryBookCard.tsx`: ví dụ component nhận dữ liệu và callback.
3. `src/ui/AlbumShelf.tsx`: ví dụ hiển thị danh sách.
4. `src/ui/common.tsx`: hộp thoại, sự kiện bàn phím và cleanup.
5. `src/domain.ts` và `src/db.ts`: hình dạng dữ liệu và nơi lưu.
6. `src/ui/App.tsx`: kết nối giao diện với dữ liệu và điều hướng.
7. `src/ui/Reader.tsx`: đọc sau khi đã hiểu các phần trên.

Quy tắc làm việc nằm trong [AGENTS.md](../AGENTS.md); trạng thái hiện hành ở [HANDOFF.md](../HANDOFF.md). [Hướng dẫn sử dụng](docs/USER-GUIDE.md) dành cho thao tác ứng dụng.
