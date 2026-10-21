import {removeSharedDictionary,loadSharedDictionaries} from '../../sync-cloud/services/shared-dictionaries';
import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../../../core/db';
import {installDictionaries} from '../services/dictionary-import';
import {formatBytes,type DictKind} from '../../../core/domain';
import {resetLanguage} from '../services/language-client';

import {errorText} from '../../../shared/components/common';

const labels:Record<DictKind,string>={vp:'Vietphrase',names:'Names chung',names2:'Names2',hanviet:'Hán-Việt / Phiên âm',rules:'Luật Nhân ({0})',chapter:'Vietphrase Chapter',number:'Vietphrase Number',pronouns:'Đại từ',blacklist:'Blacklist',english:'Trung–Anh'};

// Nhận biết tự động tên file → kind từ điển
const KIND_MAP: [RegExp, DictKind][] = [
  [/^(vietphrase_)?chapter$|^x_chapter$/i,'chapter'],
  [/^(vietphrase_)?number$|^x_number$/i,'number'],
  [/^pronouns$|^daitu$|^daitunhanxung$|^dai-tu-nhan-xung$/i,'pronouns'],
  [/^blacklist$|^ignorelist$|^ignoredchinesephrases$/i,'blacklist'],
  [/^english$|^babylon$/i,'english'],
  [/^vietphrase/i,        'vp'],
  [/^phienam|^hanviet/i,  'hanviet'],
  [/^names2|^name2$/i, 'names2'],
  [/^names/i,             'names'],
  [/^luatnhan|^luat_nhan|^!luatnhan/i, 'rules'],
];
function detectKind(filename: string): DictKind | null {
  const base = filename.replace(/\.txt$/i, '').trim();
  for (const [re, kind] of KIND_MAP) if (re.test(base)) return kind;
  return null;
}

interface PendingFile { file: File; kind: DictKind; overrideKind?: DictKind }

