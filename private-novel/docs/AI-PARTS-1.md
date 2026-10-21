# AI parts + nhiều key — 14/10/2026

## M0/phạm vi và quyết định

Người dùng yêu cầu hoàn thiện chia chủ động/progress/resume/đọc sớm và cho phép nhiều key trong cùng chương để cải thiện tiến độ. Chỉ đạo này thay ràng buộc fan-out tuần tự cũ cho các phần khác nhau; vẫn chỉ dùng key đã cấp ở máy chủ, cùng provider/model policy, không thêm billing/tier/dependency.

TXT chia tạm khoảng1800 ký tự theo paragraph/câu/word boundary, bảo toàn mọi ký tự và surrogate pair; chương ngắn giữ một request. EPUB chia node/piece thành nhóm có ID nguyên vẹn. Kết quả ghép theo nguồn, không đổi chapterCount/source/revision/layout. Request đầu chọn model và trả hint an toàn tối đa2 workers; phần sau có thể đồng thời dùng hai key riêng. Ngữ cảnh trước tối đa300 ký tự là dữ liệu chỉ tham khảo, không dịch lại. Quota Google theo project; key cùngproject không nhânquota.

Keylease dùng bảng ai_key_health hiện có: conditional UPDATE disabled/busy/cooldown atomic, lease35s (request30s); owner monotonic last_used_at tránh trùng khi release/reacquire cùng mili giây; release CAS đúng owner. Giữlease đến hết bounded body/schema/STOP validation. Health update thông thường không được xóa lease. D1 lỗi failclosed; noDB chỉ memoryruntime. Hint đọc lại busy/disabled/modelcooldown hiện hành. Poolbusy trả retryAfter ngắn; key429/invalid giữpolicy hiện hành. TXT128k nguồn/display512k; TXT có nhiều phần và EPUB dùng chung600s/256 actualsends, đoạn ngắn240s/24. Mọi workers/retries chia cùng ngân sách.

Partcache disposable riêng (version/plan), keyed whole source signature + settings/matched Names + deterministic plan/index. Chỉpart STOP đãvalidate được lưu; guarded native transaction kiểm live book/source/revision/cancel và rollback. Cùng100records/32MiB với completecache; unknown rows giữ. Không export/cloud/backup; bookdelete xóa known cache. Completechapter cache chỉ nhận toàn bộ đủ. Preview chỉcontiguous prefix, state táchcomplete/TTS; output sai/thừa/duplicateIDs, out-of-order, late responses không công nhận. Dừng/lỗi giữparts có thểresume; sửa semantic miss cache.

## Gate nghiệm thu

Unit splitter (no punctuation/surrogates/lossless), parallel≤2/distinct keys, model/cooldown/invalid/cancel/bodyhang; native D1 claim/CAS/crossrequest; native cache rollback/source change/delete/latehash/eviction/unknown/exclusion; progress prefix/out-of-order/noTTS/noincompletefull; retry/reload reusesonlycompletedparts; EPUB style/image/ID reconstruction. Root fullunit+build+relevantE2E; independent Sol/high review/regression; production synthetic cô lập + request thật bounded. Logs .dsh-tmp/ai-parts/.

## Kiểm chứng code và UI

Reviewer gpt-6.1-sol/high: 14 files/247 PASS, gồm25ca độc lập D1/cache/session; không finding còn lại trong phạm vi. Root full107files/1426PASS, build PASS index-DpAl-zLI.js, E2E80PASS desktop/Androidlayout. Androidlayout không thay kiểm máy Android thật.

Giữ log fail: full đầu1425/1 lỗi expectation32000 cũ; review đồng ý thay1800 và giữ4model/503/nofullcache + kiểm chỉfirstprefix. E2E đầu dùng selector sai và EPUB fixture thiếu archive; sửa harness sang UI import EPUB thật/paragraph selectors, không đổi product để né lỗi. Build đầu sai kiểu styles trong fixture test; đổi thành {path,text}, unit11 và build PASS. Logs unit-final-verified/build-verified/e2e-final/review-final.

Giới hạn: cachephần cùng100rows/32MiB với completecache, có thể eviction; storagefail vẫn giữ phần trong RAM đến đổi truyện/reload. Không hứa nhânquota khi keys cùngproject. STOP/schema đủ không bảo đảm nội dung Gemini không sai thuật ngữ; Name riêng giúp ổn định cách gọi. Chỉ phần validated được resume; đổi source/prompt/Name/plan miss. Vị trí đọc AI giữpolicy cũ; TTS đợi đủ chương.

## Phát hành và nghiệm thu thật

Worker248a6474-6231-426c-8951-e5512544774f; Pagesdf649320/master, bundle index-DpAl-zLI.js, 14/10/2026. Wrangler4.147 giữversion/config/bindings/secrets; dryrun+deploy exit0, không migration/Git. Smoke freshcontext, chặn mọi APIcloud/state/prompts; chỉ synthetic qua AI thật, usertab không reload.

Production mock PASS: 3phần, lỗi ởpart2 vẫn lưu1+3; reload chỉgửipart2; complete reload0send; RAWgiữ. Log production-mock.log/json và ảnh production-mock-progress.png.

Production thật Gemini2.5 PASS với Name `$小精灵=tiểu tinh linh`: nguồn3936chars→13580chars, 3HTTP200; firstpreview12091ms/full27140ms. Part2(k2) +part3(k1) overlap; max2; HTTPdurations10777/14706/7957ms. Không cònHan, fullreload0send/RAWgiữ. Metadata chỉ nhãnkey an toàn, requestID/duration/capacity; khôngsecrets. Log production-real-names.log, production-real.json/-observed.json; ảnh production-real-progress.png/-complete.png. Lần thật đầu khôngName đã trả đủrequest nhưng cònHan trong `精灵`; giữfail production-real.log, khôngnớiassert noHan hayđổi product để né. Name riêng là cấu hình thuậtngữ, khôngbảo đảm mọi bản dịch khác tuyệtđối đúng.

Giữ limites ngoài scope: portablebackupEPUB>8MiB, Android thật/lockscreen/nghe tai, EPUB file D/mạngcloud thật chưa kiểm. Không mởaudit/backlog toànsản phẩm.
