# Thứ tự model dự phòng

## Hành vi

- Danh sách thứ tự nằm trong Cài đặt → Dịch AI, dùng chung trên thiết bị và bao gồm toàn bộ model trong bộ chọn hiện tại.
- Mỗi hàng có nút cầm kéo ghi rõ “Kéo” và hướng dẫn giữ nút rồi thả vào vị trí mới. Trong lúc kéo, hàng đích có vạch accent phía trước/sau; vùng kéo và nút lên/xuống tối thiểu 44px. Nút lên/xuống vẫn hỗ trợ thao tác không dùng kéo. Thứ tự tự lưu vào cài đặt AI chung.
- Reader không còn hiển thị danh sách fallback trong bảng Dịch AI. Khi bật tự động hạ model, model ưu tiên chạy trước; các model khác được thử theo thứ tự vòng bắt đầu sau model ưu tiên. Chế độ cố định vẫn chỉ dùng model đã chọn.
- Đổi thứ tự không làm mất bản dịch chương đã hoàn tất; thứ tự được bỏ khỏi identity nội dung của cache và các kết quả đã hoàn tất vẫn được xét theo tập model mới.

## Tham khảo và áp dụng

- [React Spectrum: ví dụ TableView sắp xếp bằng kéo thả](https://github.com/adobe/react-spectrum/blob/main/packages/%40react-spectrum/s2/stories/TableView.stories.tsx) dùng thứ tự đích để cập nhật collection. Ứng dụng áp dụng ý tưởng reorder danh sách theo vị trí thả bằng pointer events, không thêm thư viện; bổ sung nút lên/xuống để hỗ trợ thao tác khác.
- [Atlassian Pragmatic drag and drop](https://github.com/atlassian/pragmatic-drag-and-drop) cung cấp visual drop indicator riêng cho trải nghiệm reorder. Ứng dụng áp dụng vạch accent trước/sau hàng đích để người kéo thấy vị trí thả; chỉ dùng CSS/pointer hiện có, không thêm dependency.
- [shadcn/ui Card](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/card.tsx) ghép surface và foreground theo token ngữ nghĩa. Áp dụng điều chỉnh UI: dùng lại token surface/inset/border/accent của app cho nền hàng, chữ và điều khiển thay vì nền trắng cố định; thu gọn hàng để giảm chiều dài trang.

## Kiểm tra và giới hạn

- `npm.cmd run build`: PASS sau cập nhật style. Lần chạy cần đặt `TEMP`/`TMP` riêng trong `.dsh-tmp` vì Windows chặn esbuild xóa thư mục tạm mặc định; hai lần chạy ở thư mục tạm mặc định thất bại ở bước dọn temp sau khi transform.
- Local preview Edge 663×854, dark theme: ảnh xác nhận tay nắm “Kéo”, nút mũi tên đủ lớn, vạch thả nhìn thấy. Mô phỏng thao tác trên DB IndexedDB tạm: kéo Gemini 3.8 Flash từ hàng 1 xuống hàng 4 đổi đúng thứ tự và tự lưu. Chưa kiểm tra Android thật.
- Deploy Cloudflare Pages production `591d1c98` (rollback `515c628c`), nhánh `master`; deployment chứa toàn bộ `dist` từ working tree có thay đổi khác ngoài phạm vi.
- Production smoke chỉ đọc: `/settings/ai` trả HTTP 200; bundle có hướng dẫn giữ nút kéo, stylesheet có drop marker và vùng điều khiển 44px. Thao tác kéo được mô phỏng ở local preview, chưa kiểm tra trực tiếp trên production hoặc Android.
