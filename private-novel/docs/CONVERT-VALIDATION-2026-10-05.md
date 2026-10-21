# Convert local — kiểm chứng 05/10/2026

**Trạng thái mới20:05, thay các giới hạn14:28 bên dưới:** Name List chính lưu cố định trong IndexedDB và dùng cho Reader. Export Name List TXT riêng khi chuyển thiết bị (bookbackup chưa chứa globalNames). Default dấu câu/viết hoa bật; nhiều nghĩa có ngoặc theo tham khảo. Pipeline mới bảo vệ Name toàn đoạn, kể cả Name ở prefix/suffix luật; raw/normalized key giữ riêng, không mất source offsets.Kết quả thực tế112unit reportedpass=111ordinary+1expectedfailure globalNamebackup,44E2E,buildpass,reviewer73targeted gồm1expectedfailure. Các đoạn dưới giữ làm bằng chứng lịch sử14:28.

Đối chiếu live câu Trung tự tạo (không dùng truyện người dùng): `李明来到山门。中国人民。\n他说：“你好！”\n不比他强` → `Lý Minh đi tới sơn môn. Người Trung Quốc dân.` / `Hắn nói: “Ngươi tốt!”` / `Không mạnh bằng hắn`. Không kết luận hai bên cùng dictionary nếu chưa hash/đối chiếu bộ nạp. Từ điển thiếu Chapter/Number/Blacklist/NameList hoặc Luật Nhân vẫn làm khác kết quả; đã thêm đúng các kind, không tự nhập/upload bộ của người dùng.

Benchmark lần mới20:05 cùng4files: validate/hash/install1391ms,load3276,4ms,convert135,4ms cho `中国人民来到山门。`; output `Người Trung Quốc dân đi tới sơn môn.` Main timer100msmax110,1ms,mainheap11.336.074byte không gồm Worker. Tăng so với pipeline cũ có nguyên nhân là chuẩn hóa key và bảo vệ Names toàn đoạn; không tự coi là regression đã tối ưu. Chưa đo RAM Worker/Android/corpus dài.

Phạm vi: công cụ Convert tại Từ điển, engine/Worker và nhập từ điển. Không phải nghiệm thu toàn website hoặc parity đầy đủ với Vietphrase/STV.

## Cách dùng
1. Mở Từ điển, chọn Vietphrase.txt, Names.txt, HanViet.txt (hoặc PhienAm.txt); có thể thêm DaiTuNhanXung.txt.
2. Kiểm tra loại từng file, bấm Lưu. Các file cùng loại gộp theo thứ tự; khóa trùng dùng giá trị cuối. Lưu thay bộ cùng loại đang có.
3. Dán chữ Trung hoặc nhập đoạn TXT UTF-8 vào Convert; chọn Vietphrase/Hán-Việt và tùy chọn nhiều nghĩa.
4. Bấm từ trong kết quả để tra nghĩa/phiên âm, sửa Name tạm và Convert lại. Name tạm có nhập/xuất TXT; rời trang sẽ mất. Đổi từ điển giữ bản nháp nhưng xóa kết quả cũ.
5. Sao chép hoặc tải kết quả TXT. Đoạn nguồn và Name tạm giới hạn 64.000 đơn vị UTF-16; truyện dài nhập qua Tủ sách để chia chương.

## Fixture tiếng Trung có đáp án
Nguồn tự tạo: `李明来到山门。`
- Vietphrase: `Lý Minh đi tới sơn môn。`
- Nhiều nghĩa: `Lý Minh đi tới/đến sơn môn/cổng núi。`
- Hán-Việt: `lý minh lai đáo sơn môn。`
Unit và E2E kiểm tra đáp án, Unicode/xuống dòng, Name tạm, tra nghĩa, tải TXT, kết quả cũ đến muộn, đổi từ điển giữ nháp.

## Benchmark bộ thật (14:25 ICT)
Nguồn chỉ đọc: `D:\linh tinh\tm\STV Novel\mới chưa sửa\Vietphrase-data`.
Lệnh trong private-novel khi Vite đang chạy:
`node scripts/benchmark-convert.mjs "D:\linh tinh\tm\STV Novel\mới chưa sửa\Vietphrase-data"`
Script dùng context Edge tạm, nhập từ file chooser local; không copy dữ liệu vào repository, không gửi máy chủ. Đóng context sau đo.

| File | Byte | Dòng hợp lệ | Dòng bị bỏ |
|---|---:|---:|---:|
| Vietphrase.txt | 43.687.000 | 1.113.825 | 1 |
| Names.txt | 2.429.701 | 90.247 | 0 |
| HanViet.txt | 182.819 | 16.841 | 6 |
| DaiTuNhanXung.txt | 1.237 | 28 | 0 |

Một lần đo Windows Edge: validate/hash/lưu 1.374 ms; nạp Worker 1.721,4 ms; Convert câu ngắn 5,1 ms. Timer main thread chu kỳ100 ms có gap lớn nhất104,4 ms trong lúc load/convert. Heap main page24.236.152byte; **không đo tổng RAM Worker/browser**, không dùng số này làm nghiệm thu RAM Android.
Đây là một phép đo, không phải percentile hoặc cam kết hiệu năng mọi máy. Dòng hợp lệ không đồng nghĩa số khóa duy nhất hoặc chất lượng dịch đúng.

## Giới hạn còn lại
- Convert ghép nghĩa theo từ điển, câu có thể thô hoặc chia cụm chưa hợp ngữ cảnh; không là dịch AI/văn học.
- Chưa parity toàn bộ luật/sắp xếp của upstream. Luật Nhân hiện bảo vệ Names trong capture; prefix/suffix chưa bao phủ.
- Reader cũ còn cần regression riêng cho tra từ rất nhanh và mở rộng selection qua surrogate pair; đợt này chưa sửa Reader.
- Chưa Android hardware, tổng RAM Worker, corpus dài, đa tab thay dictionary, deploy.
- Bộ thử thật nằm trong context tạm; người dùng phải chọn nhập vào trình duyệt đang sử dụng.
