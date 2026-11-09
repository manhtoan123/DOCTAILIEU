import {PromptFields,promptDraftError} from './PromptFields';
import {automaticAiSettings,commonAiEditorDefaults,selectReaderPrompt} from '../types/ai-reader-settings';
import {currentPromptChoice} from '../prompt/prompt-list';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db } from '../../../core/db';
import type { ConvertName } from '../../names-convert/services/convert-names';
import { AiTranslateClientError } from '../services/ai-translate';
import { errorText } from '../../../shared/components/common';
import {AiJobStatus,type AiJobView} from './AiJobStatus';


import {aiResultModelLabel,aiModelLabel} from '../services/ai-hybrid-prompt';
import {useLiveQuery} from 'dexie-react-hooks';
import {getPromptStock,readStoredPromptStock,getBookPromptSelection} from '../prompt/prompt-stock';
import {AiReadingSession,aiBookSettingsKey,queueAiSettings,readReadingAiSettings,type ReadingAiSettings} from '../services/ai-reading';
import {promptGroups} from '../prompt/prompt-list';
import {addAiKeys,deleteAiKey,listAiKeys,type AiKeyList} from '../services/ai-key-admin';

const AI_SETTINGS_KEY = 'ai-translate-settings';
type AiSettings = ReadingAiSettings;
const DEFAULTS:AiSettings=commonAiEditorDefaults();
const TEST_FIXTURE = '林儿推开窗，看见张明站在院子里。他说：“等了十分钟，我们终于可以出发了。”';
const TEST_NAMES = { '林儿': 'Lâm Nhi', '张明': 'Trương Minh' };
interface AiPanelProps {
  chapterText: string; sourceIdentity: string; names: ConvertName[]; globalNames: ConvertName[];
  onClose: () => void; notify: (msg: string) => void;
  preload?:boolean;onPreloadChange?:(value:boolean)=>void;bookId?:string;onSettingsChange?:(settings:ReadingAiSettings,defer?:boolean)=>void;onTranslated?:(text:string,settings:ReadingAiSettings)=>void;
  hybridPromptPreview?:string;modelsSummary?:string;
  job?:AiJobView;onRetry?:()=>void;onStop?:()=>void;onPauseRetry?:()=>void;onContinue?:(settings:ReadingAiSettings)=>void;
}
const readSettings=readReadingAiSettings;
export function AiSettingsEditor({ chapterText, sourceIdentity, names, globalNames, onClose, notify,bookId,onSettingsChange,onTranslated,preload,onPreloadChange,hybridPromptPreview,modelsSummary,job,onRetry,onStop,onPauseRetry,onContinue }: AiPanelProps) {
  const dialogRef=useRef<HTMLElement>(null);
  useEffect(()=>{const opener=document.activeElement as HTMLElement|null;dialogRef.current?.querySelector<HTMLButtonElement>('header button')?.focus();return()=>{if(opener?.isConnected)opener.focus();else document.querySelector<HTMLButtonElement>('.ai-trigger')?.focus();};},[]);
  const [settings, setSettings] = useState<AiSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSignature,setSavedSignature]=useState(JSON.stringify(DEFAULTS));
  const [keysOpen,setKeysOpen]=useState(false);
  const [chosenProfileId,setChosenProfileId]=useState('');const chosenSnapshot=useRef<ReadingAiSettings|undefined>(undefined);
  const profileBook=useRef(bookId);profileBook.current=bookId;
  const profileOperation=useRef(0);const profileBusy=useRef(false);const draftVersion=useRef(0);
  useLayoutEffect(()=>{profileOperation.current++;profileBusy.current=false;return()=>{profileOperation.current++;};},[bookId]);
  const [stockReady,setStockReady]=useState(false),[stockInitError,setStockInitError]=useState('');
  useEffect(()=>{let active=true;void getPromptStock().then(()=>{if(active)setStockReady(true);}).catch(e=>{if(active)setStockInitError(errorText(e));});return()=>{active=false;};},[]);
  const stockState=useLiveQuery(async()=>{if(!stockReady)return undefined;try{return {stock:await readStoredPromptStock(),error:''};}catch(e){return {stock:undefined,error:errorText(e)};}},[stockReady]);
  const eligibleGroups=promptGroups(stockState?.stock).filter(group=>!group.profiles[0].bookId||group.profiles[0].bookId===bookId),eligibleProfiles=eligibleGroups.map(group=>group.profiles[0]);
  const [keyList,setKeyList]=useState<AiKeyList|undefined>();
  const [keyDraft,setKeyDraft]=useState('');
  const [keyBusy,setKeyBusy]=useState(false);
  const [keyError,setKeyError]=useState('');
  useEffect(()=>{if(!keysOpen)return;const ctrl=new AbortController();let pending=false;const refresh=()=>{if(pending||document.hidden)return;pending=true;void listAiKeys(ctrl.signal).then(value=>{if(!ctrl.signal.aborted)setKeyList(value);}).catch(e=>{if(!ctrl.signal.aborted)setKeyError(errorText(e));}).finally(()=>{pending=false;});};refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},5000);return()=>{ctrl.abort();clearInterval(timer);};},[keysOpen]);
  async function addKeys(){if(keyBusy||!keyDraft.trim())return;setKeyBusy(true);setKeyError('');try{const next=await addAiKeys(keyDraft);setKeyList(next);setKeyDraft('');notify(`Đã thêm ${next.added??0} key${next.rejected?` (bỏ qua ${next.rejected})`:''}.`);}catch(e){setKeyError(errorText(e));}finally{setKeyBusy(false);}}
  async function removeKey(id:string,label:string){if(keyBusy)return;setKeyBusy(true);setKeyError('');try{setKeyList(await deleteAiKey(id));notify(`Đã xoá ${label}.`);}catch(e){setKeyError(errorText(e));}finally{setKeyBusy(false);}}
  const [jobState, setJobState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');
  const [meta, setMeta] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isTest, setIsTest] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const alive = useRef(false);
  const identity = JSON.stringify([sourceIdentity, chapterText, names.map(n => [n.key,n.value]), globalNames.map(n => [n.key,n.value]), settings]);
  // Layout cleanup invalidates promises before a changed source can paint.
  useLayoutEffect(() => {
    alive.current = true;
    generation.current++;
    controller.current?.abort(); controller.current = null;
    setJobState('idle'); setResult(''); setMeta(''); setErrorMsg('');
    return () => { alive.current = false; generation.current++; controller.current?.abort(); controller.current = null; };
  }, [identity]);
  useEffect(() => {
    let active = true;const hydrationDraft=draftVersion.current;
    void queueAiSettings(bookId?aiBookSettingsKey(bookId):AI_SETTINGS_KEY,()=>bookId?db.settings.get(aiBookSettingsKey(bookId)).then(async row=>row??await db.settings.get(AI_SETTINGS_KEY)):db.settings.get(AI_SETTINGS_KEY)).then(row => {
      if (!active) return;
      const restored=automaticAiSettings(row?.value),next={...restored,hybrid:restored.hybrid};setSettings(next);setSavedSignature(JSON.stringify(next));setChosenProfileId((row?.value as {chosenProfileId?:string}|undefined)?.chosenProfileId??'');chosenSnapshot.current=(row?.value as {chosenProfileSettings?:ReadingAiSettings}|undefined)?.chosenProfileSettings; setLoaded(true);
      if(bookId)void getBookPromptSelection(bookId).then(id=>{if(active&&draftVersion.current===hydrationDraft)setChosenProfileId(id??'');}).catch(()=>{if(active)setChosenProfileId('');});
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [bookId]);
  function updateSettings(patch: Partial<AiSettings>) {draftVersion.current++;if(patch.systemPrompt!==undefined||patch.userPromptTemplate!==undefined)setChosenProfileId('');setSettings(prev => ({ ...prev, ...patch })); }
  async function saveSettings(continueJob=false) {
    if (!loaded || saving) return;
    setSaving(true);const ownerGeneration=generation.current;
    try { await queueAiSettings(bookId?aiBookSettingsKey(bookId):AI_SETTINGS_KEY,async()=>{await db.settings.put({ key: bookId?aiBookSettingsKey(bookId):AI_SETTINGS_KEY, value: { ...settings,...(chosenProfileId&&chosenSnapshot.current&&chosenSnapshot.current.systemPrompt===settings.systemPrompt&&chosenSnapshot.current.userPromptTemplate===settings.userPromptTemplate?{chosenProfileId,chosenProfileSettings:{...chosenSnapshot.current}}:{}) } });if(alive.current&&generation.current===ownerGeneration){if(continueJob&&onContinue)onContinue(settings);else onSettingsChange?.(settings,true);}});if (alive.current&&generation.current===ownerGeneration){setSavedSignature(JSON.stringify(settings));notify(continueJob?'Đã lưu. Đang tiếp tục phần còn thiếu.':'Đã lưu prompt. Áp dụng từ lượt dịch tiếp theo.');} }
    catch { if (alive.current) notify('Không lưu được prompt; bản nháp vẫn còn.'); }
    finally { if (alive.current){setSaving(false);if(continueJob)requestAnimationFrame(()=>{if(alive.current&&generation.current===ownerGeneration&&document.activeElement===document.body)dialogRef.current?.querySelector<HTMLButtonElement>('header button')?.focus();});} }
  }
  async function chooseProfile(id:string){
    if(!id||profileBusy.current||saving||!loaded)return;profileBusy.current=true;draftVersion.current++;setSaving(true);
    const owner=bookId,operation=++profileOperation.current;
    const current=()=>profileOperation.current===operation&&profileBook.current===owner;
    try{const next=await selectReaderPrompt(id,owner);const stored=await db.settings.get(owner?aiBookSettingsKey(owner):AI_SETTINGS_KEY);if(!current())return;const selection=stored?.value as {chosenProfileId?:string;chosenProfileSettings?:ReadingAiSettings}|undefined;chosenSnapshot.current=selection?.chosenProfileId===id?selection.chosenProfileSettings:undefined;onSettingsChange?.(next);if(alive.current){const restored={...next,hybrid:next.hybrid};setSettings(restored);setSavedSignature(JSON.stringify(restored));setChosenProfileId(id);}}
    catch(e){if(current()&&alive.current)notify(errorText(e));}
    finally{if(current()){profileBusy.current=false;if(alive.current)setSaving(false);}}
  }
  function cancel() {
    generation.current++; controller.current?.abort(); controller.current = null;
    setJobState('idle'); setResult(''); setMeta(''); setErrorMsg('');
  }
  async function runTranslate(test: boolean) {
    const text = test ? TEST_FIXTURE : chapterText;
    if (controller.current || !loaded || !settings.userPromptTemplate.includes('{{text}}') || !text.trim() || text.length > 128000) return;
    const ctrl = new AbortController(); const job = ++generation.current; controller.current = ctrl;
    const session=new AiReadingSession(undefined,undefined,undefined,false);ctrl.signal.addEventListener('abort',()=>session.clear(),{once:true});
    const current = () => alive.current && generation.current === job && controller.current === ctrl && !ctrl.signal.aborted;
    setJobState('running'); setResult(''); setMeta(''); setErrorMsg(''); setIsTest(test);
    try {
      const response = await session.request({bookId:bookId??'prompt-trial',id:sourceIdentity,revision:0,text},automaticAiSettings(settings),test?Object.entries(TEST_NAMES).map(([key,value])=>({key,value})):names,undefined,undefined,undefined,{immediate:true});
      if (!current()) return;
      setResult(response.result); setMeta(`${aiResultModelLabel(response)} · ${response.inputTokens}→${response.outputTokens} tokens · ${response.finishReason}`); setJobState('done');
      if(!test)onTranslated?.(response.result,settings);
    } catch (error) {
      if (!current()) return;
      const message = error instanceof AiTranslateClientError ? error.message : errorText(error);
      setErrorMsg(message); setJobState('error'); notify(`Dịch AI thất bại: ${message}`);
    } finally { session.clear();if (controller.current === ctrl) controller.current = null; }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([result], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = isTest ? 'ai-thu.txt' : 'ai-chuong.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const running = jobState === 'running';
  const invalidPrompt=!!promptDraftError(settings);
  const blocked = running || !loaded || invalidPrompt;
  return <section ref={dialogRef} className="ai-settings-editor" role="region" aria-label="Cấu hình dịch AI" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();onClose();}}}>
    <header><strong>Prompt chung</strong><button onClick={() => { cancel(); onClose(); }} aria-label="Đóng cấu hình AI">Đóng</button></header>
    <div className="reader-panel-body">
      <label>Prompt<select aria-label="Chọn prompt" value={currentPromptChoice(stockState?.stock,bookId,settings,chosenProfileId).value} disabled={!loaded||saving||!stockState?.stock} onChange={e=>void chooseProfile(e.target.value)}><option value="">{currentPromptChoice(stockState?.stock,bookId,settings,chosenProfileId).label}</option>{eligibleProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.title}</option>)}</select></label>
      
      {(stockInitError||stockState?.error)&&<p role="alert">Không mở được kho prompt: {stockInitError||stockState?.error}</p>}
      {loadError && <p role="alert">Không đọc được prompt đã lưu. Đóng và mở lại bảng để thử lại; chưa thể dịch hoặc ghi đè cài đặt.</p>}
      <details><summary>Thử prompt</summary><div className="ai-actions">
        <button disabled={blocked} onClick={() => void runTranslate(true)}>{running && isTest ? '⏳ Chạy thử…' : '▷ Chạy thử'}</button>
        {running && <button onClick={cancel} aria-label="Hủy dịch">✕ Hủy</button>}
      </div>
      </details>
      {chapterText.length > 128000 && <p className="ai-warning" role="alert">Chương vượt giới hạn 128.000 ký tự. Bạn vẫn có thể chạy thử mẫu ngắn.</p>}
      <div className="ai-prompt-details"><fieldset disabled={!loaded || saving} className="ai-prompt-body">
        <PromptFields settings={settings} onChange={updateSettings}/>{invalidPrompt&&<p role="alert">{promptDraftError(settings)}</p>}
        <button type="button" onClick={() => updateSettings(DEFAULTS)}>Khôi phục mặc định</button>
      </fieldset></div>
      <details className="ai-keys-details" onToggle={e=>setKeysOpen(e.currentTarget.open)}><summary>🔑 API keys ({keyList ? `${keyList.active} đang dùng` : '…'})</summary>
        <p className="ai-warning" role="note">Trang này đang công khai: ai có URL cũng thêm/xoá được key. Key chỉ hiện dạng che; máy chủ không bao giờ trả lại key. Thêm key Gemini (bắt đầu bằng <code>AIza</code>), mỗi dòng một key.</p>
        {keyError && <p role="alert">{keyError}</p>}
        {keyList && keyList.keys.length > 0 && <div className="ai-key-list" aria-label="Danh sách key đã lưu">
          {keyList.keys.map(row => <div className="ai-key-row" key={row.id}>
            <span className="ai-key-label">{row.label || 'key'}</span><span className="ai-key-mask">{row.masked}</span><small>{row.selected===false?'Dự phòng':row.status==='working'?'Đang dịch':row.status==='cooling'?'Đang chờ':'Sẵn sàng'}{row.blockedModels?.length?` · Đã loại khỏi: ${row.blockedModels.map(aiModelLabel).join(', ')}`:''}{row.httpStatus?` · HTTP ${row.httpStatus}`:''}{row.lastUsedAt?` · dùng ${new Date(row.lastUsedAt).toLocaleTimeString('vi')}`:''}</small>
            <button disabled={keyBusy} aria-label={`Xoá key ${row.label || row.masked}`} onClick={() => void removeKey(row.id, row.label || row.masked)}>×</button>
          </div>)}
        </div>}
        {keyList && keyList.keys.length === 0 && <p className="ai-hint">Chưa có key nào lưu trong app{keyList.secretPool ? `; đang dùng ${keyList.secretPool} key cấu hình sẵn trên máy chủ.` : '.'}</p>}
        {!!keyList?.excluded&&<p>{keyList.excluded} key hỏng đã được loại khỏi pool.</p>}
        <label className="ai-label">Dán key Gemini<textarea aria-label="Dán key Gemini" rows={3} maxLength={16000} value={keyDraft} onChange={e => setKeyDraft(e.target.value)} /></label>
        <div className="ai-prompt-footer"><button disabled={keyBusy || !keyDraft.trim()} onClick={() => void addKeys()}>{keyBusy ? 'Đang lưu…' : 'Thêm key'}</button><button disabled={keyBusy} onClick={() => { setKeyDraft(''); setKeyError(''); }}>Xoá ô nhập</button></div>
      </details>
      {jobState === 'error' && <p className="ai-error" role="alert">{errorMsg}</p>}
      {jobState === 'done' && <div className="ai-result">
        {isTest && <p className="ai-test-label">Kết quả fixture tổng hợp — không lưu</p>}
        <div className="ai-result-text">{result}</div><small className="ai-meta">{meta}</small>
        <div className="ai-result-actions"><button onClick={() => void navigator.clipboard.writeText(result).then(() => notify('Đã sao chép bản dịch.')).catch(() => notify('Không sao chép được.'))}>Sao chép</button><button onClick={download}>Tải TXT</button><button onClick={cancel}>Xóa kết quả</button></div>
      </div>}
    </div>
    <footer className="ai-save-bar"><small role="status">{JSON.stringify(settings)!==savedSignature?'Có thay đổi chưa lưu':'Đã lưu cài đặt'}</small><div><button disabled={!loaded||saving||invalidPrompt} onClick={()=>void saveSettings()}>{saving?'Đang lưu…':'Lưu prompt'}</button></div></footer>
  </section>;
}
