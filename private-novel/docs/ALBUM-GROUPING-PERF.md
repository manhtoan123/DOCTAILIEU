# Gom sách theo đường dẫn Album

**Ngày:** 14/11/2026  
**Trạng thái:** triển khai local; kiểm tra deploy sẽ được ghi sau khi phát hành.

## Thay đổi

`AlbumShelf` trước đây duyệt `albums` rồi chạy `books.filter(albumContains)` cho từng Album. Giờ `groupBooksByAlbumPath` duyệt sách một lần, thêm mỗi sách vào Map của Album trực tiếp và từng Album cha hợp lệ; giao diện lấy nhóm bằng `Map.get(path)`.

Tên đường dẫn và cây Album vẫn giữ nguyên. Album có segment rỗng (ví dụ `An//Series`) tiếp tục là nhãn legacy nguyên vẹn, không tạo Album cha giả. Mỗi bucket giữ thứ tự ban đầu của sách. Không thay dữ liệu, ID, import, xóa hay đồng bộ.

## Tham khảo mã mở

- [TC39 Array Grouping proposal](https://github.com/tc39/proposal-array-grouping): ý tưởng tạo các bucket theo khóa và trả về Map. Source app dùng vòng lặp và `Map` phổ thông; khác `Map.groupBy` ở chỗ một sách phải nằm trong nhiều khóa tổ tiên của cây Album. Không chép mã, không thêm dependency.

## Kiểm tra

- `npm.cmd test -- tests/album-tree.test.ts`: 4/4 pass; so sánh bucket với `albumContains` cho Album cha/con, tên gần giống, path legacy và sách không có Album.
- `npm.cmd run build`: pass; PWA shell `861842736eb25608`, 10 URL / 1.296 KiB.
- `npm.cmd run test:e2e -- e2e/album-hierarchy.spec.ts --project=chromium --workers=1 --reporter=line`: 4/4 pass (Chromium, 1,1 phút); bao gồm cha/Series, tìm kiếm, điều hướng và kiểm tra snapshot sách/chương/tiến độ.
- `node scripts/benchmark-album-grouping.mjs`: fixture tổng hợp 5.000 sách, 150 đường dẫn Album, sâu tối đa 3; 5 lượt warm-up, 30 lượt đo; membership và thứ tự giống nhau. Node v24.14.0: lọc lặp p50 1.139,34 ms / p95 1.183,80 ms; gom Map p50 17,42 ms / p95 21,90 ms; p50 nhanh hơn 65,4 lần cho bước dựng nhóm.
- Đây là microbenchmark tổng hợp của bước dựng nhóm; không gồm React render, lọc tìm kiếm, sort, trình duyệt, heap của ứng dụng, thư viện thật hoặc Android. Chưa có phép đo trước/sau trên thiết bị người dùng.

## Đánh đổi và giới hạn

Mỗi sách được giữ thêm một tham chiếu trong từng bucket tổ tiên, nên bộ nhớ phụ là `O(N×D)` với `N` sách và độ sâu Album `D`. Thời gian dựng index là `O(N×D)`; lấy bucket cho `M` Album là `O(M)`, sau đó các bước filter/sort của giao diện vẫn chạy như trước. `useMemo` dựng lại index khi mảng sách thay đổi.

Production smoke và deploy chưa chạy tại thời điểm ghi tài liệu này.
