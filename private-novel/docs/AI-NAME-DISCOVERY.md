# Tìm và dịch Name trong chương

## Hành vi

Reader Tools có nút **Tìm và dịch Name**, chỉ quét chương đang mở. AI nhận nguyên văn chương (chia phần theo vị trí nguồn, tối đa 2.500 ký tự mỗi phần; trước đây 5.000), prompt riêng ở Cài đặt AI và các Name hiện có liên quan. Mỗi request có ngân sách tối đa 16.000 ký tự gồm nguồn JSON và cả hai prompt. Bộ lập kế hoạch giữ nguyên nội dung, và danh sách kết quả chỉ được chấp nhận khi mỗi khóa `$中文` xuất hiện nguyên văn trong phần nguồn.

AI phải đề xuất theo prompt bốn bước người dùng cung cấp: nhận diện tác phẩm khi đủ bằng chứng, rà soát lỗi, giải thích ngữ cảnh, rồi xuất danh sách `$Tiếng Trung=Tiếng Việt` dài đến ngắn. Chưa đủ bằng chứng phải nói chưa xác định; từ chối hoặc phản hồi sai/cắt không được tính là hoàn tất. Nguồn, tiêu đề và Name cũ được coi là dữ liệu, không phải chỉ dẫn. Không thay nhãn/prompt để vượt kiểm duyệt của nhà cung cấp.

Đề xuất ban đầu bỏ chọn. Cặp chữ Trung và nghĩa Việt giống nhau chỉ hiện một lần. Cùng chữ Trung có nhiều nghĩa thì chọn một nghĩa sẽ bỏ chọn nghĩa kia. Thanh lọc chỉ hiện khi có đề xuất, tìm theo chữ Trung (có hoặc không có `$`) hoặc nghĩa Việt (có hoặc không có dấu), có nút xóa bộ lọc và chế độ **Đã chọn**. Người dùng có thể sửa nghĩa và chọn mục cần ghi vào Name riêng của truyện/Album. Lưu kiểm tra lại chương, revision, nguyên văn, chương ẩn, phạm vi Name và các khóa đã thay đổi trong transaction. Khóa Trung được lưu chuẩn hóa nội bộ; giao diện, nhập/xuất và văn bản sao chép hiển thị `$`. Alias legacy mơ hồ bị từ chối để tránh ghi nhầm. Không sửa chương hoặc nguồn.

Model chọn ngay trong bảng, mặc định theo model hiện tại của trình đọc. Lượt quét dùng model đã chọn và cùng scheduler, retry, cooldown và lease của Dịch AI. Từ 09/11, lượt quét tự mở tối đa bốn request theo số key rảnh báo trên lease đầu tiên. Server cũ chỉ mở tối đa hai. Dịch AI chương vẫn dùng trần hai. Khi tiếp tục hoặc đổi model, các phần đã xác nhận và các đề xuất đã sửa/chọn vẫn được giữ trong bảng. Khóa Name đã có trong phạm vi hiện tại được lọc khỏi danh sách đề xuất.

