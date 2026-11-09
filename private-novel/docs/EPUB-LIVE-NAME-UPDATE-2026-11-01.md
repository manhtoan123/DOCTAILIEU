# Cập nhật Name tại chỗ trong EPUB/PDF/DOCX

## Nguyên nhân và thay đổi

Reader trước đây chỉ truyền EPUB khi `conversionReady`: sửa Name làm signature đổi, gỡ EpubFrame trong lúc Convert rồi mount lại. EpubFrame còn phụ thuộc nodes/words/nameImages nên mỗi bản Convert mới lại kiểm SHA/mở archive, dựng CSS/ảnh và thay srcDoc.

Reader nay giữ bản Convert của cùng nguồn (`sameSource`) trong lúc chờ, vẫn báo đang cập nhật và khóa thao tác sửa khi bản mới chưa sẵn sàng. EpubFrame chỉ tải/dựng archive khi book/source/layout đổi hoặc người dùng yêu cầu thử lại. Văn bản, vùng bấm Name, ảnh Name và offset highlight được cập nhật trong iframe đang có; chỉ thay các node thay đổi. PDF/DOCX sau nhập dùng cùng layout EPUB nên nhận cùng bản sửa, không cần sửa file/tái nhập hay chuyển đổi lại tài liệu.

Nguồn, bytes/SHA, chương, cache/định danh TTS không bị sửa. Chính sách dừng giọng đọc khi semantics Convert đổi vẫn giữ nguyên; không hứa audio đang nghe sẽ tự đổi sang Name mới giữa câu. Vị trí trang/iframe không bị chủ động đặt lại; reflow khi chữ dài/ngắn thay đổi vẫn có thể ảnh hưởng bố cục.

## Giao thức và giới hạn

- Bridge v2 riêng, giữ v1 cho bundle cũ. Mỗi message kiểm `event.source` và nonce; render-ready chỉ ghi nhận sau ACK của update mới nhất.
- Payload là dữ liệu, dựng bằng createElement/createTextNode, không dùng innerHTML. Kiểm số node, offsets, ranges, tổng 512.000 ký tự/128.000 words/1.000 ảnh trước khi thay DOM. Source/layout vẫn qua kiểm tra gốc.
- Giữ sandbox allow-scripts, CSP không connect/frame/object. Ảnh Name chỉ host đã cho phép archives.bulbagarden.net, URL kiểm lại trong bridge; CSP cho host này để thêm ảnh Name không cần reload. CSS/ảnh/font archive không tải lại khi sửa Name. SVG text dùng tspan đúng namespace, Name ảnh trong SVG chỉ giữ nhãn chữ.
- Đổi chương/nguồn/bố cục thực vẫn dựng lại khung và kiểm archive; không bỏ SHA để tối ưu.

## Tham khảo

[epub.js contents.js](https://github.com/futurepress/epub.js/blob/master/src/contents.js): tham khảo quản lý nội dung/layout tách vòng đời tài liệu. [MDN postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage): kiểm nguồn message; iframe opaque-origin cần target `*` nhưng nhận vẫn kiểm window+nonce. Áp dụng trên bridge hiện có, không thêm dependency hoặc dùng trực tiếp mã epub.js.

## Xác minh và phát hành

Review độc lập đọc diff cuối đạt; đã sửa finding SVG namespace và Ready/source identity. Build cuối exit0 (tsc client/server + Vite), log `.dsh-tmp/epub-live-name-build.log`; diff-check0. Không viết/chạy test theo yêu cầu tiết kiệm usage; chưa xác minh browser/Android thật hoặc tài liệu người dùng. `node --check public/epub-bridge-v2.js` đạt. Chưa deploy.

## Deploy 01/11/2026 — bản tổng hợp đã phát hành
Pages **1ea43d81**, asset **index-DDP66Cv4.js**; AI Worker **9f48a8f1-a14c-4841-abec-6e2ab871aeb1**. Deploy exit0. GET production /, /phong-toi, /r/10019/1 và JS asset HTTP200, đúng asset mới; /epub-bridge-v2.js HTTP200 và SHA khớp file build. Logs .dsh-tmp/nov01-final-{worker-deploy,pages-deploy}.log và nov01-final-release.json. Không chạy test/E2E, gọi AI/TTS thật hoặc sửa/xóa dữ liệu người dùng. Bằng chứng GET xác nhận phát hành, không thay cho kiểm chứng thao tác thực tế. Các ghi chú chưa deploy phía trên mô tả trạng thái trước lần phát hành này.
