# Báo cáo dễ hiểu: những việc đã làm cho web

**Ngày:** 14/11/2026

**Phạm vi:** các cải tiến web, phép đo và nghiên cứu GitHub trong đợt rà soát Private Novel Reader. Đây là phần tóm tắt cho người dùng; số liệu và giới hạn được giữ rõ để không nhầm thử nghiệm mô phỏng với trải nghiệm thực tế.

## Tóm tắt

Đã có các cải tiến nhằm giúp thư viện lớn dễ dùng hơn, mở truyện đã lưu khi mất mạng và tìm truyện khi gõ sai. Phần xóa nhiều truyện đã có giới hạn bốn việc chạy cùng lúc từ trước; trong đợt này chỉ đo thử và kiểm tra lỗi/thử lại, không sửa cách xóa. Có kiểm tra bằng build, test trình duyệt và dữ liệu tổng hợp. Một số phần mới chỉ được nghiên cứu hoặc đo mô phỏng; chưa thể khẳng định kết quả giống hệt trên kho truyện, đường truyền hay điện thoại thật.

## Đã làm và tác dụng

| Việc | Nói đơn giản là gì? | Tác dụng và bằng chứng |
|---|---|---|
| **Mở sách đã lưu khi mất mạng (PWA)** | Trình duyệt giữ lại những tệp cần để mở giao diện và phần đọc. Không lưu dữ liệu API hay nội dung cá nhân vào bộ nhớ đệm của web. | Sau khi web đã tải và lưu truyện trên máy, có thể mở giao diện và truyện đó khi offline. Edge đã chạy kiểm tra offline bằng sách tổng hợp. Cũng đã kiểm tra tình huống bản web mới được cập nhật khi tab cũ vẫn mở: tab cũ tiếp tục dùng tệp cũ cho tới khi đóng. Chưa giữ một tab trên trang production thật qua lần deploy để kiểm tra vòng đời đó ngoài mô phỏng. Cloud, AI, đồng bộ và tạo audio mới vẫn cần mạng. |
| **Hiển thị thư viện lớn nhẹ hơn (virtualization)** | Với hơn 300 truyện, chỉ dựng các thẻ đang nhìn thấy thay vì tạo hàng nghìn thẻ cùng lúc. | Trên thư viện tổng hợp 5.000 truyện, số phần tử trang giảm từ khoảng **55.000 còn 320** ở màn hình desktop; ở màn hình hẹp giảm từ **55.000 còn 155**. Công việc dài nhất cũng giảm rõ. Nhưng tìm kiếm trên 5.000 truyện vẫn mất khoảng **1,4 giây** trong lượt đo, vì web vẫn phải rà metadata. Đo bằng Edge và dữ liệu tổng hợp, không phải thư viện thật hay điện thoại thật. |
| **Gom truyện theo Album bằng Map** | Tạo sẵn nhóm truyện theo Album và các Album cha một lần, rồi lấy nhóm đã tạo thay vì lọc lại toàn bộ truyện cho từng Album. | Giữ nguyên cây Album, đường dẫn, thứ tự truyện và nhãn cũ; không sửa dữ liệu đã lưu. Với fixture 5.000 truyện và 150 đường dẫn Album, riêng bước dựng nhóm nhanh hơn khoảng **65 lần** ở microbenchmark. Con số này không phải tốc độ toàn trang: chưa tính giao diện, tìm kiếm và trình duyệt. |
| **Tìm gần đúng khi gõ sai** | Khi tìm chính xác không có kết quả, web thử tìm gần đúng theo tên truyện, tác giả và Album. | Có thể tìm được truyện dù gõ nhầm một vài ký tự; kết quả khớp chính xác vẫn được ưu tiên. Không tìm mờ trong nội dung chương. Test và E2E dùng thư viện tổng hợp 5.000 truyện đã chạy; thứ hạng trên lỗi gõ thực tế của người dùng chưa được đánh giá. |
| **Đo thử xóa nhiều truyện** | Giới hạn bốn yêu cầu xóa chạy cùng lúc đã có trước đợt này. Đợt này chỉ kiểm tra bằng dữ liệu giả lập; không thay đổi code xóa. | Với 31 truyện giả lập và mỗi phản hồi được trì hoãn 100 ms, lượt thành công mất khoảng **1,91 giây**; nếu chạy nối tiếp cùng độ trễ thì khoảng **3,1 giây**. Lượt giả lập có một lỗi 503 cũng xác nhận truyện lỗi và chưa chạy vẫn còn trên máy, còn truyện đã được máy chủ xác nhận mới bị dọn. Đây không phải phép đo mạng/cloud thật; thao tác xóa theo lô không thể hoàn tác toàn bộ như một giao dịch duy nhất. |
| **Sửa quy tắc đọc từ điển cho nhất quán** | Đường nạp từ điển thường và đường tạo cache dùng chung bộ phân tích từng dòng. | Giảm nguy cơ cùng một dòng từ điển bị hiểu khác nhau tùy đường tải; test có BOM, comment, dòng sai định dạng và giá trị chứa dấu `=`. Benchmark với từ điển thật trên Node cho thấy cache packed chưa nhanh hơn Map ở cold load và Convert trong lượt đo. Một thử nghiệm Edge với từ điển tổng hợp cho thấy cache ấm hoạt động và đầu ra Convert giống nhau, nhưng chưa chứng minh tăng tốc với tệp Vietphrase thật trong trình duyệt. |
| **Thử nghiệm điều hướng EPUB/Readium** | Đối chiếu cách app đang đọc mục lục EPUB với cách Readium lưu vị trí đọc. | Đã tìm ra mục lục lồng nhau và phần `#fragment` hiện chưa được giữ đầy đủ thành vị trí điều hướng ổn định. Chỉ thử với EPUB tổng hợp; **chưa thay bộ đọc hoặc thêm Readium** vì cần bảo toàn cách app đánh dấu vị trí, Convert, Name và TTS. Đây là kết quả nghiên cứu, chưa phải tính năng mới. |
| **Đo khoảng chuyển TTS trên web** | Chạy thử với tệp MP3 mẫu để xem phần mềm chuyển giữa các đoạn nhanh hay chậm. | Không sửa TTS theo yêu cầu của bạn. Phép thử dùng audio mẫu và không gọi dịch vụ TTS thật, nên chưa kết luận được độ ngắt quãng khi nghe thật, khi chạy nền hoặc trên Android. Không cần kết nối điện thoại cho phạm vi web hiện tại. |

