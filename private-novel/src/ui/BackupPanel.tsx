import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../db';
import {prepareBackup,download,stageBackup,restoreInfo,restoreBackup} from '../backup';
import type {BackupMode} from '../domain';
import {errorText} from './common';

export default function BackupPanel(){
  const books=useLiveQuery(()=>db.books.where('status').equals('ready').toArray());
  const [id,setId]=useState('');
  const [mode,setMode]=useState<BackupMode>('compact');
  const [plan,setPlan]=useState<Awaited<ReturnType<typeof prepareBackup>>>();
  const [part,setPart]=useState(0);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [infos,setInfos]=useState<Awaited<ReturnType<typeof restoreInfo>>[]>([]);
  const [conflictsMap,setConflictsMap]=useState<Record<string,'rename'|'replace'>>({});
  const [restoreDictsMap,setRestoreDictsMap]=useState<Record<string,boolean>>({});

  const pending=useLiveQuery(async()=>{
    const ids=new Set<string>();
    await db.restorePackets.each(p=>{ids.add(p.backupId);});
    return [...ids];
  },[]);

  async function restoreFiles(files:File[]){
    setBusy(true);
    try{
      const ids=await stageBackup(files,setMessage);
      setInfos(await Promise.all(ids.map(restoreInfo)));
      setMessage('Đã kiểm tra checksum. Kiểm tra thông tin xung đột trước khi khôi phục.');
    }catch(e){
      setMessage(errorText(e));
    }finally{
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">GIỮ LẠI NHỮNG TRANG SÁCH</span>
          <h1>Sao lưu & chuyển thiết bị</h1>
          <p className="muted">Windows và Android có thư viện riêng. Dùng các phần sao lưu để chuyển truyện và từ điển.</p>
        </div>
      </div>

      <div className="panel">
        <h2>Xuất một truyện</h2>
        <p>Bao gồm các chương, Name List và vị trí đọc. Chia thành các file nhỏ có checksum; tải đủ mọi phần.</p>
        
        <label>
          Chọn truyện
          <select value={id} onChange={e=>{setId(e.target.value);setPlan(undefined);setPart(0);}}>
            <option value="">— Chọn truyện —</option>
            {books?.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </label>

        <label>
          Chế độ sao lưu
          <select value={mode} onChange={e=>{setMode(e.target.value as BackupMode);setPlan(undefined);setPart(0);}}>
            <option value="compact">Gói gọn (Compact) — chỉ chương, Names và tiến độ đọc (nhẹ nhất)</option>
            <option value="portable">Đầy đủ (Portable) — kèm file TXT gốc và các bộ từ điển đang dùng</option>
          </select>
        </label>

        <p className="notice">
          {mode==='portable'
            ? 'Bản sao lưu Portable chứa toàn bộ dữ liệu tự túc (TXT gốc và từ điển đang dùng). Giúp khôi phục hoàn chỉnh trên thiết bị mới mà không cần tìm nạp lại từ điển.'
            : 'Bản sao lưu Compact không kèm TXT gốc hay bộ từ điển. Cần lưu riêng file gốc và nhập lại từ điển đúng SHA-256 trên thiết bị mới.'}
        </p>

        <button disabled={!id||busy} onClick={async()=>{
          setBusy(true);
          try{
            setPlan(await prepareBackup(id,{mode}));
            setPart(0);
            setMessage('Bản sao lưu đã sẵn sàng. Không sửa truyện trong lúc xuất.');
          }catch(e){
            setMessage(errorText(e));
          }finally{
            setBusy(false);
          }
        }}>
          Chuẩn bị sao lưu ({mode==='portable'?'Đầy đủ':'Gói gọn'})
        </button>

        {plan&&(
          <div className="notice">
            <p><strong>{plan.title}</strong> · {plan.total} phần · Chế độ: {plan.mode==='portable'?'Đầy đủ (Portable)':'Gói gọn (Compact)'}</p>
            <button className="primary" disabled={busy||part>=plan.total} onClick={async()=>{
              setBusy(true);
              try{
                const p=await plan.part(part);
                download(p.blob,p.name);
                setPart(n=>n+1);
              }catch(e){
                setMessage(errorText(e));
              }finally{
                setBusy(false);
              }
            }}>
              {part>=plan.total?'Đã gửi tải tất cả phần':`Tải phần ${part+1}/${plan.total}`}
            </button>
            {part>0&&<button onClick={()=>setPart(n=>Math.max(0,n-1))}>Tải lại phần trước</button>}
            <p className="muted">Kiểm tra thư mục tải xuống để chắc chắn trình duyệt đã lưu đủ file.</p>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Khôi phục bản sao</h2>
        <p>Chọn file <code>.tpbackup.json</code>. Có thể chọn bổ sung phần thiếu sau; dữ liệu đang chờ được giữ trong trình duyệt.</p>
        <input aria-label="Chọn các phần sao lưu" type="file" accept=".json" multiple disabled={busy} onChange={e=>{void restoreFiles(Array.from(e.target.files||[]));e.target.value='';}}/>
        {!!pending?.length&&<button onClick={async()=>{try{setInfos(await Promise.all(pending.map(restoreInfo)));}catch(e){setMessage(errorText(e));}}}>Xem các bản đang chờ ({pending.length})</button>}

        {infos.map(info=>{
          const choice=conflictsMap[info.id]||'rename';
          const doRestoreDicts=restoreDictsMap[info.id]??true;

          return (
            <div className="restore-row" key={info.id}>
              <strong>{info.title}</strong>
              <small style={{marginLeft:8,color:'var(--muted)'}}>
                [{info.mode==='portable'?'Bản Portable':'Bản Compact'}] · {info.received}/{info.total} phần
              </small>

              {info.conflicts.bookExists&&(
                <div className="notice" style={{margin:'10px 0'}}>
                  <p><strong>⚠️ Phát hiện trùng lặp:</strong> Truyện "{info.conflicts.existingBookTitle}" đã có trong thư viện.</p>
                  <label className="check" style={{marginBottom:4}}>
                    <input type="radio" name={`conflict-${info.id}`} value="rename" checked={choice==='rename'} onChange={()=>setConflictsMap(prev=>({...prev,[info.id]:'rename'}))}/>
                    Tạo bản sao mới ("{info.title} (khôi phục)")
                  </label>
                  <label className="check">
                    <input type="radio" name={`conflict-${info.id}`} value="replace" checked={choice==='replace'} onChange={()=>setConflictsMap(prev=>({...prev,[info.id]:'replace'}))}/>
                    Ghi đè bản cũ trong thư viện
                  </label>
                </div>
              )}

              {info.mode==='portable'&&info.conflicts.providedDictionaries.length>0&&(
                <div style={{margin:'6px 0'}}>
                  <label className="check">
                    <input type="checkbox" checked={doRestoreDicts} onChange={e=>setRestoreDictsMap(prev=>({...prev,[info.id]:e.target.checked}))}/>
                    Tự động cài đặt {info.conflicts.providedDictionaries.length} bộ từ điển đi kèm trong gói
                  </label>
                </div>
              )}

              {info.conflicts.missingDictionaries.length>0&&(
                <p className="muted" style={{color:'#b05d4b',margin:'6px 0'}}>
                  Thiếu từ điển: {info.conflicts.missingDictionaries.map(d=>d.name).join(', ')}. Hãy nhập lại sau khi khôi phục.
                </p>
              )}

              {info.sources.length>0&&(
                <p className="muted" style={{margin:'4px 0'}}>
                  File nguồn: {info.sources.length} file ({info.sources.filter(s=>s.hasData).length} file có dữ liệu đính kèm).
                </p>
              )}

              <div style={{marginTop:10}}>
                <button className="primary" disabled={busy||!info.complete} onClick={async()=>{
                  setBusy(true);
                  try{
                    await restoreBackup(info.id,{
                      onConflict:choice,
                      restoreDictionaries:doRestoreDicts
                    });
                    setMessage(`Đã khôi phục truyện "${info.title}" vào tủ sách.`);
                    setInfos(old=>old.filter(i=>i.id!==info.id));
                  }catch(e){
                    setMessage(errorText(e));
                  }finally{
                    setBusy(false);
                  }
                }}>
                  Khôi phục {choice==='replace'?'(Ghi đè)':'(Bản mới)'}
                </button>
                <button disabled={busy} onClick={async()=>{
                  await db.restorePackets.where('backupId').equals(info.id).delete();
                  setInfos(old=>old.filter(i=>i.id!==info.id));
                }}>
                  Xóa phần tạm
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {message&&<p className="notice" role="status">{message}</p>}
    </section>
  );
}