Tham khảo [p-limit](https://github.com/sindresorhus/p-limit/blob/main/index.js) cho cách giới hạn hàng đợi đang chạy. App dùng hàng đợi và lease sẵn có, không thêm dependency. D1 kiểm `busy_until` và cooldown để trả số slot rảnh tùy chọn trên stream. Kiểm thử mô phỏng đạt 1/2/3/4 luồng và fallback hai luồng. Kiểm tra D1 với upstream giả lập xác nhận các lease khác nhau có thể thực sự chồng thời gian. Xem `.dsh-tmp/ai-tool-lanes/`. Đã triển khai Pages a8fe2da9 và AI Worker e2e5a4ea ngày 09/11/2026. Kiểm HTTP và tài sản live đạt.

- Timeout, chạm giới hạn đầu ra, lỗi kết nối tạm thời, phản hồi vượt kích thước, sai định dạng hoặc thiếu trạng thái kết thúc có thể tách đôi phần đang lỗi, tối đa hai cấp và chỉ tách phần dài từ 640 ký tự. Nếu phần nhỏ vẫn lỗi, lượt quét đánh dấu bỏ qua rồi tiếp tục. Chi tiết tiến độ ghi mã phần con như **Phần 1.1**. Sau khi quét hết, **Thử lại phần lỗi kỹ thuật** chỉ gửi lại các phần loại này.
- Lỗi kết quả rỗng và lỗi kiểm tra danh sách Name ở trình duyệt được bỏ qua và giữ trong chi tiết tiến độ. Lỗi trạng thái kết thúc chung của Worker không phân biệt được lý do nhà cung cấp dừng. Lượt quét chia nguồn trong giới hạn hiện có và chỉ chấp nhận kết quả hợp lệ có trạng thái STOP.
- Lỗi quota, cấu hình, model hoặc key khiến lượt quét tạm dừng sau xử lý kỹ thuật hiện có. **Dừng tìm Name** hủy yêu cầu còn chạy và giữ tiến độ trong bảng. Đóng bảng hủy lượt và xóa tiến độ trong bộ nhớ của bảng.

## Tham khảo và điều chỉnh

- [AWS CDK Lambda event sources](https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-lambda-event-sources/README.md#dynamodb-streams). Áp dụng ý tưởng chia đôi phần lỗi và giữ các kết quả thành công riêng lẻ, với giới hạn theo độ sâu và chỉ chia khi xác định được lỗi kỹ thuật.
- [Adobe React Aria SearchField](https://github.com/adobe/react-spectrum/blob/main/packages/react-aria-components/src/SearchField.tsx). Dùng ô tìm có tên truy cập và nút xóa trả focus về ô lọc, bằng điều khiển HTML có sẵn.
- [spaCy EntityRuler](https://github.com/explosion/spaCy/blob/master/spacy/pipeline/entityruler.py): tham khảo ý tưởng gắn nhận diện thực thể với chuỗi nguồn có bằng chứng. Ở đây không thêm dependency hay áp mẫu regex chung lên truyện; AI chỉ được đề xuất khóa thực sự có trong phần nguồn, còn người dùng duyệt trước khi lưu.
- [Dexie transaction documentation](https://dexie.org/docs/Tutorial/Design#transactions): áp dụng transaction cùng việc kiểm tra dữ liệu hiện hành ngay trước khi ghi; không dùng snapshot cũ để ghi đè kho Name.

## Kiểm tra và giới hạn

### Cập nhật phục hồi, model và lọc ngày 08/11/2026

- Targeted Vitest trên bản phát hành riêng đạt 28/28. Gồm chia đệ quy giữ nguyên nguồn, lỗi luồng/trường dữ liệu, thử lại đúng phần kỹ thuật với model mới, bỏ qua phản hồi có thể bị từ chối, hủy phần đang chạy song song khi gặp lỗi cấp lượt, Worker runtime với upstream giả lập và lưu Name đã chọn.
- Build đạt. Vite cảnh báo kích thước bundle chính vượt 500 kB.
- E2E trên Vite preview đạt 6/6 với Edge desktop và Pixel 7 mô phỏng, đủ Trắng/Giấy/Tối. Kiểm tra API giả lập, chia và bỏ qua, đổi model chỉ gửi lại phần lỗi, giữ mục đã chọn và nghĩa đã sửa, tìm không dấu và chữ Trung, xóa bộ lọc trả focus về ô tìm, lưu đúng Name và giữ nguồn chương. Vite dev ngắt kết nối trong lượt đầu nên kiểm tra trên bản build.
- Reviewer độc lập GPT-6.1 Sol Medium kiểm tra phạm vi bảng và bộ chạy Name. Bổ sung ca hồi quy cho phản hồi thiếu candidate/đầu ra, trạng thái HTTP 429 và hủy request còn chạy khi gặp lỗi cấp lượt.
- Pages production `20a47f56` phục vụ `index-TECzFszc.js`, SHA-256 khớp bản build. Bản nguồn riêng được dựng lại từ `f8f97e94`, đối chiếu SHA-256 JavaScript và CSS của bản nền, sau đó chỉ thay ba file bộ chạy, panel và CSS của Name. Rollback Pages về `f8f97e94`. AI Worker không phát hành lại. Production smoke 1/1 trên dữ liệu tổng hợp và AI giả lập. Chưa kiểm tra với AI thật hoặc Android thật.
- Hotfix Pages `0ed469db` (`index-D1zFT__A.js`) từ cùng bản nguồn riêng. Bật chia cho lỗi trạng thái kết thúc và phản hồi không hợp lệ từ Worker. Vitest bộ Name 23/23, build đạt, smoke production 1/1 với lỗi kết thúc giả lập và xác nhận chi tiết hiện **Phần 1.1.1**. Rollback `20a47f56`.
- Deploy Pages `511b90b6` (`index-BSrA4pEy.js`): bổ sung loại trùng khóa Name giữa các phần chạy song song/thử lại. Build đạt, canonical HTML 200, SHA-256 khớp dist, smoke production 1/1 pass với API giả lập. Rollback Pages `0ed469db`.

### Bằng chứng trước bản cập nhật

- `npm.cmd test -- tests/ai-name-discovery.test.ts tests/ai-name-discovery-runtime.test.ts tests/save-discovered-names.test.ts tests/name-format.test.ts tests/convert-names-review.test.ts`: 5 file, 45/45 test pass. Native Worker runtime dùng upstream giả lập; kiểm tra đầu ra chuẩn, refusal, lỗi schema, cắt câu trả lời và không sửa chữ Hán của Name.
- `npm.cmd run build`: exit 0; Vite cảnh báo bundle chính vượt 500 kB.
- E2E preview `e2e/ai-name-discovery.spec.ts`: 1/1 pass trên Edge/Chromium desktop với truyện tổng hợp; kiểm tra prompt lưu/đọc lại, payload, chọn đúng một Name, `$` và nguyên văn chương không đổi. API bị giả lập; không gọi AI thật, không ghi cloud.
- Chưa đánh giá độ chính xác lore/tên riêng trên tác phẩm thật; kiểm tra không bao gồm Android thật. Review độc lập Sol High chưa khả dụng trong lượt này.
- Deploy cập nhật mốc 2.500 ký tự: Pages production `f8f97e94` (`/assets/index-C3SGzYTA.js`); AI Worker giữ nguyên `710b3319-dca0-469e-9ad9-b75f76d243a1`. Rollback Pages về `df12e2f5`. Canonical asset SHA-256 khớp dist; production smoke 1/1 với API giả lập và IndexedDB tổng hợp riêng, không gọi AI upstream hoặc ghi cloud. Không commit/push.