## Tham khảo GitHub và cách áp dụng

- [p-limit](https://github.com/sindresorhus/p-limit) và [TC39 Array Grouping](https://github.com/tc39/proposal-array-grouping): tham khảo ý tưởng giới hạn số việc chạy đồng thời và gom dữ liệu theo khóa. Các đoạn triển khai được viết cho app hiện có, không sao chép mã và không thêm dependency cho hai phần này.
- [Workbox](https://github.com/GoogleChrome/workbox): tham khảo vòng đời cache theo phiên bản; app dùng service worker riêng, không thêm Workbox.
- [TanStack Virtual](https://github.com/TanStack/virtual) và [Fuse.js](https://github.com/krisk/Fuse/tree/v7.5.0): dùng thư viện cho danh sách ảo hóa và tìm gần đúng. Đây là hai phần có dependency mới; Fuse được pin phiên bản 7.5.0.
- [Readium](https://github.com/readium/ts-toolkit): chỉ dùng để nghiên cứu khả năng điều hướng EPUB, chưa cài thư viện hay thay engine.

## Việc còn chưa hoàn tất hoặc chưa xác minh

- Một lượt kiểm tra unit tổng thể ghi nhận **2.676 test đạt, 105 bỏ qua và 83 lỗi trên 48 file**. Lỗi nằm ở nhiều nhóm khác nhau; đã phân loại một số lỗi môi trường, timeout, mạng và sai khác kỳ vọng, nhưng chưa xử lý để làm toàn bộ suite xanh.
- Chưa đo các kết quả trên điện thoại Android thật, mạng cloud thật hoặc toàn bộ dữ liệu sách của người dùng. Các kết quả mobile hiện có là mô phỏng viewport trong Edge.
- Đợt ghi nhận có hai bản checkout không trùng nhau: bản đang mở trong thư mục làm việc ở commit `b84f718` và nhiều thay đổi chưa commit; bản sạch dùng để ghi kết quả GitHub ở `0e33424`. `HANDOFF.md` của bản đang mở ghi Pages production `591d1c98`, trong khi báo cáo của bản sạch ghi `97962f61`. Vì vậy cần đối chiếu lại commit nguồn với bản đang chạy trước khi khẳng định mọi mục ở trên cùng nằm trong một bản production hiện hành.
- Tài liệu này được tạo trong thư mục làm việc hiện tại; **chưa commit hoặc đẩy riêng báo cáo này lên GitHub**.
- Đối chiếu source, commit, bằng chứng và checklist cho lần AI review sau nằm trong [WEB-CODE-CHANGELOG-AI-CHECK-2026-11-14.md](WEB-CODE-CHANGELOG-AI-CHECK-2026-11-14.md).

## Kết luận

Các cải tiến có lợi ích rõ nhất trong phép thử là giảm số phần tử giao diện cho thư viện lớn, gom Album nhanh hơn và xử lý nhiều yêu cầu xóa song song mà vẫn giữ truyện chưa được xác nhận xóa. Tìm gần đúng và mở sách offline bổ sung cách dùng mới. Dù vậy, số liệu hiệu năng hiện chủ yếu từ dữ liệu tổng hợp; việc đối chiếu hai bản source/deploy và làm rõ các lỗi còn lại của unit suite vẫn cần hoàn tất trước khi coi toàn bộ kế hoạch là đã nghiệm thu xong.
