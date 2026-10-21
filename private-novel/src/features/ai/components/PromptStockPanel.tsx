import {useEffect,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../../../core/db';
import {AI_DEFAULTS,readReadingAiSettings,type ReadingAiSettings} from '../services/ai-reading';
import {getPromptStock,readStoredPromptStock,savePromptProfile,copyPromptProfile,deletePromptProfile,type PromptProfile} from '../prompt/prompt-stock';
import {getPromptSyncStatus,syncPromptStock,getPromptConflicts,resolvePromptConflict} from '../prompt/prompt-sync';
import {AI_COMMON_SETTINGS_KEY,commonAiEditorDefaults,customAiDisplaySettings,readReaderAiPreferences,saveCustomAiDraft,selectReaderPrompt} from '../types/ai-reader-settings';
import {errorText,Modal} from '../../../shared/components/common';
import {promptGroups} from '../prompt/prompt-list';
import {PromptFields,promptDraftError} from './PromptFields';
import {AiKeySettings} from './AiKeySettings';
interface Props {books:{id:string;title:string}[];notify?:(message:string)=>void;onChange?:()=>void;initialBookId?:string}
const DRAFT_KEY='settings-prompt-draft-v1';
interface Draft {owner:string;id:string;title:string;scope:string;settings:ReadingAiSettings;source?:PromptProfile;customSource?:unknown}
export function PromptStockPanel({books,notify,onChange,initialBookId}:Props){
 const owner=initialBookId||'global',draftKey=DRAFT_KEY+':'+owner;
 const [initialized,setInitialized]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const [id,setId]=useState(''),[scope,setScope]=useState(''),[title,setTitle]=useState(''),[settings,setSettings]=useState<ReadingAiSettings>({...AI_DEFAULTS});
 const [sync,setSync]=useState(getPromptSyncStatus),[draftSource,setDraftSource]=useState<PromptProfile>(),[customSource,setCustomSource]=useState<unknown>(),[dirty,setDirty]=useState(false),[pending,setPending]=useState<{profile?:PromptProfile;custom?:boolean}>();
 const alive=useRef(false),running=useRef(false),opened=useRef(false),draft=useRef<Draft|undefined>(undefined);
 const custom=id==='$custom',label=(bookId?:string)=>bookId?books.find(b=>b.id===bookId)?.title||'Truyện trên thiết bị khác':'Chung';
 useEffect(()=>{alive.current=true;void getPromptStock().then(()=>{if(alive.current)setInitialized(true);}).catch(e=>{if(alive.current)setError(errorText(e));});const update=()=>setSync(getPromptSyncStatus());window.addEventListener('prompt-sync-status',update);return()=>{alive.current=false;window.removeEventListener('prompt-sync-status',update);};},[]);
 const state=useLiveQuery(async()=>{if(!initialized)return undefined;try{return {stock:await readStoredPromptStock(),conflicts:await getPromptConflicts(),common:await db.settings.get(AI_COMMON_SETTINGS_KEY),error:''};}catch(e){return {stock:undefined,conflicts:[],common:undefined,error:errorText(e)};}},[initialized]);
 const stock=state?.stock,selected=stock?.profiles.find(p=>p.id===id),readonly=!custom&&id===stock?.defaultProfileId,groups=promptGroups(stock);
 function clearDraft(){try{sessionStorage.removeItem(draftKey);}catch{}draft.current=undefined;}
 function choose(next?:PromptProfile){clearDraft();setId(next?.id||'');setScope(next?.bookId||'');setTitle(next?.title||'');setSettings({...next?.settings??AI_DEFAULTS});setDraftSource(next);setCustomSource(undefined);setDirty(false);setError('');setPending(undefined);}
 function requestChoose(next?:PromptProfile){if(dirty){setPending({profile:next});return;}choose(next);}
 async function chooseCustom(){
  const preferences=initialBookId?await readReaderAiPreferences(initialBookId):undefined;
  const bookValue=initialBookId?preferences?.book:undefined,commonValue=initialBookId?preferences?.common:(await db.settings.get(AI_COMMON_SETTINGS_KEY))?.value;
  if(!alive.current)return;clearDraft();setId('$custom');setTitle(initialBookId?'Tùy chỉnh của truyện':'Cài đặt chung');setScope(initialBookId||'');setSettings(customAiDisplaySettings(bookValue,commonValue));setCustomSource(initialBookId?bookValue:commonValue);setDraftSource(undefined);setDirty(false);setPending(undefined);setError('');
 }
 function requestCustom(){if(dirty)setPending({custom:true});else void chooseCustom().catch(e=>setError(errorText(e)));}
 function openPending(next:{profile?:PromptProfile;custom?:boolean}){if(next.custom)void chooseCustom().catch(e=>setError(errorText(e)));else choose(next.profile);}
 useEffect(()=>{if(!stock||opened.current)return;opened.current=true;void (async()=>{
  const preferences=initialBookId?await readReaderAiPreferences(initialBookId):undefined;
  if(!alive.current)return;
  try{const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null') as Draft|null;if(saved?.owner===owner&&typeof saved.id==='string'&&typeof saved.title==='string'&&typeof saved.scope==='string'&&saved.settings){setId(saved.id);setTitle(saved.title);setScope(saved.scope);setSettings({...readReadingAiSettings(saved.settings),userPromptTemplate:typeof saved.settings.userPromptTemplate==='string'&&saved.settings.userPromptTemplate.length<=8000?saved.settings.userPromptTemplate:AI_DEFAULTS.userPromptTemplate});setDraftSource(saved.source);setCustomSource(saved.customSource);setDirty(true);draft.current=saved;return;}}catch{}
  const row=preferences?.book??preferences?.common??state?.common?.value;
  const chosen=(row as {chosenProfileId?:string}|undefined)?.chosenProfileId;
  const profile=stock.profiles.find(p=>p.id===chosen);
  if(profile){choose(profile);return;}
  setId('$custom');setTitle(initialBookId?'Tùy chỉnh của truyện':'Cài đặt chung');setScope(initialBookId||'');setSettings(customAiDisplaySettings(preferences?.book,preferences?.common??state?.common?.value));setCustomSource(initialBookId?preferences?.book:state?.common?.value);setDirty(false);
 })().catch(e=>{if(alive.current)setError(errorText(e));});},[stock]);
 useEffect(()=>{if(!dirty&&selected){setTitle(selected.title);setScope(selected.bookId||'');setSettings({...selected.settings});setDraftSource(selected);}},[selected,dirty]);
 function change(value:Partial<Draft>){const next:Draft={owner,id,title,scope,settings,source:draftSource,customSource,...value};draft.current=next;try{sessionStorage.setItem(draftKey,JSON.stringify(next));}catch{}setDirty(true);if(value.settings)setSettings(value.settings);if(value.title!==undefined)setTitle(value.title);if(value.scope!==undefined)setScope(value.scope);}
 const patch=(value:Partial<ReadingAiSettings>)=>change({settings:{...settings,...value}});
 async function act(operation:()=>Promise<unknown>,message:string,preserveDraft=false){
  if(running.current||!stock)return false;running.current=true;setBusy(true);setError('');
  try{const result=await operation();const updated=await getPromptStock();if(!alive.current)return false;const saved=result&&typeof result==='object'&&'id'in result?updated.profiles.find(p=>p.id===result.id):undefined;if(!preserveDraft)choose(saved??updated.profiles.find(p=>p.id===id));notify?.(message);onChange?.();void syncPromptStock();return true;}
  catch(e){if(alive.current)setError(errorText(e));return false;}finally{running.current=false;if(alive.current)setBusy(false);}
 }
 const validation=promptDraftError(settings);
 async function saveDraft(){
  if(validation||readonly||!title.trim())return false;
  if(custom)return act(async()=>{const saved=await saveCustomAiDraft(initialBookId,settings,customSource);if(alive.current){setCustomSource(saved);setDirty(false);clearDraft();}return undefined;},'Đã lưu cài đặt.',true);
  return act(()=>savePromptProfile({id:id||undefined,title,bookId:scope||undefined,settings},draftSource),'Đã lưu prompt.');
 }
 const profiles=groups.filter(group=>{const p=group.profiles[0];return (filter==='all'||filter==='common'&&!p.bookId||filter==='books'&&!!p.bookId)&&`${p.title} ${label(p.bookId)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());});
 return <section className="prompt-workbench" aria-label="Dịch AI & Prompt">
  <header className="prompt-header"><div><h2>Dịch AI & Prompt</h2><p>Soạn mẫu tại đây. Mỗi truyện ghi nhớ prompt bạn chọn trong trang đọc.</p></div><button className="primary" disabled={busy||!stock} onClick={()=>requestChoose()}>Thêm prompt</button></header>
  <div className="prompt-sync-bar"><span role="status" data-sync-state={sync.state}>{sync.message}</span><button disabled={sync.state==='syncing'} onClick={()=>void syncPromptStock()}>Đồng bộ</button></div>
  {(error||state?.error)&&<p role="alert">{error||state?.error}</p>}
  {!!state?.conflicts.length&&<section className="prompt-conflicts" aria-label="Prompt có xung đột"><p>Hai thiết bị đã sửa cùng prompt. Bản đang soạn vẫn được giữ.</p>{state.conflicts.map(conflict=><div key={conflict.id}><strong>{stock?.profiles.find(p=>p.id===conflict.id)?.title||conflict.profile?.title||'Prompt đã xóa'}</strong><details><summary>So sánh hai bản</summary><PromptVersion heading="Bản trên máy" profile={stock?.profiles.find(p=>p.id===conflict.id)??null}/><PromptVersion heading="Bản đồng bộ" profile={conflict.profile}/></details><button disabled={busy} onClick={()=>void act(()=>resolvePromptConflict(conflict.id,'local'),'Đã giữ bản trên máy.',dirty)}>Giữ bản trên máy</button><button disabled={busy} onClick={()=>void act(()=>resolvePromptConflict(conflict.id,'shared'),'Đã dùng bản đồng bộ.',dirty)}>Dùng bản đồng bộ</button></div>)}</section>}
  <div className="prompt-layout"><aside className="prompt-library" aria-label="Danh sách prompt"><label>Tìm prompt<input type="search" aria-label="Tìm prompt" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên prompt hoặc tên truyện…"/></label><div className="prompt-filters" role="group" aria-label="Lọc prompt">{[['all','Tất cả'],['common','Chung'],['books','Theo truyện']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><div className="prompt-cards"><button className="prompt-card" aria-pressed={custom} disabled={busy} onClick={requestCustom}><strong>{initialBookId?'Tùy chỉnh của truyện':'Cài đặt chung'}</strong><span>{label(initialBookId)}</span></button>{profiles.map(group=>{const p=group.profiles[0];return <button className="prompt-card" key={group.key} aria-label={`Chọn prompt ${p.title}`} aria-pressed={group.profiles.some(p=>p.id===id)} disabled={busy} onClick={()=>requestChoose(p)}><strong>{p.title}</strong><span>{label(p.bookId)}{(state?.common?.value as {chosenProfileId?:string}|undefined)?.chosenProfileId===p.id?' · mặc định':''}</span></button>;})}{stock&&!profiles.length&&<p>Không có prompt phù hợp.</p>}</div></aside>
   <div className="prompt-editor" aria-label="Chỉnh prompt"><header><h3>{id?title||'Chỉnh prompt':'Prompt mới'}</h3><small role="status">{dirty?'Chưa lưu':'Đã lưu cài đặt'}</small></header>{readonly&&<p className="notice">Mẫu mặc định. Nhân bản để chỉnh sửa.</p>}{dirty&&selected&&JSON.stringify(selected)!==JSON.stringify(draftSource)&&<p role="alert">Prompt đã đổi trên thiết bị khác. Bản đang soạn vẫn được giữ.</p>}
    <fieldset disabled={busy||!stock||readonly}><label>Tên prompt<input aria-label="Tên prompt" maxLength={120} disabled={custom} value={title} onChange={e=>change({title:e.target.value})} placeholder="Ví dụ: Dịch truyện Naruto"/></label>{!custom&&<label>Phạm vi mẫu<select aria-label="Phạm vi prompt" value={scope} disabled={!!id} onChange={e=>change({scope:e.target.value})}><option value="">Chung — mọi truyện</option>{scope&&!books.some(b=>b.id===scope)&&<option value={scope}>Truyện trên thiết bị khác</option>}{books.map(book=><option key={book.id} value={book.id}>{book.title}</option>)}</select></label>}<PromptFields settings={settings} onChange={patch}/>{validation&&<p role="alert">{validation}</p>}</fieldset>
    <footer className="prompt-editor-actions"><button className="primary" disabled={busy||!stock||readonly||!title.trim()||!!validation||!!id&&!custom&&!selected} onClick={()=>void saveDraft()}>{busy?'Đang lưu…':'Lưu prompt'}</button><button disabled={busy||(!selected&&!custom)||dirty} onClick={()=>void act(()=>custom?savePromptProfile({title:`${title.slice(0,105)} (bản sao)`,bookId:scope||undefined,settings}):copyPromptProfile(id,`${selected!.title.slice(0,105)} (bản sao)`,scope||undefined),'Đã nhân bản prompt.')}>Nhân bản</button>{selected&&!readonly&&<button className="btn-danger" disabled={busy||dirty} onClick={()=>void act(()=>deletePromptProfile(id),'Đã xóa prompt.')}>Xóa prompt</button>}{selected&&!readonly&&!scope&&<button disabled={busy||dirty} onClick={()=>void act(()=>selectReaderPrompt(id),'Đã dùng prompt mặc định.',true)}>Dùng mặc định</button>}</footer>
    {id&&!custom&&!selected&&stock&&<button disabled={busy||!!validation||!title.trim()} onClick={()=>void act(()=>savePromptProfile({title,bookId:scope||undefined,settings}),'Đã lưu bản nháp thành prompt mới.')}>Lưu thành prompt mới</button>}<AiKeySettings/>
   </div></div>
   {pending&&<Modal title="Thay đổi chưa lưu" onClose={()=>setPending(undefined)}><p>Lưu bản đang soạn trước khi mở mẫu khác.</p><div className="actions"><button disabled={busy||!!validation} onClick={async()=>{const next=pending;if(await saveDraft())openPending(next);}}>Lưu và mở</button><button disabled={busy} onClick={()=>openPending(pending)}>Bỏ thay đổi</button><button onClick={()=>setPending(undefined)}>Tiếp tục sửa</button></div></Modal>}
 </section>;
}
function PromptVersion({heading,profile}:{heading:string;profile:PromptProfile|null}){return <article><h4>{heading}</h4>{profile?<><strong>{profile.title}</strong><p>System Prompt</p><pre>{profile.settings.systemPrompt}</pre><p>User Prompt</p><pre>{profile.settings.userPromptTemplate}</pre><p>Dịch chia phần song song: {(profile.settings.splitParts??true)?'Bật':'Tắt'}</p><p>Quy tắc xưng hô</p><pre>{profile.settings.addressingRules??profile.settings.hybrid?.rules??'(Không có)'}</pre>{profile.settings.hybrid?.secondHalfPrompt&&<><p>Prompt nửa sau cũ (chỉ lưu tương thích)</p><pre>{profile.settings.hybrid.secondHalfPrompt}</pre></>}<p>Nhiệt độ: {profile.settings.temperature}</p></>:<p>Prompt đã xóa</p>}</article>;}
