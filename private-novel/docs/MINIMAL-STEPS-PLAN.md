# Thư viện tự động, ít thao tác — hiện hành07/10/2026

Người dùng chọn: ai cóURL đọc/thêm/xóa, mọithiếtbịadmin; Vietphrase sẵn; bỏmenuSao lưu/Đồngbộ thủcông. Productioneca0c5c4 đã kiểm.

## Luồng sử dụng
1. Mởweb → Tủsách thấy cảlocal/cloud. Khôngpassword/link.
2. Thêmtruyện → chọnfile/folder hoặcdánchữ → xemtrước/xácnhận. App giữlocal trước, tựgửi snapshot.
3. Đọc → tựtảitruyện nếu chưaởmáy, tựchuẩnbị từđiểnmặcđịnh lầnđầu. FileTXT mỗifile1truyện; folder mỗifiletrực tiếp1chương.
4. Chạm từ → Namepopupfixed/tạm/truyện/chung theoReaderđãcó. Name sửa sauthêm chưafullsync cloud.
5. ⋯→Xóa → confirmation, cloudfirst; đứtmạnggiữknownuploadedlocal. Khođãxóa khôngtựuploadlại; peerlocal giữbảnđọc đãtải.

ThanhchínhTủsách/Càiđặt. ModepublicCàiđặtchỉConvert&từđiển/Thôngtin, khôngnútSync/Backup/Kết nối. Phầnbackup/privatefallbackgiữsource đểtránhphá dữliệu/tươngthích, khônglàUXproduction.

## Đã có vàđã kiểm
| ID | Hiện trạng |
|---|---|
| FAST-1 | PersistentConvertcache16MiB/256entries bypasswarmqueue khihit; workerload vẫncầnchochươngmới/lookup |
| UI-1/2 | Mộtimportbutton, menu⋯, mainnav2/settingspublic2 |
| UI-3 | Cataloglocal/cloudIDmerged, startup/focus/30smetadatarefresh, oneclickdownload/read |
| CLOUD-DELETE | Permanenttombstone, Originchecks, anti-resurrection/client410marker, nopeerblindwipe |
| DICT-SEED |7file53.5MBseedR2, clienthash/UTF8/atomicmissingkinds; reloadnoredownloadfile |
| NATIVE-STREAM | FixedLengthnativeIO sửa large200truncated;43.7MBSHA3GET và16MiBbook/cancelworkerd |

Root363unitreported/31files(knownbackupfails),build0,72repeatE2E; independentastre134/sol119. Productionfreshcold9.3s/8.7s, reload0rawdictdownloads; chưaAndroidthật/RAM/fullrelease.

## Công việc còn lại
- STORAGE-2: giữoriginalTXT/EPUB/dictionarychanges vàfullName/progress/chapter revisionsync, xungđột khôngmấtbảnsửa.
- GC-1: quota/R2orphan cleanup bằngraceproof. Current9GBreservation kểcảdeletedkhôngreclaim;32MiB/snapshot.
- EPUB-1: ảnh/spine/TOC/Convert/editName/sanitization/originals; khôngnúthỗtrợgiả.
- LIBRARY-1: mục→truyện→chương, xóa mục khôngxóatruyện.
- FAST-2: đo/bộcompiledindex hoặccompressedfirstfetch; khônghứa0ms.
- RELEASE-1: sửaknownbackup/gate, streaminglarge/CPU/RAM/Windows+Androidhardware.20GB0VNĐ chưanghiệmthu.

Invariant: localfirst, uploadnội dung đãngườidùngchọn; sourceDreadonly/khôngtựuploadkhotruyện. Autostoragekhôngbackupđầyđủ. Khôngoverwrite/removeedit/cancelblind, khôngchefailure. Data/auth/migration reviewđộclậpthực chạy, rootdiff+unit/build/E2E, appendlog/DECISIONS mỗi phiên. HistorytrongHANDOFF-LOG giữnguyên.
