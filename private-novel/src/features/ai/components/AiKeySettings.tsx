import {useEffect,useRef,useState} from 'react';
import {addAiKeys,deleteAiKey,listAiKeys,type AiKeyList} from '../services/ai-key-admin';
import {errorText} from '../../../shared/components/common';

/** Secrets only exist in the transient input and are cleared after submitting. */
export function AiKeySettings(){
 const [open,setOpen]=useState(false),[keys,setKeys]=useState<AiKeyList>(),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(false),running=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!open)return;const abort=new AbortController();void listAiKeys(abort.signal).then(value=>{if(!abort.signal.aborted)setKeys(value);}).catch(e=>{if(!abort.signal.aborted)setError(errorText(e));});return()=>abort.abort();},[open]);
 async function mutate(operation:()=>Promise<AiKeyList>){if(running.current)return;running.current=true;setBusy(true);setError('');try{const value=await operation();if(alive.current){setKeys(value);setDraft('');}}catch(e){if(alive.current)setError(errorText(e));}finally{running.current=false;if(alive.current)setBusy(false);}}
 return <details className="ai-keys-details" onToggle={e=>{setOpen(e.currentTarget.open);if(!e.currentTarget.open)setDraft('');}}><summary>API keys</summary>{open&&<div>{error&&<p role="alert">{error}</p>}{keys?.keys.map(row=><div className="ai-key-row" key={row.id}><span>{row.label||'Key'} · {row.masked}</span><button aria-label={`Xóa key ${row.label||row.masked}`} disabled={busy} onClick={()=>void mutate(()=>deleteAiKey(row.id))}>Xóa</button></div>)}<label>Dán key Gemini<textarea aria-label="Dán key Gemini" autoComplete="off" rows={3} maxLength={16000} value={draft} onChange={e=>setDraft(e.target.value)}/></label><button disabled={busy||!draft.trim()} onClick={()=>{const input=draft;setDraft('');void mutate(()=>addAiKeys(input));}}>Thêm key</button></div>}</details>;
}
