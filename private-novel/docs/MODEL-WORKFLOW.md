# Quy trình model và đối chiếu nguồn — 05/10/2026

Người điều phối: Codex root. Model chính không được tự chuyển trong phiên. Các tên dưới đây là cấu hình thật khi gọi subagent, không phải suy đoán backend hoặc thay đổi reasoning được gọi là đổi model. Chi phí tiền thực tế chưa đo.

| Công việc | Model | Phạm vi |
|---|---|---|
| Tìm file, đọc nguồn, lập bảng khác biệt và log | gpt-6-luna, low | Chỉ đọc; dẫn đường file/đoạn mã; không kết luận chức năng chạy nếu chưa test |
| Sửa một tính năng hoặc lỗi hẹp đã có tiêu chí | gpt-6.1-sol, medium | Mỗi nhiệm vụ chỉ vài file, có invariant, regression test và báo phần chưa xác minh |
| Backup format/atomicity, migration, KDF/auth kiến trúc | gpt-6-astra, high nếu khả dụng | Triển khai rủi ro cao; thêm reviewer độc lập và targeted test thực thi |
| Review độc lập dữ liệu/auth/backup hoặc kiến trúc khó | gpt-6-astra, high | Không sửa cùng file với người triển khai; kiểm tra mất dữ liệu, race, compatibility, bảo mật và edge cases |
| Chấp nhận kết quả, chạy lại tests/build, ghi bàn giao | Root hiện tại | Đọc diff, không mặc định tin báo cáo agent |

Thứ tự hiện hành: đóng kiểm chứng A3 đang dở → spike M0 backup/dictionary/auth → đọc/Convert → auth/deploy/Android thật. TTS tùy chọn sau R0 theo người dùng 05/10. Không thêm feature mới trước khi đóng hoặc quyết định lại spike bằng số đo. Việc nhỏ root tự làm; không để agent sửa cùng file. Model không khả dụng/quota: ghi đúng lỗi và phần dở. Sonnet/Opus không có trong danh sách công cụ phiên này; không giả vờ đã dùng. Effort giữa vendor/version không tương đương; không suy nhân quả từ một lần Flash làm lỗi.

## Nguồn tham khảo chỉ đọc

- STV: `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93`; trang live: https://sangtacviet.vip/.
- Vietphrase: `D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn`; trang live: https://vietphrase.zxc.io.vn/.
- Từ điển người dùng: `D:\linh tinh\tm\STV Novel\mới chưa sửa\Vietphrase-data`.

Không sửa/xóa/đổi tên/chạy script ở D:, không đưa nguồn hoặc truyện lên Git/mạng. Chỉ quan sát hành vi, triển khai độc lập và dùng fixtures tổng hợp. Từ điển chỉ nhập khi người dùng chọn trong ứng dụng.

## C1 đã đối chiếu và sửa

Vietphrase `src/js/m_translation.js:93–124` hợp nhất Names → Names2 → NameList và ưu tiên khóa dài. App trước lượt này chọn tầng đầu tiên nên `Names: 李` che `Names2: 李明`. `src/language.ts` nay so khớp dài nhất tại vị trí hiện tại giữa ba tầng Name; cùng khóa ưu tiên Name của truyện > Names2 > Names. VP vẫn là fallback sau Name. Không hợp nhất thêm bản sao của toàn bộ từ điển mỗi lần Convert. Sáu tests tổng hợp tại `tests/core.test.ts` kiểm tra độ dài, trùng khóa, cô lập truyện, VP và UTF-16/emoji.

Đây là một phần tương đồng, không phải bằng chứng toàn bộ engine giống Vietphrase: upstream thay placeholder theo khóa trên toàn văn bản; app xử lý từng vị trí. Các ca tên chồng lấn bắt đầu ở vị trí khác, Luật Nhân, viết hoa, nhiều nghĩa và định dạng dấu câu cần đối chiếu riêng.

## Việc tiếp theo có phạm vi rõ

1. A3 đã qua phạm vi nhỏ (14 regression, reviewer38/38). Tiếp M0 backup streaming/A1: đo RAM/part và round-trip trước thay định dạng; model mạnh nhất khả dụng + reviewer độc lập.
2. Convert: đối chiếu nhập bộ từ điển thực và tên file. Inventory chỉ đọc xác nhận Vietphrase.txt 43.687.000 B, Names.txt 2.429.701 B, HanViet.txt 182.819 B, NameList.txt 90.996 B; còn Vietphrase_Chapter/Number, DaiTuNhanXung và Blacklist. Không mặc định các file phụ đều được hỗ trợ hoặc đã nhập. Test mapping bằng fixtures nhỏ trước benchmark lớn, không gửi dữ liệu mạng.
3. UI Convert: lập ca thao tác nhiều nghĩa/Name tạm/lưu/xuất/nhập, đối chiếu mở/ẩn bằng browser và ảnh. Chỉ nhận một thao tác nhỏ mỗi lượt, có test state và không mất Name.
4. A1/A4/A6 rồi A5/A7; sau đó TTS thật, private runtime và Windows/Android thật theo release gates.

Mỗi lượt phải thêm HANDOFF và DECISIONS, lưu model cấu hình, file/đoạn sửa, lý do, lệnh/kết quả, điểm chưa xác minh và nhiệm vụ kế tiếp. Không tự lập automation hoặc hứa chạy nền vô hạn.
