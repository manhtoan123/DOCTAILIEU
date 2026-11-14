# Tìm kiếm metadata gần đúng trong thư viện

## Hành vi

Tìm substring đã chuẩn hóa vẫn được ưu tiên cho tên gốc, tên hiển thị đã lưu, tác giả, Album và tiêu đề chương. Chỉ khi tìm chính xác không có kết quả, ở màn thư viện, app mới chạy fuzzy trên metadata sách. Nó không fuzzy nội dung chương.

Fuzzy có các trường riêng với mức ưu tiên: tiêu đề gốc (0), tiêu đề chuyển đổi đã lưu (+0,02), tác giả (+0,07), Album (+0,12). Dùng Fuse.js `match` với threshold 0,25; chỉ nhận tổng score không quá 0,37 và sắp theo score rồi thứ tự sách ban đầu. Tiêu đề chuyển đổi tạm thời trong bộ nhớ không được fuzzy index; tìm chính xác vẫn hỗ trợ giá trị đó. Query chuẩn hóa bằng NFD, bỏ dấu tiếng Việt và đổi `đ` thành `d`; chỉ xử lý query dài 3–64 code point và metadata tối đa 2.048 code point.

Chỉ mục metadata được chuẩn bị theo lô nền. Khi người dùng ngừng nhập 120 ms, module Worker chạy theo chunk và hủy công việc cũ khi query đổi. Worker nhận tuple nhỏ gọn, không giữ một bản sao object của toàn bộ danh sách trên luồng chính. Nếu Worker lỗi, fuzzy không trả kết quả; tìm chính xác vẫn dùng được.

## Tham khảo mã nguồn mở

- [krisk/Fuse, tag v7.5.0](https://github.com/krisk/Fuse/tree/v7.5.0) (Apache-2.0): tham khảo API fuzzy matching và đánh giá từng trường metadata. Dependency được pin `fuse.js` đúng phiên bản này. Không chép mã nguồn Fuse; tích hợp bằng API `fuse.js/basic`, không dùng phần hiển thị match indices.
- Tìm kiếm mờ chỉ là gợi ý bổ sung cho exact search. Không thay đổi dữ liệu sách, Album, chương hay cơ chế Convert.

## Bằng chứng hiện có

- `tests/library-search.test.ts`: 6/6 pass, gồm typo tiếng Việt đã bỏ dấu, tên/author/Album, tiêu đề CJK, query ngắn/quá dài và chuỗi không liên quan.
- Production-preview E2E: `e2e/fuzzy-library-search.spec.ts` 1/1 pass; E2E virtualization + offline shell 3/3 pass.
- `npm.cmd run build`: pass; Fuse được tách khỏi main bundle vào fuzzy Worker.
- Edge desktop production preview, thư viện tổng hợp 5.000 sách, năm query typo không có kết quả chính xác: 491,9–812,1 ms, median 693,8 ms. Long task 68 ms ở query đầu, 0 ms ở bốn query sau. Đây là mẫu nhỏ, máy tính desktop và dữ liệu tổng hợp; không phải benchmark Android hoặc dữ liệu người dùng.
- `npm.cmd audit --omit=dev --json`: 0 lỗ hổng dependency production ở thời điểm kiểm tra.

## Giới hạn và bước còn lại

Chưa đo trên Android thật hoặc kho sách thực tế. Fuzzy dựa trên tiêu đề chuyển đổi đã lưu; tên chỉ được chuyển đổi tạm thời trong RAM không vào fuzzy index. Chưa kiểm corpus typo thực tế của người dùng hay hiệu quả thứ hạng qua đánh giá thủ công. Nếu Worker không khả dụng, app tiếp tục exact search mà không làm hỏng luồng chính.