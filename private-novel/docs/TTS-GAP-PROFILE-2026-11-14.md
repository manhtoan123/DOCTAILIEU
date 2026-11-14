# Đo khoảng chuyển TTS trên web — 14/11/2026

## Source hiện hành

Reader production tạo một HTMLAudioElement cho phiên nghe và thay Blob URL theo từng đoạn MP3. Các nút play/pause/stop qua Media Session đã có trong tts.ts. Wake Lock không thấy trong source. ContinuousTtsPlayer dùng MediaSource vẫn là nhánh thử nghiệm; Reader production không bật nó mặc định sau phản hồi Android về độ khựng.

Báo cáo ý tưởng ban đầu nói chưa có Media Session và gợi ý Web Audio có thể đạt 0 ms; hai nhận định đó không được coi là hiện trạng đã kiểm chứng. Ý tưởng Gapless-5 chỉ là hướng tham khảo để xếp lịch audio; Web Audio không xóa phần im lặng đã nằm trong file MP3.

## Fixture và kết quả

Edge headless trên Windows, ứng dụng được phục vụ từ Vite dev với cấu hình gateway legacy, nhưng request gateway được chặn bằng Playwright route và trả cùng fixture MP3 đã có trong repo. Không gửi câu thử ra ngoài và không dùng truyện, AI hoặc cloud thật.

Fixture tổng hợp tiếng Việt có 48 câu/2.294 ký tự; player gom thành 24 đoạn, phát bằng một Audio element. Tất cả 23 lần chuyển đều thấy đoạn kế sẵn sàng:

- Sự kiện ended → playing: p50 27,7 ms, p95 32,3 ms, lớn nhất 33,8 ms.
- waiting events: 24; stalled events: 0; số Audio element: 1.
- Giải mã fixture riêng: 4.344 ms, 48 kHz, ngưỡng biên độ 0,01; im lặng đầu 114,3 ms, cuối 138,4 ms.

Khoảng p50/p95 là độ trễ sự kiện media trong fixture playback, không phải toàn bộ khoảng im lặng tai nghe. Thời gian đầu/cuối MP3 được đo riêng; phép đo này không thu waveform output xuyên ranh giới từng đoạn và không áp các giá trị fixture cho mọi giọng hoặc voice output mới.

## Kết quả và giới hạn

Không thay đổi player. Trong điều kiện fixture không có độ trễ mạng, phần chuyển media ngắn; sample MP3 lại có im lặng biên đáng kể. Chưa có kết luận về gateway CapCut production, độ trễ mạng/inference, chất lượng giọng, cảm nhận người nghe, chạy nền hay Android thật. Do đó không gọi hệ thống gapless và không bật MediaSource thử nghiệm.

Không gửi request live trong lượt rà này. `functions/api/tts.ts` gọi `handleCapcutTts`; trước khi gọi CapCut, `server/capcut-tts.ts` dùng `admit()` để ghi các bucket giới hạn lượt vào D1 production. Không có binding cô lập, nên chỉ giữ phép đo fixture desktop; gap với audio gateway thật và Android vẫn chưa đo.

Script tạm tái hiện trong checkout: .dsh-tmp/tts-direct-probe.mjs. Lượt chạy scripts/check-tts-acceptance.mjs không tạo số liệu: Reader fixture mắc ở chờ AI, báo cáo ghi 0 request TTS; không được tính là lỗi audio hoặc gateway.

Nguồn tham khảo: [Gapless-5](https://github.com/regosen/Gapless-5) (HTML Audio/Web Audio scheduling), [Media Session API](https://developer.chrome.com/blog/media-session). Chỉ tham khảo; không sao chép hay thêm dependency.