export default function DictionaryPanel() {
  const entries = useLiveQuery(() => db.dictionaries.toArray(), []);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reports,setReports]=useState<{name:string;valid:number;invalid:number}[]>([]);

  function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const unknown: string[] = [];
    const next: PendingFile[] = [];
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith('.txt')) continue;
      const kind = detectKind(f.name);
      if (!kind) { unknown.push(f.name); continue; }
      next.push({ file: f, kind });
    }
    if (unknown.length) setMessage(`Không nhận biết loại: ${unknown.join(', ')} — bỏ qua. Chỉ nhận Vietphrase / PhienAm / HanViet / Names / Names2 / Pronouns / DaiTuNhanXung / LuatNhan.`);
    else setMessage('');
    setPending(prev => {
      // Keep all explicitly selected files; only replace the same filename.
      const map = new Map(prev.map(p => [p.file.name, p]));
      for (const p of next) map.set(p.file.name, p);
      return [...map.values()];
    });
  }

  function removeFile(index:number) { setPending(prev => prev.filter((_,i) => i!==index)); }
  function changeKind(idx: number, newKind: DictKind) {
    setPending(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], overrideKind: newKind };
      return next;
    });
  }

  async function savePending() {
    if (!pending.length) return;
    setBusy(true); setMessage('Đang lưu…');
    try {
      setReports(await installDictionaries(pending.map(p=>({file:p.file,kind:p.overrideKind??p.kind}))));
      resetLanguage();
      // Persist is a best-effort browser grant; a denied grant never undoes the
      // dictionary transaction or requires selecting the same file again.
      void navigator.storage?.persist?.().catch(()=>{});
      setMessage(`Đã lưu ${pending.length} file. Các file cùng loại được gộp theo thứ tự; khóa trùng lấy nghĩa ở file sau.`);
      setPending([]);
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">NGÔN NGỮ CỦA RIÊNG BẠN</span>
          <h1>Từ điển &amp; Convert</h1>
          <p className="muted">Chọn file và bấm Lưu một lần trên thiết bị này. Những lần mở hoặc tải lại trang sau sẽ tự dùng từ điển đã lưu.</p>
        </div>
      </div>

      {/* Nhập nhiều file cùng lúc — tự nhận biết */}
      <div className="panel">
        <h2>Nhập từ điển</h2>
        <p className="muted">
          Chọn một hoặc nhiều file TXT cùng lúc. App tự nhận biết loại dựa theo tên file:<br />
          <code>Vietphrase.txt</code> → Vietphrase &nbsp;|&nbsp;
          <code>PhienAm.txt</code> / <code>HanViet.txt</code> → Hán-Việt &nbsp;|&nbsp;
          <code>Names.txt</code> → Names chung &nbsp;|&nbsp;
          <code>Names2.txt</code> / <code>Pronouns.txt</code> / <code>DaiTuNhanXung.txt</code> → Names2 / Đại từ &nbsp;|&nbsp;
          <code>LuatNhan.txt</code> → Luật Nhân
        </p>
        <label>
          Chọn file TXT (có thể chọn nhiều)
          <input
            type="file"
            accept=".txt"
            multiple
            disabled={busy}
            onChange={e => { pickFiles(e.target.files); e.target.value = ''; }}
          />
        </label>

        {pending.length > 0 && (
          <div className="dictionary-list" style={{marginTop:'0.75rem'}}>
            {pending.map((p, i) => {
              const effectiveKind = p.overrideKind ?? p.kind;
              return (
                <div key={i}>
                  <div>
                    <strong>{p.file.name}</strong>
                    <span>{formatBytes(p.file.size)}</span>
                    <select
                      disabled={busy}
                      value={effectiveKind}
                      onChange={e => changeKind(i, e.target.value as DictKind)}
                      style={{marginLeft:'0.5rem'}}
                    >
                      {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <button disabled={busy} onClick={() => removeFile(i)}>Bỏ</button>
                </div>
              );
            })}
            <div style={{marginTop:'0.5rem',display:'flex',gap:'0.5rem',alignItems:'center'}}>
              <button className="primary" disabled={busy} onClick={savePending}>
                Lưu {pending.length} file vào trình duyệt
              </button>
              <button disabled={busy} onClick={() => { setPending([]); setMessage(''); }}>Hủy</button>
            </div>
          </div>
        )}

        {message && <p className="notice" role="status">{message}</p>}
        {reports.map((r,i)=><p key={i} className="muted">{r.name}: {r.valid.toLocaleString('vi-VN')} dòng hợp lệ · {r.invalid.toLocaleString('vi-VN')} dòng bị bỏ qua.</p>)}
        <p className="muted">Các file cùng loại được gộp theo thứ tự đang hiển thị, khóa trùng ưu tiên file sau. Khi lưu sẽ thay bộ cùng loại đang dùng. Chapter, Number và Đại từ giữ đúng tầng ưu tiên. NameList.txt nhập ở bảng Name List cố định bên dưới.</p>
      </div>

      {/* Danh sách đã lưu */}
      <div className="panel">
        <h2>Từ điển đã lưu trên thiết bị</h2>
        <p className="muted">Không cần chọn lại file sau reload. Chỉ nhập lại khi muốn cập nhật bộ từ điển. Đổi thiết bị, đổi địa chỉ web hoặc xóa dữ liệu trình duyệt cần nhập lại.</p>
        <div className="dictionary-list">
          {entries?.map(e => (
            <div key={e.kind}>
              <div>
                <strong>{labels[e.kind]}</strong>
                <span>{e.name} · {formatBytes(e.blob.size)}</span>
                <small title={e.sha256}>SHA-256: {e.sha256.slice(0, 16)}…</small>
              </div>
              <button disabled={busy} onClick={async () => {
                setBusy(true);try {await removeSharedDictionary(e.kind);resetLanguage();}catch(error){setMessage(errorText(error));}finally{setBusy(false);}
              }}>Gỡ</button>
            </div>
          ))}
        </div>
        {entries===undefined?<p role="status">Đang kiểm tra từ điển đã lưu…</p>:!entries.length&&<p className="muted">Chưa lưu từ điển trên địa chỉ web này. Chọn file rồi bấm Lưu để dùng những lần sau.</p>}
      </div>
    </section>
  );
}
