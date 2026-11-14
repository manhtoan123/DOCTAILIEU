# Dư chữ 的 trong Convert — 13/11/2026

**Trạng thái:** đã sửa, regression 9/9 + cache 6/6, build thành công và deploy Pages production `51fe6e3b` ngày 13/11/2026 (rollback `e0c166f4`).

Reader Convert dùng `referenceConvert`, khác đường AI. Nếu một mục từ/Name trả nguyên văn một token kết thúc bằng `的` ngay sau tên Latin hoặc dấu câu đóng, bộ lọc bỏ riêng `的` khỏi phần hiển thị; giữ token nguồn và offset để tra/sửa Name. Các đầu vào Hán-Hán như `老人的` không bị thay đổi. Không áp dụng luật xóa `的` tổng quát vì đây còn là trợ từ sở hữu và định ngữ. Tăng `CONVERT_CACHE_VERSION` lên 3 để kết quả theo thuật toán cũ không che mất sửa đổi sau khi tải lại.

Tham khảo [chi-vi/qt_plus](https://github.com/chi-vi/qt_plus): engine rule-based nêu rõ cần luật ngữ pháp theo ngữ cảnh để điều chỉnh nghĩa và trật tự; ý tưởng được áp dụng ở đây là giới hạn theo cấu trúc xác định, không thêm engine, dependency hay provider. Đây không phải bộ phân tích ngữ nghĩa tổng quát.

Kiểm tra: `npm.cmd test -- tests/reference-convert.test.ts tests/convert-cache.test.ts` 15/15; build thành công với TEMP/TMP trong `.dsh-tmp/build-convert-residue` sau lỗi AccessDenied ở Windows `%TEMP%`. Pages HTML/JS HTTP 200; SHA-256 bundle production khớp artifact build. Chưa kiểm trực tiếp với dữ liệu từ điển riêng của người dùng hoặc Android. Synthetic fixtures chứng minh quy tắc lọc hai cấu trúc xác định và giữ ca Hán sở hữu; chúng không chứng minh nguyên nhân từ điển cụ thể của hai token production.
