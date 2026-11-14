# Spike điều hướng EPUB và Readium — 14/11/2026

## Câu hỏi và phạm vi

Đối chiếu navigator/locator của Readium với mô hình EPUB hiện có. Không thêm package, không thay renderer, không sửa dữ liệu sách. Fixture là EPUB ZIP tổng hợp hai chương với EPUB 3 nav lồng nhau và fragment links.

## Kết quả từ fixture tổng hợp

- openEpubPackage trả mỗi mục spine dưới dạng path/title. Parser đọc nhãn từ EPUB 3 nav và NCX rồi gán nhãn lên spine item tương ứng.
- resolveEpubPath bỏ fragment và query khi chuẩn hóa đường dẫn. Link mục lục tới chapter-1.xhtml#part-one và chapter-1.xhtml#chapter-one vì vậy cùng trỏ về file chapter-1.xhtml; fragment không còn trong spine.
- Với nav tree gồm “Phần Một” chứa “Chương Một”, item spine sau parse chỉ giữ title “Chương Một”. Package không trả cây TOC. Nội dung chapter vẫn giữ hai heading và text nodes.
- Layout hiện ánh xạ source qua đường dẫn tài nguyên và character offsets trong các node; Reader/TTS tiếp tục dùng chapter identity và offset. Chưa có đối tượng EPUB Locator ổn định gồm href, fragment/text context, progression hoặc position.
- buildEpubFrame tạo CSP hạn chế: default-src none, script chỉ nonce, connect-src none. EpubFrame bọc nội dung trong iframe sandbox allow-scripts. Fixture giữ aria-label; Renderer tạo vùng chọn từ role=button/tabindex khi có word ranges.
- Kết quả probe: spine fields path/title; hierarchy stored=false; fragment stored=false; aria-label preserved=true. Hai layout trả nguyên các heading và text.

## Đối chiếu với Readium

- [readium/ts-toolkit](https://github.com/readium/ts-toolkit) (BSD-3-Clause; README ở nhánh develop được xem ngày 14/11/2026) chia package shared, navigator và navigator-html-injectables. README cảnh báo thay đổi phá vỡ tương thích có thể xuất hiện ở minor release; nếu tích hợp sau này cần pin/review changelog.
- [readium/web](https://github.com/readium/web) mô tả dự án là work in progress. TypeScript toolkit cung cấp navigator và APIs thấp hơn; Go toolkit cung cấp publication manifest/resource services.
- [Readium Locator API](https://github.com/readium/architecture/blob/master/models/locators/other/locator-api.md) dùng Locator đầy đủ để đi tới vị trí và lưu bookmark/annotation; API quy định location gồm href/type cùng các trường position, progression, fragment và text tùy use case. Đây có thể là lớp adapter để biểu diễn TOC sâu và vị trí EPUB.
- Không sao chép mã hoặc cài dependency. Spike chỉ dùng hành vi hiện có và tài liệu dự án Readium.

## Kiểm tra

- Synthetic runtime probe: spine chỉ có path/title, nav tree/fragment bị làm phẳng; nội dung có heading, aria-label và CSP hạn chế như trên.
- Unit: epub manifest + render-security review 11/11 pass.
- Edge synthetic E2E: epub.spec.ts + epub-reader-3.spec.ts 3 pass, 2 skipped. E2E tiếp tục xác nhận styles/Convert/AI mapping/reader flow hiện hành; skip không được tính là pass.
- Esbuild báo import.meta trong format IIFE cho ai-metrics.ts; không ảnh hưởng kết quả probe.

## Kết luận

Chưa thay engine. Readium có lợi thế về locator/navigation API nhưng không tự bảo toàn các invariant app: EPUB source offset, Name image/Convert, word selection, AI mapping, TTS cursor, opaque iframe bridge, CSP, local-first archive/source. Nếu sau này cần mục lục lồng nhau hoặc bookmark EPUB sâu, nên bắt đầu adapter song song cho Locator và giữ chapter/offset hiện tại làm nguồn tương thích; cần kiểm tra riêng security boundary trước khi thay frame injection.