# Scripts kiểm tra và vận hành

Chạy từ thư mục `private-novel/`. Các script giữ nguyên đường dẫn để không làm hỏng lệnh và tài liệu cũ. Không chạy toàn bộ thư mục: một số script gọi dịch vụ thật hoặc sửa dữ liệu cloud.

## Tra theo mục đích

| Nhóm tên | Dùng khi nào |
|---|---|
| `smoke-*-production.mjs` | Kiểm luồng sau triển khai; đọc route mock, URL, fixture và cleanup của đúng script trước khi chạy |
| `smoke-cloud-local.mjs` | Kiểm luồng cloud với môi trường local được cấu hình trong script |
| `benchmark-*.mjs`, `benchmark-*.ts` | Đo Convert/AI, so prompt/model; có thể gọi AI thật và dùng quota |
| `probe-*.mjs`, `retest-*.ts` | Chẩn đoán một giả thuyết hoặc lỗi riêng; không phải suite bắt buộc |
| `measure-tts-gaps.mjs`, `check-tts-*.mjs` | Đo khoảng nghỉ và kiểm luồng TTS |
| `audit-chapter-splits.ts`, `compare-chapter-preview.ts` | Kiểm chia chương/preview |
| `plan-library-import.mjs` | Chuẩn bị nhập thư viện theo cấu hình của script |
| `setup-cloud-device.mjs`, `seed-default-dictionaries.mjs`, `cleanup-cloud-smoke.mjs` | Thao tác thiết bị, từ điển hoặc cleanup; đọc phạm vi dữ liệu trước khi dùng |
| `hash-password.mjs` | Công cụ hash qua `npm.cmd run auth:hash`, dùng khi yêu cầu cấu hình liên quan |
| `configure-capcut-session.mjs` | Kiểm file phiên cục bộ; chỉ gửi vào Pages secret khi có `--publish`; không nhận cookie qua chat/Git |
| `smoke-capcut-runtime.mjs`, `smoke-album-names-runtime.mjs` | Regression workerd/D1 cục bộ có upstream/fixture cô lập; đọc script trước khi chạy |
| `prepare/export/pack/profile-server-convert-probe.mjs` | Chuỗi chuẩn bị/đóng gói/đo corpus Convert; dữ liệu đầu ra nằm ngoài Git, không chạy nối tiếp tự động |
| `smoke-server-convert-worker.mjs`, `benchmark-server-convert-remote.mjs` | Kiểm/đo Worker Convert; phân biệt cấu hình local và remote, không gọi remote chỉ để lưu Git |

Các file `.ts` không có chung một runner trong `package.json`; dùng lệnh đã ghi trong tài liệu của tính năng và kiểm imports/env trước khi chạy. Không suy ra rằng mọi script chạy được bằng cùng một lệnh `node`.

## Lệnh thường dùng

```powershell
npm.cmd run dev
npm.cmd test -- tests/reader-route.test.ts
npm.cmd run build
npm.cmd run test:e2e -- e2e/tts-resume.spec.ts --workers=4 --reporter=line
```

Chọn lệnh theo mức rủi ro; không bắt buộc chạy cả bốn. `build` tạo `dist/`, không deploy. CI hiện được định nghĩa ở [ci.yml](../../.github/workflows/ci.yml).

Production nghe sách dùng cờ **không phải secret** `VITE_TTS_GATEWAY=capcut-v2` lúc build. Build mặc định giữ gateway cũ để tương thích regression; không dùng nhầm artifact mặc định để triển khai CapCut. Hướng dẫn phiên, build và smoke: [CAPCUT-TTS-SETUP.md](../docs/CAPCUT-TTS-SETUP.md). Chỉ lưu Git không cần build lại hoặc deploy server.

## Lưu output

```powershell
New-Item -ItemType Directory -Force .dsh-tmp/my-task | Out-Null
npm.cmd run build *> .dsh-tmp/my-task/build.log
```

Kiểm exit code và phần lỗi liên quan; giữ log thất bại để truy nguyên. Fixture smoke dùng dữ liệu tổng hợp cô lập. Kết quả Android layout phải ghi rõ là giả lập, không gọi là đã kiểm khóa màn hình Android thật.

[Bản đồ code](../src/README.md) · [Chỉ mục tài liệu](../docs/README.md) · [Quy tắc dự án](../../AGENTS.md)
