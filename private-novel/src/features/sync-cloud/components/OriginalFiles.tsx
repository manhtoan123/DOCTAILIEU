import {useEffect,useRef,useState,type SyntheticEvent} from 'react';
import {db} from '../../../core/db';
import {hashBlob} from '../../import-export/services/backup';
import {downloadOriginal,listBookOriginals,type CloudOriginal} from '../services/cloud-original-client';
import {usableLocalOriginal} from '../../import-export/services/source-data';
import {formatBytes,type SourceFile} from '../../../core/domain';
import {sanitizeSourceFilename} from '../../library/services/title-resolver';

type Entry={id:string;name:string;bytes:number;local?:SourceFile;cloud?:CloudOriginal};
function identity(source:SourceFile){return JSON.stringify([source.id,source.bookId,source.name,source.relativePath,source.encoding,source.sha256,source.bytes,source.dataStatus]);}

export function OriginalFiles({bookId}:{bookId:string}){
  const [open,setOpen]=useState(false),[entries,setEntries]=useState<Entry[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const alive=useRef(false),epoch=useRef(0),inFlight=useRef(false),url=useRef<string|undefined>(undefined),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const clearUrl=()=>{if(timer.current)clearTimeout(timer.current);timer.current=undefined;if(url.current)URL.revokeObjectURL(url.current);url.current=undefined;};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;clearUrl();};},[bookId]);
  useEffect(()=>{
    if(!open)return;const generation=++epoch.current;setLoading(true);setMessage('');setEntries([]);
    const localQuery=db.sources.where('bookId').equals(bookId).toArray();
    void localQuery.then(sources=>{if(alive.current&&epoch.current===generation){setEntries(sources.map(source=>({id:source.id,name:source.name,bytes:source.bytes,local:source})));setLoading(false);}}).catch(()=>{});
    void (async()=>{
      const [local,cloud]=await Promise.allSettled([localQuery,listBookOriginals(bookId)]);
      if(!alive.current||epoch.current!==generation)return;
      const merged=new Map<string,Entry>();if(local.status==='fulfilled')for(const source of local.value)merged.set(source.id,{id:source.id,name:source.name,bytes:source.bytes,local:source});
      if(cloud.status==='fulfilled')for(const item of cloud.value){const prior=merged.get(item.descriptor.sourceId);merged.set(item.descriptor.sourceId,{...prior,id:item.descriptor.sourceId,name:prior?.name??item.descriptor.name,bytes:prior?.bytes??item.descriptor.bytes,cloud:item});}
      setEntries([...merged.values()]);if(local.status==='rejected'||(cloud.status==='rejected'&&![...merged.values()].some(item=>usableLocalOriginal(item.local))))setMessage('Chưa tải được danh sách file gốc.');
    })().finally(()=>{if(alive.current&&epoch.current===generation)setLoading(false);});
    return()=>{epoch.current++;};
  },[bookId,open]);
  function toggle(event:SyntheticEvent<HTMLDetailsElement>){const next=event.currentTarget.open;if(!next)epoch.current++;setOpen(next);}
  async function save(entry:Entry){
    if(inFlight.current)return;inFlight.current=true;setBusy(entry.id);setMessage('');const generation=epoch.current;
    const current=()=>alive.current&&epoch.current===generation;
    const guard=async()=>{if(!current())throw new Error('stale');const book=await db.books.get(bookId);if(!current()||book?.status!=='ready')throw new Error('stale');if(entry.local){const source=await db.sources.get(entry.id);if(!current()||!source||identity(source)!==identity(entry.local))throw new Error('stale');}};
    try{
      let blob:Blob|undefined,name=entry.name;
      if(entry.local){
        const source=await db.sources.get(entry.id);
        if(!source||source.bookId!==bookId||identity(source)!==identity(entry.local))throw new Error('stale');
        if(usableLocalOriginal(source)&&source.bookId===bookId&&identity(source)===identity(entry.local)&&await hashBlob(source.blob)===source.sha256){
          const latest=await db.sources.get(entry.id);if(!latest||identity(latest)!==identity(source))throw new Error('stale');blob=source.blob;
        }
      }
      await guard();
      if(!blob){if(entry.cloud?.state!=='ready')throw new Error('unavailable');const downloaded=await downloadOriginal(bookId,entry.id);blob=downloaded.blob;name=downloaded.descriptor.name;}
      await guard();clearUrl();url.current=URL.createObjectURL(blob);
      const sourceEncoding = entry.local?.encoding ?? entry.cloud?.descriptor.encoding ?? 'utf-8';
      const downloadName = sanitizeSourceFilename(entry.local?.displayName || name, sourceEncoding);
      const anchor=document.createElement('a');anchor.href=url.current;anchor.download=downloadName;document.body.append(anchor);anchor.click();anchor.remove();timer.current=setTimeout(clearUrl,60000);
    }catch{if(current())setMessage('Không tải được file gốc. Hãy thử lại.');}
    finally{inFlight.current=false;if(alive.current)setBusy('');}
  }
  return <details className="panel" onToggle={toggle}>
    <summary>File gốc</summary>
    {open&&<div>
      {loading&&<p role="status">Đang tải danh sách…</p>}
      {!loading&&!entries.length&&!message&&<p>Chưa có file gốc.</p>}
      <ul style={{listStyle:'none',padding:0}}>{entries.map(entry=><li key={entry.id} style={{marginBlock:'0.5rem',overflowWrap:'anywhere'}}>
        <button style={{maxWidth:'100%',overflowWrap:'anywhere',textAlign:'left'}} disabled={loading||!!busy||(!usableLocalOriginal(entry.local)&&entry.cloud?.state!=='ready')} onClick={()=>void save(entry)}>{busy===entry.id?'Đang tải…':`Tải ${entry.local?.displayName||entry.name}`}</button> <small>{formatBytes(entry.bytes)}</small>
      </li>)}</ul>
      {message&&<p role="alert">{message}</p>}
    </div>}
  </details>;
}
