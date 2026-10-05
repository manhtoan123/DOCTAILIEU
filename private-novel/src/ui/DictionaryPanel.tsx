import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../db';
import {hashBlob} from '../backup';
import {formatBytes,type DictKind} from '../domain';
import {resetLanguage,convert} from '../language-client';
import {errorText} from './common';

const labels:Record<DictKind,string>={vp:'Vietphrase',names:'Names chung',names2:'Names2 / Đại từ',hanviet:'Hán-Việt / Phiên âm',rules:'Luật Nhân ({0})'};

// Nhận biết tự động tên file → kind từ điển
const KIND_MAP: [RegExp, DictKind][] = [
  [/^vietphrase/i,        'vp'],
  [/^phienam|^hanviet/i,  'hanviet'],
  [/^names2|^pronouns|^daitunhanxung$/i, 'names2'],
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
  const [test, setTest] = useState('李明来到山门。');
  const [output, setOutput] = useState('');

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
      // Gộp, ưu tiên file mới cùng kind
      const map = new Map(prev.map(p => [p.kind, p]));
      for (const p of next) map.set(p.overrideKind ?? p.kind, p);
      return [...map.values()];
    });
  }

  function removeKind(kind: DictKind) { setPending(prev => prev.filter(p => (p.overrideKind ?? p.kind) !== kind)); }
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
      for (const p of pending) {
        const kind = p.overrideKind ?? p.kind;
        if (p.file.size > 80 * 1048576) throw new Error(`${p.file.name} vượt 80 MB.`);
        const sha256 = await hashBlob(p.file);
        await db.dictionaries.put({ kind, name: p.file.name, blob: p.file, sha256, updatedAt: Date.now() });
      }
      resetLanguage();
      setMessage(`Đã lưu ${pending.length} từ điển. Bấm "Kiểm tra Convert" để thử.`);
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
          <p className="muted">Nạp một lần trên thiết bị này. Không tải từ điển lên máy chủ.</p>
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
                      value={effectiveKind}
                      onChange={e => changeKind(i, e.target.value as DictKind)}
                      style={{marginLeft:'0.5rem'}}
                    >
                      {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <button onClick={() => removeKind(effectiveKind)}>Bỏ</button>
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
      </div>

      {/* Danh sách đã lưu */}
      <div className="panel">
        <h2>Từ điển đang dùng</h2>
        <div className="dictionary-list">
          {entries?.map(e => (
            <div key={e.kind}>
              <div>
                <strong>{labels[e.kind]}</strong>
                <span>{e.name} · {formatBytes(e.blob.size)}</span>
                <small title={e.sha256}>SHA-256: {e.sha256.slice(0, 16)}…</small>
              </div>
              <button onClick={async () => {
                if (confirm(`Gỡ ${e.name} khỏi trình duyệt? File gốc giữ nguyên.`)) {
                  await db.dictionaries.delete(e.kind);
                  resetLanguage();
                }
              }}>Gỡ</button>
            </div>
          ))}
        </div>
        {!entries?.length && <p className="muted">Chưa có từ điển. Reader TXT và TTS vẫn dùng được.</p>}
      </div>

      {/* Thử convert */}
      <div className="panel">
        <h2>Thử một đoạn</h2>
        <textarea aria-label="Văn bản thử Convert" value={test} onChange={e => setTest(e.target.value)} rows={4} maxLength={64000} />
        <button
          className="primary"
          disabled={busy || !entries?.length}
          onClick={async () => {
            setBusy(true);
            try {
              setOutput((await convert(test, [])).map(t => t.targetText).join(''));
              setMessage('Nạp từ điển và Convert thành công.');
            } catch (e) { setMessage(errorText(e)); }
            finally { setBusy(false); }
          }}
        >Kiểm tra Convert</button>
        {output && <div className="conversion-output">{output}</div>}
      </div>
    </section>
  );
}
