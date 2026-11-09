import {removeSharedDictionary} from '../../sync-cloud/services/shared-dictionaries';
import {useEffect,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../../../core/db';
import {installDictionaries} from '../services/dictionary-import';
import {formatBytes,type DictKind} from '../../../core/domain';
import {resetLanguage} from '../services/language-client';
import {readServerProfile,replaceServerProfile,serverOrigin,setConvertBackend,useConvertBackend} from '../services/convert-server-client';
import type {ProfileStatus} from '../services/convert-server-protocol';

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
  const backend=useConvertBackend();
  const entries=useLiveQuery(async()=>backend==='local'?await db.dictionaries.toArray():undefined,[backend]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reports,setReports]=useState<{name:string;valid:number;invalid:number}[]>([]);
  const [remote,setRemote]=useState<ProfileStatus>();
  const [uploading,setUploading]=useState(false);
  const transfer=useRef<AbortController|null>(null);
  useEffect(()=>()=>transfer.current?.abort(),[]);

  function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const unknown: string[] = [];
    const next: PendingFile[] = [];
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith('.txt')) continue;
      const kind = detectKind(f.name);
      if (!kind&&backend==='local') { unknown.push(f.name); continue; }
      next.push({ file: f, kind:kind??'vp' });
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

  async function checkServer(){
    setBusy(true);setMessage('Đang kiểm tra máy chủ…');
    try {
      setRemote(await readServerProfile());setMessage('');
    } catch(error) {
      setRemote(undefined);setMessage(errorText(error));
    } finally {setBusy(false);}
  }

  async function saveServer(remove=false){
    if(!remote||remote.state==='loading'||transfer.current)return;
    const controller=new AbortController();
    transfer.current=controller;setUploading(true);setBusy(true);
    setMessage(remove?'Đang gỡ bộ từ điển trên máy chủ…':'Đang gửi và dựng chỉ mục trên máy chủ…');
    try {
      setRemote(await replaceServerProfile(remove?[]:pending.map(({file,kind,overrideKind})=>({file,kind:overrideKind??kind})),remote,controller.signal));
      if(!remove)setPending([]);
      setMessage(remove?'Đã gỡ bộ từ điển trên máy chủ.':'Đã lưu TXT và dựng chỉ mục trên máy chủ.');
    } catch(error) {
      setRemote(undefined);setMessage(errorText(error));
    } finally {
      transfer.current=null;setUploading(false);setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <h1>Từ điển &amp; Convert</h1>
          <p className="muted">Chọn nơi xử lý khi bấm Convert hoặc tra từ. Reader ở Bản gốc đọc nội dung nguồn và dùng tiêu đề có sẵn.</p>
        </div>
      </div>
      {(serverOrigin||backend==='server')&&<div className="panel">
        <label>Đích Convert
          <select value={backend} disabled={busy} onChange={event=>{
            try {
              setConvertBackend(event.target.value==='server'?'server':'local');resetLanguage();
              setRemote(undefined);setMessage('');setReports([]);
            } catch(error){setMessage(errorText(error));}
          }}>
            {backend==='unset'&&<option value="unset" disabled>Chọn nơi xử lý</option>}
            <option value="local">Thiết bị này</option>
            <option value="server">Máy chủ riêng</option>
          </select>
        </label>
        {backend==='server'&&<>
          <p className="muted">Chữ cần Convert hoặc tra từ, tùy chọn và Name đang áp dụng sẽ gửi tới {serverOrigin??'máy chủ riêng'}. Chỉ những TXT bạn bấm gửi mới được lưu trên đó. Khi kết nối lỗi, hãy thử lại hoặc tự chọn Thiết bị này.</p>
          <button disabled={busy||!serverOrigin} onClick={()=>void checkServer()}>Kiểm tra máy chủ</button>
          {remote&&<>
            <p role="status">{{
              loading:'Máy chủ đang nạp chỉ mục. Hãy kiểm tra lại sau.',
              ready:'Máy chủ sẵn sàng.',
              empty:'Máy chủ chưa có từ điển.',
              error:'Máy chủ không mở được từ điển. Bạn có thể thay bộ TXT.',
            }[remote.state]}</p>
            {!!remote.files.length&&<ol>{remote.files.map((file,index)=><li key={index}>{file.name} · {labels[file.kind]} · {formatBytes(file.bytes)}</li>)}</ol>}
            {(remote.state==='ready'||remote.state==='error')&&<button disabled={busy} onClick={()=>void saveServer(true)}>Gỡ toàn bộ từ điển trên máy chủ</button>}
          </>}
          {uploading&&<button onClick={()=>transfer.current?.abort()}>Hủy cập nhật máy chủ</button>}
        </>}
      </div>}

      {/* Nhập nhiều file cùng lúc — tự nhận biết */}
      {backend!=='unset'&&<div className="panel">
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
              {backend==='server'?<button className="primary" disabled={busy||!remote||remote.state==='loading'} onClick={()=>void saveServer()}>
                Gửi {pending.length} file và thay bộ trên máy chủ
              </button>:<button className="primary" disabled={busy} onClick={savePending}>Lưu {pending.length} file vào trình duyệt</button>}
              <button disabled={busy} onClick={() => { setPending([]); setMessage(''); }}>Hủy</button>
            </div>
          </div>
        )}

        {message && <p className="notice" role="status">{message}</p>}
        {reports.map((r,i)=><p key={i} className="muted">{r.name}: {r.valid.toLocaleString('vi-VN')} dòng hợp lệ · {r.invalid.toLocaleString('vi-VN')} dòng bị bỏ qua.</p>)}
        <p className="muted">Các file cùng loại theo thứ tự đang hiển thị, khóa trùng ưu tiên file sau. {backend==='server'?'Chọn đúng loại trước khi gửi. Bộ mới thay toàn bộ TXT trên máy chủ.':'Khi lưu sẽ thay bộ cùng loại trên thiết bị.'}</p>
      </div>}

      {/* Danh sách đã lưu */}
      {backend==='local'&&<div className="panel">
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
      </div>}
    </section>
  );
}
