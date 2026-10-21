import {useEffect,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../../../core/db';
import {aiBookSettingsKey,queueAiSettings,type ReadingAiSettings} from '../services/ai-reading';
import {readReaderAiPreferences,selectReaderPrompt,setReaderSplitParts} from '../types/ai-reader-settings';
import {getPromptStock,readStoredPromptStock} from '../prompt/prompt-stock';
import {currentPromptChoice} from '../prompt/prompt-list';
import type {AiJobView} from './AiJobStatus';
import {errorText} from '../../../shared/components/common';
export interface ChapterModelView {model?:string;status:'idle'|'loading'|'ready'|'error'|'off'|'unavailable'}
interface Props {
 bookId:string;current:ChapterModelView;next:ChapterModelView;job:AiJobView;
 preload:boolean;onPreloadChange:(value:boolean)=>void;onClose:()=>void;onOpenSettings:()=>void;
 onSettingsChange:(settings:ReadingAiSettings,defer?:boolean)=>void;notify:(message:string)=>void;
 onRetry?:()=>void;onPauseRetry?:()=>void;
}
function ModelRow({label,view}:{label:string;view:ChapterModelView}){
 const empty=view.status==='unavailable'?'Hết truyện':view.status==='off'?'Đã tắt dịch sẵn':'Chưa dịch';
 return <div className="ai-model-row" aria-label={label}><span>{label}</span><div><strong>{view.model||empty}</strong>{(view.status==='loading'||view.status==='error')&&<small><i className={'ai-state-dot '+view.status}/>{view.status==='loading'?'Đang dịch':'Đã tạm dừng'}</small>}</div></div>;
}
export function AiPanel({bookId,current,next,job,preload,onPreloadChange,onClose,onOpenSettings,onSettingsChange,notify,onRetry,onPauseRetry}:Props){
 const panel=useRef<HTMLElement>(null),alive=useRef(false),operation=useRef(0),busyRef=useRef(false),[splitOverride,setSplitOverride]=useState<boolean|undefined>(undefined),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{alive.current=true;const opener=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLButtonElement>('header button')?.focus();void getPromptStock().then(()=>{if(alive.current)setReady(true);}).catch(e=>{if(alive.current)setError(errorText(e));});return()=>{alive.current=false;operation.current++;if(opener?.isConnected)opener.focus();};},[bookId]);
 const state=useLiveQuery(async()=>{if(!ready)return;try{const [stock,preferences]=await Promise.all([readStoredPromptStock(),queueAiSettings(aiBookSettingsKey(bookId),()=>readReaderAiPreferences(bookId))]);return {stock,settings:preferences.settings,chosenId:preferences.chosenId,error:''};}catch(e){return {error:errorText(e)};}},[ready,bookId]);
 useEffect(()=>{if(!busy&&splitOverride!==undefined&&!!state?.settings?.splitParts===splitOverride)setSplitOverride(undefined);},[state,busy,splitOverride]);
 const choice=state?.settings?currentPromptChoice(state.stock,bookId,state.settings,state.chosenId):{profiles:[],value:'',label:'Đang tải prompt…',savedVersion:false};
 async function choose(id:string){if(!id||busyRef.current||!state?.settings)return;const ticket=++operation.current;busyRef.current=true;setBusy(true);try{const settings=await selectReaderPrompt(id,bookId);if(alive.current&&operation.current===ticket)onSettingsChange(settings);}catch(e){if(alive.current)notify(errorText(e));}finally{if(alive.current&&operation.current===ticket){busyRef.current=false;setBusy(false);}}}
 async function toggleSplit(enabled:boolean){if(busyRef.current||!state?.settings)return;const ticket=++operation.current;busyRef.current=true;setSplitOverride(enabled);setBusy(true);try{const settings=await setReaderSplitParts(bookId,enabled);if(alive.current&&operation.current===ticket)onSettingsChange(settings,true);}catch(e){if(alive.current){setSplitOverride(undefined);notify(errorText(e));}}finally{if(alive.current&&operation.current===ticket){busyRef.current=false;setBusy(false);}}}
 return <section ref={panel} className="reader-panel reader-panel-ai ai-compact" role="dialog" aria-label="Dịch AI" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}}}>
  <header><strong>Dịch AI</strong><button aria-label="Ẩn Dịch AI" onClick={onClose}>×</button></header>
  <div className="reader-panel-body">
   <section className="ai-model-summary" aria-label="Model dịch chương"><ModelRow label="Chương này" view={current}/><ModelRow label="Chương sau" view={next}/></section>
   <label className="ai-current-prompt">Prompt đang dùng<select aria-label="Chọn prompt" value={choice.value} disabled={busy||!state?.settings} onChange={e=>void choose(e.target.value)}><option value="">{choice.value?'Tùy chỉnh của truyện':choice.label}{choice.savedVersion?' · đang dùng':''}</option>{choice.profiles.map(p=><option key={p.id} value={p.id}>{p.title}{p.bookId?' · riêng':''}</option>)}</select></label>
   {(error||state?.error)&&<p role="alert" className="ai-compact-error">{error||state?.error}</p>}
   <label className="ai-preload-toggle"><span>Dịch sẵn chương sau</span><input type="checkbox" role="switch" aria-label="Dịch sẵn chương kế tiếp" checked={preload} onChange={e=>onPreloadChange(e.target.checked)}/></label>
   <label className="ai-preload-toggle"><span>Dịch chia phần song song</span><input type="checkbox" role="switch" aria-label="Dịch chia phần song song" checked={splitOverride??!!state?.settings?.splitParts} disabled={busy||!state?.settings} onChange={e=>void toggleSplit(e.target.checked)}/></label>
   {(job.error||onPauseRetry)&&<section className="ai-compact-job" aria-label="Điều khiển lượt dịch">
    {job.error&&<p role="alert">{job.error}</p>}{job.retryIn!==undefined&&<small>Tự thử lại sau {job.retryIn} giây</small>}
    <div className="ai-actions">{onRetry&&<button onClick={onRetry}>{job.progress?.done||job.progress?.half===2?'Tiếp tục phần còn thiếu':'Thử lại AI'}</button>}{job.configuration&&job.error&&<button onClick={onOpenSettings}>{job.configuration==='keys'?'Kiểm tra API keys':'Sửa cấu hình AI'}</button>}{onPauseRetry&&<button onClick={onPauseRetry}>Dừng tự thử lại</button>}</div>
    {job.error&&!!(job.errorCode||job.history?.length)&&<details className="ai-job-details"><summary>Chi tiết lỗi</summary>{!!job.history?.length&&<p>{job.history.join(' → ')}</p>}{job.errorCode&&<code>{job.errorCode}</code>}{job.requestId&&<small>{job.requestId}</small>}</details>}
   </section>}
  </div>
  <footer className="ai-compact-footer"><button onClick={onOpenSettings}>Cài đặt dịch AI <span aria-hidden="true">↗</span></button></footer>
 </section>;
}
