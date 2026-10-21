
import {readReaderAiPreferences} from '../../ai/types/ai-reader-settings';
import {aiFailureAction} from '../../ai/services/ai-translate';
import {aiAutoResumeDelay} from '../../ai/services/ai-auto-resume';
import {googleMeaningUrl,googleTranslationUrl} from '../services/word-tools';
import NameEditDialog from '../../names-convert/components/NameEditDialog';
import EpubFrame from './EpubFrame';
import NameImageText from '../../names-convert/components/NameImageText';
import {findNameImages,nameImagesForSource} from '../../names-convert/services/name-images';
import {convertedEpubNodes,convertedEpubWords} from '../../import-export/services/epub-render';
import {recommendedFallbackModels} from '../../ai/services/ai-fallback';
import {AI_MODELS} from '../../ai/types/ai-models';
import {EpubAiSession,epubAiStorageSettings} from '../../import-export/services/epub-ai';
import {nameTombKey} from '../../sync-cloud/services/shared-name-intents';
import {saveSharedChapter} from '../../sync-cloud/services/shared-chapters';
import {ConvertedTitle} from '../../names-convert/components/ConvertedTitle';
import {formatNameCase,nameCaseOptions} from '../../names-convert/services/name-case';
import {lazy,Suspense,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db,activeChapter} from '../../../core/db';
import {defaults,paragraphRanges,parseEntry,uid,type ReaderSettings,type Chapter} from '../../../core/domain';
import {convert,lookup} from '../../names-convert/services/language-client';
import type {Token} from '../../names-convert/services/language';
import {TikTokPlayer,tiktokVoices,sentences,type SpeechState,type Sentence,type TikTokVoice} from '../../tts/services/tts';
import {aiSpeechEndAction,canStartPartialListen} from '../../ai/services/ai-listen';
import {download} from '../../import-export/services/backup';
import {installDefaultDictionaries} from '../../sync-cloud/services/cloud-dictionaries';
import {saveBookNames} from '../../names-convert/services/book-names';
const NameManager=lazy(()=>import('../../names-convert/components/NameManager'));
const CommonNamesPanel=lazy(()=>import('../../names-convert/components/CommonNamesPanel'));
import {captureReadingAnchor,restoreReadingAnchor,type ReadingAnchor} from '../services/reader-scroll-anchor';
import {CONVERT_NAMES_KEY,readConvertNames} from '../../names-convert/services/convert-names';
import {applyCompatibleReaderWordEdits,applyReaderWordEdits,expandReaderSelection,saveReaderName,deleteReaderName} from '../services/reader-word-edit';
import WordPopup from './WordPopup';
import {Modal,errorText} from '../../../shared/components/common';
import {DisplaySettings,ReaderPanel,ReaderHelp,readerFonts} from './ReaderTools';
import {AiPanel} from '../../ai/components/AiPanel';
import {aiModelLabel,aiResultModelLabel} from '../../ai/services/ai-hybrid-prompt';
import {AiReadingSession,aiReadingKey,AI_DEFAULTS,aiBookSettingsKey,queueAiSettings,readReadingAiSettings,type ReadingAiSettings,type AiReadingSource} from '../../ai/services/ai-reading';
import {readAiReadingCache,writeAiReadingCache,readAiParts,writeAiPart} from '../../ai/services/ai-reading-cache';
import type {AiPartsProgress,AiPartsControl} from '../../ai/services/ai-parts';
import {aiParallelStatus} from '../../ai/types/ai-parallel-status';
import type {AiTranslateClientResponse} from '../../ai/services/ai-translate';
import {saveAiReadingProgress,saveReadingProgress} from '../services/reading-progress';
import {readTtsCursor,writeTtsCursor,clearTtsCursor,matchingTtsCursor,ttsHash,type TtsCursor} from '../../tts/services/tts-cursor';
// Reads and writes share one queue across Reader mounts. Pending edits from a
// previous reader finish before the next reader hydrates or persists changes.
const queueReaderSettings=<T,>(operation:()=>PromiseLike<T>)=>queueAiSettings('reader',operation);
type ForegroundAiAttempt={key:string;promise?:Promise<AiTranslateClientResponse>;onModel:(model:string)=>void;onProgress:(progress:AiPartsProgress)=>void;errorHandled?:boolean};
export default function Reader({bookId,initialChapterId,backLabel='← Tủ sách',onBack,onBookInfo,onAiSettings,onChapterChange,notify}:{bookId:string;initialChapterId?:string;backLabel?:string;onBack:()=>void;onBookInfo:()=>void;onAiSettings?:()=>void;onChapterChange?:(id:string)=>void;notify:(s:string)=>void}){
  const book=useLiveQuery(()=>db.books.get(bookId),[bookId]);
  const list=useLiveQuery(async()=>{const hidden=new Set((await db.books.get(bookId))?.hiddenChapterIds??[]);const items:Pick<Chapter,'id'|'title'|'order'|'displayTitle'>[]=[];await db.chapters.where('bookId').equals(bookId).each(c=>{if(hidden.has(c.id))return;items.push({id:c.id,title:c.title,order:c.order,displayTitle:c.displayTitle});});return items.sort((a,b)=>a.order-b.order);},[bookId]);
  const [chapterId,setChapterId]=useState('');const chapter=useLiveQuery(()=>chapterId?activeChapter(bookId,chapterId):undefined,[bookId,chapterId]);
  const names=useLiveQuery(()=>db.names.where('bookId').equals(bookId).toArray(),[bookId]);
  const globalNamesRevision=useLiveQuery(async()=>JSON.stringify((await db.settings.get(CONVERT_NAMES_KEY))?.value??[]),[]);
  const aiGlobalNames=useLiveQuery(()=>readConvertNames(),[]);
  const dictionaryRevision=useLiveQuery(async()=>JSON.stringify((await db.dictionaries.toArray()).map(d=>[d.kind,d.sha256,d.updatedAt,d.blob.size])),[]);
  const [settings,setSettingsState]=useState<ReaderSettings>(defaults);const[tool,setTool]=useState<''|'settings'|'speech'|'help'|'ai'>('');const[focusMode,setFocusMode]=useState(false);const[toc,setToc]=useState(false);const[tocFilter,setTocFilter]=useState('');const[tocPage,setTocPage]=useState(0);
  const settingsValue=useRef<ReaderSettings>(defaults);const settingsEdited=useRef(false);const settingsHydratedRef=useRef(false);
  const pendingSettings=useRef<(ReaderSettings|((old:ReaderSettings)=>ReaderSettings))[]>([]);
  const[settingsHydrated,setSettingsHydrated]=useState(false);const settingsAlive=useRef(false);const settingsNotify=useRef(notify);settingsNotify.current=notify;
  const setSettings=useCallback((update:ReaderSettings|((old:ReaderSettings)=>ReaderSettings))=>{
    const previous=settingsValue.current;const next=typeof update==='function'?update(previous):update;
    settingsEdited.current=true;if(!settingsHydratedRef.current)pendingSettings.current.push(update);
    captureAnchor();settingsValue.current=next;setSettingsState(next);
  },[]);
  const persistSettings=useCallback((value:ReaderSettings)=>{
    void queueReaderSettings(()=>db.transaction('rw',db.settings,async()=>{const current=(await db.settings.get('reader'))?.value as ReaderSettings|undefined;return db.settings.put({key:'reader',value:{...value,libraryBackground:current?.libraryBackground}});})).catch(error=>{
      if(settingsAlive.current)settingsNotify.current(`Không lưu được cài đặt: ${errorText(error)}`);
    });
  },[]);
  const observedReaderSettings=useLiveQuery(()=>queueReaderSettings(()=>db.settings.get('reader')),[]);
  useEffect(()=>{if(!settingsHydrated||!observedReaderSettings)return;const next={...defaults,...observedReaderSettings.value as ReaderSettings};if(JSON.stringify(next)!==JSON.stringify(settingsValue.current)){captureAnchor();settingsEdited.current=false;settingsValue.current=next;setSettingsState(next);}},[observedReaderSettings,settingsHydrated]);
  const[conversionRun,setConversionRun]=useState(0);const[mode,setMode]=useState<'raw'|'convert'|'ai'>('raw');
  // Cursor restore may only choose the mode while the reader has not been touched.
  const modeTouched=useRef(false);
  const [aiActiveModel,setAiActiveModel]=useState('');
  const [aiActiveModelId,setAiActiveModelId]=useState('');
  const [aiModelNotice,setAiModelNotice]=useState<{key:string;text:string}>();
  useEffect(()=>{if(!aiModelNotice)return;const timer=setTimeout(()=>setAiModelNotice(undefined),5000);return()=>clearTimeout(timer);},[aiModelNotice]);
  const [aiElapsed,setAiElapsed]=useState(0);
  const [aiParts,setAiParts]=useState<{key:string;state:AiPartsProgress}>();
  const [aiSettings,setAiSettings]=useState<ReadingAiSettings>(AI_DEFAULTS);
  const [aiLoaded,setAiLoaded]=useState(false);const [aiError,setAiError]=useState('');const [aiLoadError,setAiLoadError]=useState('');const [aiHydrateRetry,setAiHydrateRetry]=useState(0);
  const [aiRetry,setAiRetry]=useState(0);const [aiPrewarmRetry,setAiPrewarmRetry]=useState(0);const aiRetryIsPrewarm=useRef(false);const [aiRetryAt,setAiRetryAt]=useState(0);const [aiRetryIn,setAiRetryIn]=useState(0);const aiAutoAttempt=useRef(0);const [aiText,setAiText]=useState<{key:string;text:string;nodes?:string[];modelsSummary?:string}>();
  const aiAutomaticRetry=useRef(false);
  const aiNextStopGeneration=useRef(0);
  const [aiFailureCode,setAiFailureCode]=useState('');
  const [aiPreloadCode,setAiPreloadCode]=useState('');
  const [aiHistory,setAiHistory]=useState<string[]>([]),[aiNextHistory,setAiNextHistory]=useState<string[]>([]);
  const [aiFailureId,setAiFailureId]=useState(''),[aiPreloadId,setAiPreloadId]=useState('');
  const [aiNextProgress,setAiNextProgress]=useState<AiPartsProgress>();
  const [aiNextModel,setAiNextModel]=useState('');
  const [aiOnline,setAiOnline]=useState(()=>navigator.onLine!==false);
  useEffect(()=>{const update=()=>setAiOnline(navigator.onLine!==false);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  // Saving a draft leaves the current translation/listening session intact.
  // Navigation, re-entering AI or an explicit retry starts the next request.
  const [savedPromptSession,setSavedPromptSession]=useState<{chapterId:string;retry:number;settings:ReadingAiSettings}>();
  const [fallbackAttempt,setFallbackAttempt]=useState<{bookId:string;chapterId:string;revision:number;settings:string;model:string}>();
  const savedRequestSettings=savedPromptSession?.chapterId===chapterId&&savedPromptSession.retry===aiRetry&&mode==='ai'?savedPromptSession.settings:aiSettings;
  const fallbackModel=fallbackAttempt?.bookId===bookId&&fallbackAttempt.chapterId===chapterId&&fallbackAttempt.revision===chapter?.revision&&fallbackAttempt.settings===JSON.stringify(savedRequestSettings)?fallbackAttempt.model:undefined;
  const requestAiSettings=useMemo(()=>({...savedRequestSettings,...(fallbackModel?{model:fallbackModel}:{}),fallbackModels:recommendedFallbackModels(fallbackModel??savedRequestSettings.model)}),[savedRequestSettings,fallbackModel]);
  const nextRequestAiSettings=useMemo(()=>({...aiSettings,fallbackModels:recommendedFallbackModels(aiSettings.model)}),[aiSettings]);
  const alternativeAiModel=recommendedFallbackModels(aiActiveModelId||requestAiSettings.model)[0];
  const savedAiSettings=useLiveQuery(async()=>{if(!aiLoaded)return undefined;try{return await queueAiSettings(aiBookSettingsKey(bookId),()=>readReaderAiPreferences(bookId));}catch{return undefined;}},[bookId,aiLoaded]);
  useEffect(()=>{if(!aiLoaded||!savedAiSettings)return;const next=savedAiSettings.settings;if(JSON.stringify(aiSettings)!==JSON.stringify(next)){if(mode==='ai')setSavedPromptSession({chapterId,retry:aiRetry,settings:requestAiSettings});setAiSettings(next);}},[aiLoaded,savedAiSettings,aiSettings,mode,chapterId,aiRetry,requestAiSettings]);
  const [preloadAi,setPreloadAi]=useState(true);const [preloadError,setPreloadError]=useState('');
  const [nextAiState,setNextAiState]=useState<{key:string;status:'idle'|'loading'|'ready'|'error'}>({key:'',status:'idle'});
  const [convertAiNext,setConvertAiNext]=useState<{bookId:string;chapterId:string;nextId:string}>();
  const convertPrewarm=useRef<{context:string;key:string;source:AiReadingSource}|undefined>(undefined);
  const foregroundPrewarm=useRef<{context:string;key:string;source:AiReadingSource}|undefined>(undefined);
  const foregroundAttempt=useRef<ForegroundAiAttempt|undefined>(undefined);
  const sharedAiControl=useRef<AiPartsControl|null>(null);if(!sharedAiControl.current)sharedAiControl.current={throttled:false,waitUntil:0};
  const epubSession=useRef<EpubAiSession|null>(null);if(!epubSession.current)epubSession.current=new EpubAiSession({read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart},undefined,true,undefined,sharedAiControl.current);
  const aiSession=useRef<AiReadingSession|null>(null);if(!aiSession.current)aiSession.current=new AiReadingSession(undefined,{read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart},undefined,true,undefined,sharedAiControl.current);
  useEffect(()=>{let alive=true;void queueAiSettings(aiBookSettingsKey(bookId),()=>readReaderAiPreferences(bookId)).then(row=>{if(alive){setAiSettings(row.settings);setAiLoadError('');setAiLoaded(true);}}).catch(e=>{if(alive)setAiLoadError('Không đọc được prompt: '+errorText(e));});return()=>{alive=false;aiSession.current?.clear();epubSession.current?.clear();};},[bookId,aiHydrateRetry]);
  const readerOptions=useLiveQuery(()=>db.settings.get('reader-options'),[]);
  useEffect(()=>{if(readerOptions){const value=readerOptions.value as {autoNext:boolean;preloadAi:boolean};setAutoNext(value.autoNext);setPreloadAi(value.preloadAi);}},[readerOptions]);
  const changeReaderOptions=(patch:Partial<{autoNext:boolean;preloadAi:boolean}>)=>{if(patch.autoNext!==undefined)setAutoNext(patch.autoNext);if(patch.preloadAi!==undefined)setPreloadAi(patch.preloadAi);void queueAiSettings('reader-options',async()=>{const old=(await db.settings.get('reader-options'))?.value as object|undefined;await db.settings.put({key:'reader-options',value:{autoNext:true,preloadAi:true,...old,...patch}});}).catch(e=>notify(errorText(e)));};
  const[snapshot,setSnapshot]=useState<{id:string;revision:number;text:string;signature:string;tokens:Token[]}>();
  const[conversionError,setConversionError]=useState('');const[converting,setConverting]=useState(false);const[tempWordEdits,setTempWordEdits]=useState<{chapterId:string;revision:number;sourceStart:number;sourceEnd:number;value:string}[]>([]);const[ttsTextOverride,setTtsTextOverride]=useState('');const[ttsEditor,setTtsEditor]=useState(false);const[ttsDraft,setTtsDraft]=useState<string[]>([]);
  const[edit,setEdit]=useState<string|null>(null);const editRef=useRef<HTMLTextAreaElement>(null);const[selected,setSelected]=useState<Token>();const[nameKey,setNameKey]=useState('');const[nameValue,setNameValue]=useState('');const[meaning,setMeaning]=useState<{meanings:string[];hanviet:string;english?:string[];names?:string[]}>({meanings:[],hanviet:''});const[namePanel,setNamePanel]=useState(false);
  const[selectionTranslation,setSelectionTranslation]=useState('');const[lookupLoading,setLookupLoading]=useState(false);const[wordBusy,setWordBusy]=useState(false);const[wordError,setWordError]=useState('');const[wordModal,setWordModal]=useState<''|'add'|'meaning'>('');const[popupAnchor,setPopupAnchor]=useState({left:20,top:20,right:20,bottom:20});
  const selection=useRef<{chapterId:string;revision:number;token:Token}|undefined>(undefined);const lookupReqId=useRef(0);const readerAlive=useRef(false);const currentChapter=useRef(chapter);currentChapter.current=chapter;
  const[autoNext,setAutoNext]=useState(true);const[speech,setSpeech]=useState<SpeechState>('idle');const[sentence,setSentence]=useState<Sentence>();const[speechNotice,setSpeechNotice]=useState('');const[nameDraft,setNameDraft]=useState('');const[nameSaving,setNameSaving]=useState(false);
  const nameDirty=useRef(false);const nameDraftRevision=useRef(0);
  const semanticSignature=JSON.stringify([names?.map(n=>[n.key,n.value]),globalNamesRevision,dictionaryRevision,conversionRun]);
  const sameSource=!!chapter&&chapter.id===chapterId&&snapshot?.id===chapter.id&&snapshot.revision===chapter.revision&&snapshot.text===chapter.text;
  const tokens=sameSource?snapshot!.tokens:[];
  const restoredCursor=useRef(readTtsCursor(bookId));const activeCursor=useRef<TtsCursor|undefined>(undefined);const cursorRestoreDone=useRef(false);const lastCheckpoint=useRef('');
  const checkpointRef=useRef<()=>void>(()=>{});

  const endedRef=useRef<()=>void>(()=>{});const continueRef=useRef(false);const playerRef=useRef<TikTokPlayer|null>(null);
  const lastSpokenEnd=useRef(0);const partialListen=useRef(false);const partialEnded=useRef(false);const startedPartial=useRef(false);const[partialWait,setPartialWait]=useState(false);
  const[,refreshSharedCursor]=useState(0);
  useEffect(()=>{const changed=(event:Event)=>{const r=(event as CustomEvent).detail;if(r?.kind!=='tts-cursor'||r.bookId!==bookId||activeCursor.current)return;restoredCursor.current=readTtsCursor(bookId);refreshSharedCursor(n=>n+1);};window.addEventListener('shared-state-applied',changed);return()=>window.removeEventListener('shared-state-applied',changed);},[bookId]);
  if(!playerRef.current)playerRef.current=new TikTokPlayer((state,s,msg)=>{setSpeech(state);setSentence(s);if(s)lastSpokenEnd.current=s.end;setSpeechNotice(msg??'');if(state==='ended'){activeCursor.current=undefined;restoredCursor.current=undefined;clearTtsCursor(bookId);}if(s&&activeCursor.current){activeCursor.current={...activeCursor.current,offset:s.start,audioTime:0,updatedAt:Date.now()};checkpointRef.current();}if(msg)notify(msg);},()=>endedRef.current(),()=>stopReading());
  useEffect(()=>{playerRef.current?.setMediaKeepAlive(true);},[]);

  const progressTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const position=useRef({paragraph:0,offset:0});const article=useRef<HTMLElement>(null);
  const explicitStartPending=useRef(!!initialChapterId);
  // Do not replace saved progress with the initial zero while restoration is pending.
  const positionChapter=useRef<string|undefined>(undefined);
  const positionRevision=useRef<number|undefined>(undefined);
  const pendingAnchor=useRef<({id:string;revision:number}&ReadingAnchor)|undefined>(undefined);
  const anchorContext=useRef({chapter,chapterId,sameSource,mode});anchorContext.current={chapter,chapterId,sameSource,mode};
  function captureAnchor(){
    if(anchorContext.current.mode==='ai')return;
    const context=anchorContext.current,c=context.chapter;
    if(!c||c.id!==context.chapterId||positionChapter.current!==c.id||positionRevision.current!==c.revision)return;
    const anchor=article.current&&captureReadingAnchor(article.current,c.text);
    if(anchor)pendingAnchor.current={id:c.id,revision:c.revision,...anchor};
  }
  useLayoutEffect(()=>{
    const anchor=pendingAnchor.current;pendingAnchor.current=undefined;
    if(!anchor||chapter?.id!==anchor.id||chapter.revision!==anchor.revision||chapter.id!==chapterId)return;
    if(article.current)restoreReadingAnchor(article.current,chapter.text,anchor);
  },[snapshot,settings,mode]);
  const save=useCallback(()=>{if(mode!=='ai'&&chapter&&chapter.id===chapterId&&positionChapter.current===chapter.id&&positionRevision.current===chapter.revision)void saveReadingProgress({bookId,chapterId:chapter.id,paragraph:position.current.paragraph,offset:position.current.offset,revision:chapter.revision,updatedAt:Date.now()}).catch(e=>notify(errorText(e)));},[bookId,chapter,chapterId,mode,notify]);
  useEffect(()=>{
    let alive=true;settingsAlive.current=true;
    void queueReaderSettings(()=>db.settings.get('reader')).then(row=>{
      if(!alive)return;
      let merged={...defaults,...row?.value as ReaderSettings};
      // Replay explicit edits over saved values, including intentional resets to
      // defaults. Value-diff merging would miss clears of custom colors.
      for(const update of pendingSettings.current)merged=typeof update==='function'?update(merged):update;
      pendingSettings.current=[];settingsHydratedRef.current=true;
      settingsValue.current=merged;setSettingsState(merged);setSettingsHydrated(true);
    }).catch(error=>{if(alive)settingsNotify.current(`Không tải được cài đặt: ${errorText(error)}`);});
    return()=>{alive=false;settingsAlive.current=false;};
  },[]);
  useEffect(()=>{if(settingsHydrated&&settingsEdited.current)persistSettings(settings);},[settings,settingsHydrated,persistSettings]);
  useEffect(()=>{if(list&&!list.length){stopReading();setChapterId('');return;}let alive=true;void db.progress.get(bookId).then(p=>{if(alive&&list?.length){if(!modeTouched.current&&!initialChapterId&&p?.mode==='ai'&&list.some(c=>c.id===p.chapterId))setMode('ai');setChapterId(old=>list.some(c=>c.id===old)?old:list.some(c=>c.id===initialChapterId)?initialChapterId!:p?.mode==='ai'&&list.some(c=>c.id===p.chapterId)?p.chapterId:list.some(c=>c.id===restoredCursor.current?.chapterId)?restoredCursor.current!.chapterId:list.some(c=>c.id===p?.chapterId)?p!.chapterId:list[0].id);}}).catch(e=>{if(alive)notify(errorText(e));});return()=>{alive=false;};},[bookId,list,initialChapterId,notify]);
  useEffect(()=>{readerAlive.current=true;return()=>{readerAlive.current=false;lookupReqId.current++;selection.current=undefined;checkpointRef.current();playerRef.current?.stop();};},[]);
  useEffect(()=>{closeSelection();},[chapterId,chapter?.revision,mode]);
  const previousSource=useRef<{id:string;revision:number;text:string}|undefined>(undefined);
  useEffect(()=>{
    const previous=previousSource.current;
    if(previous?.id===chapterId&&(!chapter||chapter.revision!==previous.revision||chapter.text!==previous.text))stopReading();
    if(chapter?.id===chapterId)previousSource.current={id:chapter.id,revision:chapter.revision,text:chapter.text};
  },[chapterId,chapter?.id,chapter?.revision,chapter?.text]);
  useEffect(()=>{
    let alive=true;closeSelection();setConversionError('');
    if(mode!=='convert'||!chapter||chapter.id!==chapterId||names===undefined||globalNamesRevision===undefined||dictionaryRevision===undefined){setConverting(false);return;}
    if(sameSource&&snapshot?.signature!==semanticSignature)stopReading();
    setConverting(true);
    void convert(chapter.text,names,{standardizePunctuation:true,capitalize:true}).then(t=>{
      if(alive){captureAnchor();setSnapshot({id:chapter.id,revision:chapter.revision,text:chapter.text,signature:semanticSignature,tokens:t});}
    }).catch(e=>{if(alive){setConversionError(errorText(e));notify(errorText(e));}}).finally(()=>{if(alive)setConverting(false);});
    return()=>{alive=false;};
  },[chapterId,chapter?.id,chapter?.revision,chapter?.text,mode,semanticSignature]);
  const conversionReady=sameSource&&snapshot?.signature===semanticSignature;
  const aiSemantic=JSON.stringify([requestAiSettings,names?.map(n=>[n.key,n.value])]);
  const lastAiSemantic=useRef(aiSemantic);useLayoutEffect(()=>{if(lastAiSemantic.current!==aiSemantic&&mode==='ai')stopReading();lastAiSemantic.current=aiSemantic;},[aiSemantic,mode]);
  const currentAiSource=chapter?.id===chapterId?{bookId,id:chapter.id,revision:chapter.revision,text:chapter.text}:undefined;
  const aiNames=names||[];
  const aiNamesSnapshot=useRef({bookId,names:aiNames});aiNamesSnapshot.current={bookId,names:aiNames};
  const [pendingAiListen,setPendingAiListen]=useState('');
  const [showCommonNames,setShowCommonNames]=useState(false);
  const aiKey=currentAiSource?aiReadingKey(currentAiSource,requestAiSettings,aiNames):'';
  const backgroundAi=mode==='convert'&&convertAiNext?.bookId===bookId&&convertAiNext.chapterId===chapterId&&list?.[list.findIndex(c=>c.id===chapterId)+1]?.id===convertAiNext.nextId;
  const backgroundContext=backgroundAi?JSON.stringify([aiKey,convertAiNext!.nextId,nextRequestAiSettings]):'';
  const nextListedId=list?.[1+(list?.findIndex(c=>c.id===chapterId)??-1)]?.id;
  const foregroundPrewarmContext=JSON.stringify([aiKey,nextListedId,nextRequestAiSettings]);
  useEffect(()=>{setConvertAiNext(old=>old&&(old.bookId!==bookId||old.chapterId!==chapterId)?undefined:old);},[bookId,chapterId]);
  const aiReady=!!aiKey&&aiText?.key===aiKey;
  const modelLookupKey=JSON.stringify([aiKey,nextListedId,nextRequestAiSettings]);
  const [modelCache,setModelCache]=useState<{key:string;current?:string;next?:string}>();
  useEffect(()=>{
    if(tool!=='ai'||!currentAiSource||!aiLoaded||names===undefined)return;const stop=new AbortController();let alive=true;setModelCache({key:modelLookupKey});const timer=setTimeout(()=>stop.abort(),2000);
    const read=async(source:AiReadingSource,epub:boolean,settings:ReadingAiSettings,target:'current'|'next')=>{const hit=await readAiReadingCache(source,epub?epubAiStorageSettings(settings):settings,aiNames,stop.signal);if(alive&&!stop.signal.aborted&&hit)setModelCache(old=>({...old,key:modelLookupKey,[target]:aiResultModelLabel(hit)}));};
    const next=nextListedId?activeChapter(bookId,nextListedId).then(c=>c?.bookId===bookId?read({bookId,id:c.id,revision:c.revision,text:c.text},!!c.epub,nextRequestAiSettings,'next'):undefined):Promise.resolve();
    void Promise.allSettled([read(currentAiSource,!!chapter?.epub,requestAiSettings,'current'),next]).finally(()=>clearTimeout(timer));
    return()=>{alive=false;clearTimeout(timer);stop.abort();};
  },[tool,modelLookupKey,aiLoaded,names===undefined]);
  const aiPreview=aiParts?.key===aiKey?aiParts.state:undefined;
  const aiParallelText=aiParallelStatus(aiPreview);
  const waitingForConvert=mode==='convert'&&(!conversionReady||converting)||mode==='ai'&&!aiReady;
  useEffect(()=>{
    setAiElapsed(0);if(mode!=='ai'||aiReady||aiError||aiLoadError)return;
    const started=Date.now(),timer=setInterval(()=>setAiElapsed(Math.floor((Date.now()-started)/1000)),1000);
    return()=>clearInterval(timer);
  },[mode,aiKey,aiReady,aiRetry,aiError,aiLoadError]);
  // Recover temporary failures within the shared chapter budget; Stop/navigation cancel the countdown.
  useEffect(()=>{aiAutoAttempt.current=0;aiAutomaticRetry.current=false;setAiRetryAt(0);setAiRetryIn(0);},[aiKey,mode]);
  useEffect(()=>{
    if(!aiRetryAt)return;
    const tick=()=>{const left=Math.max(0,Math.ceil((aiRetryAt-Date.now())/1000));setAiRetryIn(left);if(left<=0&&navigator.onLine!==false){aiAutomaticRetry.current=true;setAiRetryAt(0);setAiError('');setPreloadError('');if(aiRetryIsPrewarm.current)setAiPrewarmRetry(n=>n+1);else setAiRetry(n=>n+1);}};
    tick();const timer=setInterval(tick,250);
    return()=>clearInterval(timer);
  },[aiRetryAt]);
  // Only input changes invalidate a next target. Assigning a new target must not retry an error.
  useEffect(()=>{
    if(mode!=='ai'&&!backgroundAi)return;const ref=backgroundAi?convertPrewarm:foregroundPrewarm,context=backgroundAi?backgroundContext:foregroundPrewarmContext,target=ref.current;
    if(!target||target.context!==context||target.key===aiReadingKey(target.source,nextRequestAiSettings,aiNames))return;
    aiSession.current!.cancel(target.key);epubSession.current!.cancel(target.key);ref.current=undefined;aiAutomaticRetry.current=false;aiAutoAttempt.current=0;setAiRetryAt(0);setAiRetryIn(0);setAiPrewarmRetry(n=>n+1);
  },[mode,backgroundAi,backgroundContext,foregroundPrewarmContext,nextRequestAiSettings,names]);
  useEffect(()=>{
    const attemptKey=JSON.stringify([aiKey,aiRetry]);
    const continuing=mode==='ai'&&foregroundAttempt.current?.key===attemptKey;
    const nextGeneration=aiNextStopGeneration.current;
    let alive=true;if(!continuing){setAiError('');setAiFailureCode('');setAiFailureId('');setAiHistory([]);setAiActiveModel('');setAiParts(undefined);}setPreloadError('');setAiPreloadCode('');setNextAiState({key:aiKey,status:'idle'});
    if(mode!=='ai')foregroundAttempt.current=undefined;
    if(mode!=='ai'&&!backgroundAi){aiSession.current!.clear();epubSession.current!.clear();return;}if(!currentAiSource){aiSession.current!.clear();epubSession.current!.clear();foregroundAttempt.current=undefined;foregroundPrewarm.current=undefined;convertPrewarm.current=undefined;setAiRetryAt(0);return;}if(!aiLoaded||names===undefined)return;
    const session=chapter?.epub?epubSession.current!:aiSession.current!,source=currentAiSource;let requestedNextKey:string|undefined;
    const failed=(e:unknown,isPrewarm:boolean)=>{
      const error=e as {name?:string;code?:string;requestId?:string};
      if(!alive||isPrewarm&&nextGeneration!==aiNextStopGeneration.current||error?.name==='AbortError'
        ||isPrewarm&&requestedNextKey&&(backgroundAi?convertPrewarm.current?.key:foregroundPrewarm.current?.key)!==requestedNextKey)return;
      if(error?.code==='ai_recovery_exhausted'){setAiRetryAt(0);setAiRetryIn(0);}
      if(isPrewarm){setAiPreloadCode(error.code??'');setAiPreloadId(error.requestId??'');setPreloadError(errorText(e));setNextAiState({key:aiKey,status:'error'});}
      else{setAiFailureCode(error.code??'');setAiFailureId(error.requestId??'');setAiError(errorText(e));}
      const retryKey=isPrewarm?requestedNextKey:aiKey;
      const deadline=retryKey?Math.min(aiSession.current!.retryDeadline(retryKey)??Infinity,epubSession.current!.retryDeadline(retryKey)??Infinity):0;
      const delay=aiAutoResumeDelay(e,aiAutoAttempt.current,deadline);
      if(delay!==undefined){
        aiAutoAttempt.current++;aiRetryIsPrewarm.current=isPrewarm;setAiRetryAt(Date.now()+delay);
        notify(`Dịch AI gián đoạn. Tự tiếp tục sau ${Math.ceil(delay/1000)} giây; giữ các phần đã dịch.`);
      }
    };
    if(backgroundAi){
      const retained=convertPrewarm.current?.context===backgroundContext?[aiKey,convertPrewarm.current.key]:[aiKey];aiSession.current!.retain(retained);epubSession.current!.retain(retained);
      setNextAiState({key:aiKey,status:'loading'});setAiNextProgress(undefined);setAiNextModel('');setAiNextHistory([]);setAiPreloadId('');
      void activeChapter(bookId,convertAiNext!.nextId).then(async next=>{
        if(!alive||nextGeneration!==aiNextStopGeneration.current)return;if(!next||next.bookId!==bookId)throw Error('Không tìm thấy chương sau.');
        if(!next.epub&&next.text.length>128000)throw Error('Chương sau vượt giới hạn dịch AI.');
        if(aiNamesSnapshot.current.bookId!==bookId)return;const nextNames=aiNamesSnapshot.current.names;
        const nextSource={bookId,id:next.id,revision:next.revision,text:next.text},nextKey=aiReadingKey(nextSource,nextRequestAiSettings,nextNames);requestedNextKey=nextKey;convertPrewarm.current={context:backgroundContext,key:nextKey,source:nextSource};aiSession.current!.retain([aiKey,nextKey]);epubSession.current!.retain([aiKey,nextKey]);
        const nextResult=next.epub?await epubSession.current!.request(nextSource,nextRequestAiSettings,nextNames,next.epub,m=>{if(alive){setAiNextModel(aiModelLabel(m));setAiNextHistory(old=>old.at(-1)===aiModelLabel(m)?old:[...old.slice(-7),aiModelLabel(m)]);}},p=>{if(alive)setAiNextProgress(p);},{automatic:aiAutomaticRetry.current,isPrewarm:true}):await aiSession.current!.request(nextSource,nextRequestAiSettings,nextNames,undefined,m=>{if(alive){setAiNextModel(aiModelLabel(m));setAiNextHistory(old=>old.at(-1)===aiModelLabel(m)?old:[...old.slice(-7),aiModelLabel(m)]);}},p=>{if(alive)setAiNextProgress(p);},{automatic:aiAutomaticRetry.current,isPrewarm:true});
        if(alive&&nextGeneration===aiNextStopGeneration.current&&convertPrewarm.current?.key===nextKey){void saveAiReadingProgress(nextSource,()=>alive&&convertPrewarm.current?.key===nextKey).catch(e=>notify(errorText(e)));setNextAiState({key:aiKey,status:'ready'});if(aiAutomaticRetry.current&&aiAutoAttempt.current>0){aiAutoAttempt.current=0;notify('Đã phục hồi bản AI chương sau.');}setAiNextModel(aiResultModelLabel(nextResult));setAiModelNotice({key:aiKey,text:'Chương sau: '+aiResultModelLabel(nextResult)});}
      }).catch(e=>failed(e,true));return()=>{alive=false;};
    }
    const retained=foregroundPrewarm.current?.context===foregroundPrewarmContext?[aiKey,foregroundPrewarm.current.key]:[aiKey];aiSession.current!.retain(retained);epubSession.current!.retain(retained);
    if(!chapter?.epub&&source.text.length>128000){setAiError('Chương vượt 128.000 ký tự; hãy chọn Convert.');return;}
    const onModel=(model:string)=>{if(alive){setAiActiveModelId(model);setAiActiveModel(aiModelLabel(model));setAiHistory(old=>old.at(-1)===aiModelLabel(model)?old:[...old.slice(-7),aiModelLabel(model)]);}},onProgress=(state:AiPartsProgress)=>{if(alive)setAiParts({key:aiKey,state});};
    // A change to the next chapter's settings must not retry this foreground job.
    // Rebind observers so a retained in-flight job still publishes to this effect.
    const attempt=continuing?foregroundAttempt.current!:{key:attemptKey,onModel,onProgress} as ForegroundAiAttempt;
    attempt.onModel=onModel;attempt.onProgress=onProgress;foregroundAttempt.current=attempt;
    const request=attempt.promise??(attempt.promise=chapter?.epub?epubSession.current!.request(source,requestAiSettings,aiNames,chapter.epub,m=>attempt.onModel(m),p=>attempt.onProgress(p),{automatic:aiAutomaticRetry.current}):aiSession.current!.request(source,requestAiSettings,aiNames,undefined,m=>attempt.onModel(m),p=>attempt.onProgress(p),{automatic:aiAutomaticRetry.current}));
    void request.then(async result=>{
      if(!alive)return;if(aiAutomaticRetry.current&&aiAutoAttempt.current>0){aiAutoAttempt.current=0;notify('Đã phục hồi dịch AI, tiếp tục đọc/nghe.');}setAiText({key:aiKey,text:result.result,modelsSummary:aiResultModelLabel(result),...('nodes' in result?{nodes:result.nodes as string[]}: {})});setAiModelNotice({key:aiKey,text:'Bản dịch: '+aiResultModelLabel(result)});
      void saveAiReadingProgress(source,()=>alive).catch(e=>notify(errorText(e)));
      if(!preloadAi)return;
      const index=list?.findIndex(c=>c.id===source.id)??-1,nextId=list?.[index+1]?.id;if(!nextId)return;
      setNextAiState({key:aiKey,status:'loading'});setAiNextProgress(undefined);setAiNextModel('');setAiNextHistory([]);setAiPreloadId('');
      const next=await activeChapter(bookId,nextId);if(!alive||nextGeneration!==aiNextStopGeneration.current||!next||next.bookId!==bookId)return;
      const nextSource={bookId,id:next.id,revision:next.revision,text:next.text};
      if(aiNamesSnapshot.current.bookId!==bookId)return;const nextNames=aiNamesSnapshot.current.names;
      const nextKey=aiReadingKey(nextSource,nextRequestAiSettings,nextNames);requestedNextKey=nextKey;foregroundPrewarm.current={context:foregroundPrewarmContext,key:nextKey,source:nextSource};aiSession.current!.retain([aiKey,nextKey]);epubSession.current!.retain([aiKey,nextKey]);
      if(!next.epub&&next.text.length>128000){setPreloadError('Chương sau vượt giới hạn dịch AI.');setNextAiState({key:aiKey,status:'error'});return;}
      const nextResult=next.epub?await epubSession.current!.request(nextSource,nextRequestAiSettings,nextNames,next.epub,m=>{if(alive){setAiNextModel(aiModelLabel(m));setAiNextHistory(old=>old.at(-1)===aiModelLabel(m)?old:[...old.slice(-7),aiModelLabel(m)]);}},p=>{if(alive)setAiNextProgress(p);},{automatic:aiAutomaticRetry.current,isPrewarm:true}):await aiSession.current!.request(nextSource,nextRequestAiSettings,nextNames,undefined,m=>{if(alive){setAiNextModel(aiModelLabel(m));setAiNextHistory(old=>old.at(-1)===aiModelLabel(m)?old:[...old.slice(-7),aiModelLabel(m)]);}},p=>{if(alive)setAiNextProgress(p);},{automatic:aiAutomaticRetry.current,isPrewarm:true});
      if(alive&&nextGeneration===aiNextStopGeneration.current&&foregroundPrewarm.current?.key===nextKey){void saveAiReadingProgress(nextSource,()=>alive&&foregroundPrewarm.current?.key===nextKey).catch(e=>notify(errorText(e)));setNextAiState({key:aiKey,status:'ready'});if(aiAutomaticRetry.current&&aiAutoAttempt.current>0){aiAutoAttempt.current=0;notify('Đã phục hồi bản AI chương sau.');}setAiNextModel(aiResultModelLabel(nextResult));setAiModelNotice({key:aiKey,text:'Chương sau: '+aiResultModelLabel(nextResult)});}
    }).catch(e=>{const isPrewarm=!!session.get(aiKey);if(isPrewarm||!attempt.errorHandled){if(alive&&!isPrewarm&&e?.name!=='AbortError')attempt.errorHandled=true;failed(e,isPrewarm);}});
    return()=>{alive=false;};
  },[mode,aiKey,aiLoaded,names===undefined,preloadAi,aiRetry,aiPrewarmRetry,list,backgroundAi,backgroundContext,nextRequestAiSettings,foregroundPrewarmContext]);
  const displayTokens=useMemo(()=>{if(!chapter)return tokens;const edits=tempWordEdits.filter(e=>e.chapterId===chapter.id&&e.revision===chapter.revision);return applyCompatibleReaderWordEdits(chapter.text,tokens,edits).tokens;},[chapter?.id,chapter?.revision,tokens,tempWordEdits]);
  const epubNodes=chapter?.epub?(mode==='raw'?chapter.epub.nodes:mode==='ai'?(aiReady?aiText!.nodes:aiPreview?.text?aiPreview.nodes:undefined):conversionReady?convertedEpubNodes(chapter.epub,displayTokens,dictionaryRevision==='[]'):undefined):undefined;
  const renderedText=mode==='ai'?(aiReady?aiText!.text:aiPreview?.text||''):mode==='convert'?(sameSource?(epubNodes?epubNodes.join('\n'):displayTokens.map(t=>t.targetText).join('')):''):chapter?.id===chapterId?chapter.text:'';
  const chapterImages=useMemo(()=>mode==='ai'?nameImagesForSource(chapter?.text||'',aiNames):mode==='convert'?displayTokens.flatMap(t=>t.nameImage?[t.nameImage]:[]):[],[mode,chapter?.text,names,displayTokens]);
  const imageMatches=useMemo(()=>findNameImages(renderedText,chapterImages),[renderedText,chapterImages]);
  const speechText=ttsTextOverride||renderedText;
  const paragraphs=useMemo(()=>paragraphRanges(renderedText),[renderedText]);
  const cursorSemantic=mode==='ai'?aiKey:mode==='convert'?semanticSignature:'raw';
  const [ttsIdentity,setTtsIdentity]=useState<{key:string;value:Pick<TtsCursor,'bookId'|'chapterId'|'revision'|'mode'|'sourceHash'|'semanticHash'|'renderedHash'>}>();
  const identityKey=JSON.stringify([bookId,chapterId,chapter?.revision,chapter?.text,mode,cursorSemantic,speechText,waitingForConvert]);
  // One explicit continue affordance after reload; playback still needs a user gesture.
  const cursorResumable=speech!=='playing'&&speech!=='loading'&&!!ttsIdentity&&ttsIdentity.key===identityKey&&!ttsTextOverride&&matchingTtsCursor(restoredCursor.current,ttsIdentity.value);
  useEffect(()=>{let alive=true;if(!chapter||chapter.id!==chapterId||waitingForConvert||!speechText)return;
    void Promise.all([ttsHash(chapter.text),ttsHash(cursorSemantic),ttsHash(speechText)]).then(([sourceHash,semanticHash,renderedHash])=>{if(alive)setTtsIdentity({key:identityKey,value:{bookId,chapterId,revision:chapter.revision,mode,sourceHash,semanticHash,renderedHash}});}).catch(()=>{});
    return()=>{alive=false;};
  },[identityKey]);
  useEffect(()=>{if(cursorRestoreDone.current||!chapter||chapter.id!==chapterId||!settingsHydrated||!aiLoaded||names===undefined||aiGlobalNames===undefined||dictionaryRevision===undefined)return;
    let alive=true;const cursor=restoredCursor.current;
    if(!cursor||cursor.chapterId!==chapterId){cursorRestoreDone.current=true;return;}
    void ttsHash(chapter.text).then(hash=>{if(!alive)return;cursorRestoreDone.current=true;if(cursor.revision!==chapter.revision||cursor.sourceHash!==hash){restoredCursor.current=undefined;clearTtsCursor(bookId);return;}if(!modeTouched.current&&cursor.mode!=='convert')setMode(cursor.mode);settingsValue.current={...settingsValue.current,voiceId:cursor.voiceId,ttsRate:cursor.rate};setSettingsState(settingsValue.current);}).catch(()=>{});
    return()=>{alive=false;};
  },[chapterId,chapter?.id,chapter?.revision,chapter?.text,settingsHydrated,aiLoaded,names,aiGlobalNames,dictionaryRevision]);
  checkpointRef.current=()=>{const cursor=activeCursor.current;if(!cursor)return;const position=playerRef.current!.position();const marker=`${position.offset}:${position.audioTime}`;if(marker===lastCheckpoint.current)return;lastCheckpoint.current=marker;const updated={...cursor,...position,grouping:playerRef.current!.chunking(),updatedAt:Date.now()};activeCursor.current=updated;restoredCursor.current=updated;writeTtsCursor(updated);};
  useEffect(()=>{const checkpoint=()=>checkpointRef.current();const timer=setInterval(checkpoint,1000);window.addEventListener('pagehide',checkpoint);document.addEventListener('visibilitychange',checkpoint);return()=>{clearInterval(timer);window.removeEventListener('pagehide',checkpoint);document.removeEventListener('visibilitychange',checkpoint);};},[]);
  const manualScrollUntil=useRef(0);
  useEffect(()=>{const manual=(event:Event)=>{if(event instanceof KeyboardEvent&&!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))return;manualScrollUntil.current=Date.now()+3000;};window.addEventListener('wheel',manual,{passive:true});window.addEventListener('touchmove',manual,{passive:true});window.addEventListener('pointerdown',manual,{passive:true});window.addEventListener('keydown',manual);return()=>{window.removeEventListener('wheel',manual);window.removeEventListener('touchmove',manual);window.removeEventListener('pointerdown',manual);window.removeEventListener('keydown',manual);};},[]);
  useEffect(()=>{
    if(!sentence||ttsTextOverride||speech!=='playing')return;
    const follow=()=>{if(document.hidden||Date.now()<manualScrollUntil.current)return;const target=article.current?.querySelector('.speaking');if(!target)return;const rect=target.getBoundingClientRect();if(rect.bottom<80||rect.top>window.innerHeight-100)target.scrollIntoView({block:'center',behavior:'smooth'});};
    let timer:ReturnType<typeof setInterval>|undefined;
    const visibility=()=>{clearInterval(timer);timer=undefined;if(!document.hidden){follow();timer=setInterval(follow,500);}};
    visibility();document.addEventListener('visibilitychange',visibility);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  },[sentence,speech,ttsTextOverride]);

  const aiDisplayedChapter=useRef('');useLayoutEffect(()=>{if(mode==='ai'&&aiReady&&aiDisplayedChapter.current!==chapterId){aiDisplayedChapter.current=chapterId;article.current?.scrollIntoView({block:'start'});}},[mode,aiReady,chapterId]);
  const blocks=useMemo(()=>{
    if(mode!=='convert')return [];
    const rows:{token:Token;text:string;sourceStart:number;sourceEnd:number;literal:boolean}[][]=[[]];for(const token of displayTokens){let offset=0;const literal=token.source===token.targetText;const pieces=token.targetText.split('\n');pieces.forEach((text,i)=>{if(text)rows[rows.length-1].push({token,text,sourceStart:literal?token.sourceStart+offset:token.sourceStart,sourceEnd:literal?token.sourceStart+offset+text.length:token.sourceEnd,literal});offset+=text.length+1;if(i<pieces.length-1)rows.push([]);});}return rows;
  },[displayTokens,mode]);
  useEffect(()=>{if(mode==='ai'||!chapter||chapter.id!==chapterId||!paragraphs.length)return;let alive=true;let ready=false;let timeout:ReturnType<typeof setTimeout>;let observer:IntersectionObserver|undefined;
    const alreadyRestored=positionChapter.current===chapter.id&&positionRevision.current===chapter.revision;
    void (alreadyRestored?Promise.resolve(undefined):db.progress.get(bookId)).then(p=>{if(!alive)return;if(alreadyRestored)ready=true;else{const target=p?.chapterId===chapter.id?Math.min(p.paragraph,paragraphs.length-1):0;position.current={paragraph:target,offset:0};timeout=setTimeout(()=>{if(!alive)return;article.current?.querySelector(`[data-paragraph="${target}"]`)?.scrollIntoView({block:'start'});explicitStartPending.current=false;positionChapter.current=chapter.id;positionRevision.current=chapter.revision;ready=true;},80);}
      observer=new IntersectionObserver(entries=>{if(!ready)return;const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0]){position.current.paragraph=Number((visible[0].target as HTMLElement).dataset.paragraph);clearTimeout(progressTimer.current);progressTimer.current=setTimeout(save,600);}}, {rootMargin:'-15% 0px -60% 0px'});
      article.current?.querySelectorAll('[data-paragraph]').forEach(p=>observer!.observe(p));
    }).catch(e=>{if(alive)notify(errorText(e));});const visibility=()=>{if(ready)save();};document.addEventListener('visibilitychange',visibility);return()=>{alive=false;clearTimeout(timeout);clearTimeout(progressTimer.current);observer?.disconnect();document.removeEventListener('visibilitychange',visibility);if(ready)save();};
  },[chapterId,chapter?.id,chapter?.revision,paragraphs.length,mode]);
  const currentIndex=list?.findIndex(c=>c.id===chapterId)??0;
  const nextAiStatus=(mode==='ai'&&preloadAi||backgroundAi)&&list?.[currentIndex+1]&&nextAiState.key===aiKey?nextAiState.status:'idle';
  const nextAiDescription=mode!=='ai'&&!backgroundAi?'Chưa tải trước chương sau':!preloadAi&&!backgroundAi?'Đã tắt tải trước chương sau':!list?.[currentIndex+1]?'Không còn chương sau':({idle:'Chương sau: chờ chuẩn bị',loading:'Chương sau: đang chuẩn bị AI',ready:'Chương sau: bản AI đã sẵn sàng',error:'Chương sau: tải trước gặp lỗi'})[nextAiStatus];
  const aiCurrentStatus=aiLoadError||(!aiOnline&&!aiError?'Chờ kết nối mạng. Phần đã dịch được giữ.':'')||(aiError?aiError+(aiRetryAt&&!aiRetryIsPrewarm.current?` Tự thử lại sau ${Math.max(1,aiRetryIn||Math.ceil((aiRetryAt-Date.now())/1000))} giây.`:''):(aiActiveModel?`Đang dịch bằng ${aiActiveModel}…`:'Đang dịch AI…')+(aiElapsed>=10?` Đã chờ ${aiElapsed} giây.`:''));
  const retryAi=(next=false,value?:ReadingAiSettings)=>{
    aiAutomaticRetry.current=false;setAiRetryAt(0);setAiRetryIn(0);
    if(value){if(next&&mode==='ai')setSavedPromptSession({chapterId,retry:aiRetry,settings:requestAiSettings});else setSavedPromptSession(undefined);setAiSettings(value);}
    if(aiLoadError)setAiHydrateRetry(n=>n+1);else if(next)setAiPrewarmRetry(n=>n+1);else setAiRetry(n=>n+1);
  };
  const panelNext=backgroundAi||mode==='ai'&&aiReady;
  const panelProgress=panelNext?aiNextProgress:aiPreview;
  const panelError=aiLoadError||(panelNext?preloadError:aiError);
  const panelAction=aiFailureAction(panelNext?aiPreloadCode:aiFailureCode);
  const panelRunning=panelNext?nextAiStatus==='loading':mode==='ai'&&!aiReady&&!aiError&&!aiLoadError;
  const stopAi=()=>{setPendingAiListen('');setAiRetryAt(0);setAiRetryIn(0);if(chapter?.epub)epubSession.current?.cancel(aiKey);else aiSession.current?.cancel(aiKey);setAiError('Đã dừng dịch. Các phần đã hoàn thành sẽ được dùng khi thử lại.');};
  function stopReading(clear=true){setPendingAiListen('');continueRef.current=false;partialListen.current=false;partialEnded.current=false;startedPartial.current=false;lastSpokenEnd.current=0;setPartialWait(false);if(clear){activeCursor.current=undefined;restoredCursor.current=undefined;lastCheckpoint.current='';clearTtsCursor(bookId);}else checkpointRef.current();playerRef.current?.stop(!clear);}
  function handleListen(){closeSelection();if(pendingAiListen){stopReading();return;}if(mode!=='ai'){selectReaderMode('ai');setPendingAiListen(chapterId);return;}if(!aiReady&&!canStartPartialListen({text:speechText})){setPendingAiListen(chapterId);return;}if(speech==='loading'||speech==='playing')playerRef.current?.pause();else if(speech==='paused'||speech==='error')playerRef.current?.resume();else play();}
  useEffect(()=>{if(continueRef.current&&!autoNext){continueRef.current=false;setPendingAiListen('');playerRef.current?.prepareNext();return;}const readyToPlay=aiReady?ttsIdentity?.key===identityKey:canStartPartialListen({text:speechText});if(pendingAiListen===chapterId&&mode==='ai'&&readyToPlay){const automatic=continueRef.current;continueRef.current=false;setPendingAiListen('');play(!automatic);}},[pendingAiListen,chapterId,mode,aiReady,ttsIdentity,identityKey,autoNext,speechText]);
  function selectReaderMode(next:typeof mode){setConvertAiNext(undefined);if(next==='convert')void installDefaultDictionaries().catch(e=>setConversionError(errorText(e)));modeTouched.current=true;if(next!==mode){save();positionChapter.current=undefined;positionRevision.current=undefined;setSavedPromptSession(undefined);}closeSelection();stopReading();setTool(old=>old==='ai'?'':old);setMode(next);}
  function clickAiMode(){if(mode!=='convert'){selectReaderMode('ai');return;}const nextId=list?.[currentIndex+1]?.id;if(!currentAiSource)return;if(!nextId){notify('Không còn chương sau để dịch sẵn AI.');return;}if(backgroundAi&&nextAiState.key===aiKey&&nextAiState.status==='loading')return;modeTouched.current=true;aiAutomaticRetry.current=false;setAiRetryAt(0);setAiRetryIn(0);setConvertAiNext({bookId,chapterId,nextId});setAiPrewarmRetry(n=>n+1);notify('Giữ bản Convert. Đang chuẩn bị AI cho chương sau.');}
  function toggleAi(){closeSelection();toggleTool('ai');}
  function changeChapter(id:string,keepPlaying=false){save();if(backgroundAi&&convertAiNext?.nextId===id)setMode('ai');setConvertAiNext(undefined);stopReading(!keepPlaying);activeCursor.current=undefined;continueRef.current=keepPlaying;if(keepPlaying)setPendingAiListen(id);setTtsTextOverride('');setSavedPromptSession(undefined);closeSelection();setChapterId(id);setToc(false);}
  useEffect(()=>{if(chapterId)onChapterChange?.(chapterId);},[chapterId,onChapterChange]);
  useEffect(()=>{const keys=(event:KeyboardEvent)=>{const target=event.target as HTMLElement;if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat||target.closest('input,textarea,select,[contenteditable="true"]')||tool||namePanel||toc||selected||edit!==null||ttsEditor)return;const index=list?.findIndex(c=>c.id===chapterId)??-1;const next=event.key==='ArrowRight'?list?.[index+1]:event.key==='ArrowLeft'?list?.[index-1]:undefined;if(next){event.preventDefault();changeChapter(next.id);}};document.addEventListener('keydown',keys);return()=>document.removeEventListener('keydown',keys);},[list,chapterId,tool,namePanel,toc,selected,edit,ttsEditor,save,backgroundAi,convertAiNext]);
  function openNames(){setTool('');if(!nameDirty.current)setNameDraft((names||[]).map(n=>`${n.key}=${n.value}`).join('\n'));setNamePanel(true);}
  function toggleTool(next:typeof tool){setNamePanel(false);setTool(old=>old===next?'':next);}
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!tool&&!namePanel&&!toc&&!selected&&edit===null&&!ttsEditor)setFocusMode(false);};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[tool,namePanel,toc,selected,edit,ttsEditor]);
  async function applyNames(text:string){
    if(nameSaving)throw new Error('Name đang được lưu.');setNameSaving(true);const draftRevision=nameDraftRevision.current;
    try{const count=await saveBookNames(bookId,text);if(readerAlive.current){if(text===nameDraft&&draftRevision===nameDraftRevision.current)nameDirty.current=false;stopReading();notify(`Đã cập nhật ${count} dòng Name cho truyện này.`);}}
    finally{if(readerAlive.current)setNameSaving(false);}
  }
  const updateNameDraft:import('react').Dispatch<import('react').SetStateAction<string>>=update=>{nameDirty.current=true;nameDraftRevision.current++;setNameDraft(update);};
  async function deleteName(entry:import('../../../core/domain').NameEntry){
    if(entry.bookId!==bookId)throw new Error('Name không thuộc truyện này.');
    await db.transaction('rw',[db.books,db.names,db.settings],async()=>{
      if((await db.books.get(bookId))?.status!=='ready')throw new Error('Truyện không còn trong thư viện.');
      const current=await db.names.get(entry.id);if(current&&current.bookId!==bookId)throw new Error('Name đã thay đổi.');
      if(current)await db.names.delete(entry.id);await db.settings.put({key:nameTombKey(bookId,entry.key),value:{kind:'name',bookId,key:entry.key,value:null}});
    });
    if(readerAlive.current)updateNameDraft(old=>old.split('\n').filter(line=>parseEntry(line)?.[0]!==entry.key).join('\n'));
  }
  function openTtsEditor(){setTool('');setTtsDraft(sentences(speechText,true).map(item=>item.text));setTtsEditor(true);}
  function saveTtsDraft(){const text=ttsDraft.map(item=>item.trim()).filter(Boolean).join('\n');setTtsTextOverride(text);setTtsEditor(false);stopReading();notify('Đã áp dụng văn bản nghe cho phiên này.');}
  function startTtsFrom(offset:number){
    if(mode!=='ai'||!speechText.trim())return;
    const option=tiktokVoices.find(v=>v.available&&v.id===settings.voiceId)||tiktokVoices[0];
    if(!option?.available||option.provider!=='tiktok'){notify('Gateway của giọng này chưa được cấu hình; hiện TikTok TTS là giọng được hỗ trợ.');return;}
    partialListen.current=true;partialEnded.current=false;startedPartial.current=true;setPartialWait(false);lastSpokenEnd.current=offset;
    playerRef.current!.start(speechText,option as TikTokVoice,{rate:settings.ttsRate,pitch:settings.ttsPitch,flex:1},{offset,audioTime:0,grouping:'sentence'});
  }
  function play(resume=true){
    if(mode!=='ai'||!speechText.trim())return;
    const identity=ttsIdentity?.key===identityKey?ttsIdentity.value:undefined;
    const needsIdentity=mode!=='ai'||aiReady;
    if(needsIdentity&&!identity)return;
    const option=tiktokVoices.find(v=>v.available&&v.id===settings.voiceId)||tiktokVoices[0];
    if(!option?.available||option.provider!=='tiktok'){notify('Gateway của giọng này chưa được cấu hình; hiện TikTok TTS là giọng được hỗ trợ.');return;}
    partialListen.current=true;partialEnded.current=false;startedPartial.current=!aiReady;setPartialWait(false);
    const saved=resume&&identity&&matchingTtsCursor(restoredCursor.current,identity)?restoredCursor.current:undefined;
    lastSpokenEnd.current=saved?.offset??0;
    if(!identity){playerRef.current!.start(speechText,option as TikTokVoice,{rate:settings.ttsRate,pitch:settings.ttsPitch,flex:1},saved?{...saved,grouping:saved.grouping??'natural'}:undefined);return;}
    const cursor:TtsCursor={version:1,...identity,voiceId:option.id,rate:settings.ttsRate,offset:saved?.offset??0,audioTime:saved?.audioTime??0,grouping:saved?saved.grouping??(settings.ttsFlex>0?'natural':'sentence'):'natural',updatedAt:Date.now()};activeCursor.current=cursor;lastCheckpoint.current=`${cursor.offset}:${cursor.audioTime}`;playerRef.current!.start(speechText,option as TikTokVoice,{rate:settings.ttsRate,pitch:settings.ttsPitch,flex:1},saved?{...saved,grouping:cursor.grouping}:undefined);
  }
  endedRef.current=()=>{
    const available=mode!=='ai'?speechText:(ttsTextOverride?speechText:((aiReady?aiText?.text??'':aiPreview?.text??'')||speechText));
    const action=aiSpeechEndAction({aiReady:mode!=='ai'?true:aiReady,availableLength:available.length,spokenEnd:lastSpokenEnd.current,autoNext,hasNext:!!list?.[currentIndex+1]});
    if(action.action==='advance'){changeChapter(list![currentIndex+1].id,true);return;}
    if(action.action==='continue'){
      if(startedPartial.current){setTimeout(()=>startTtsFrom(action.from),0);return;}
      // A full-chapter playback already covered its own list; preserve the old end behaviour.
      if(autoNext&&list?.[currentIndex+1])changeChapter(list[currentIndex+1].id,true);
      return;
    }
    partialEnded.current=true;if(partialListen.current&&!aiReady)setPartialWait(true);
  };
  useEffect(()=>{
    if(!partialEnded.current||mode!=='ai'||!partialListen.current)return;
    const available=ttsTextOverride?speechText:((aiReady?aiText?.text??'':aiPreview?.text??'')||'');
    if(available.length>lastSpokenEnd.current+1){partialEnded.current=false;setTimeout(()=>startTtsFrom(lastSpokenEnd.current),0);}
  },[speechText,aiReady,mode]);
  useEffect(()=>{playerRef.current?.setMediaTitle(chapter?.displayTitle||chapter?.title||'',book?.displayTitle||book?.title||'');},[speech,chapter?.title,chapter?.displayTitle,book?.title,book?.displayTitle]);
  useEffect(()=>{
    let alive=true;const player=playerRef.current!;if(continueRef.current)return;player.prepareNext();
    if(mode!=='ai'||!autoNext||nextAiState.key!==aiKey||nextAiState.status!=='ready')return;
    const nextId=list?.[currentIndex+1]?.id;if(!nextId)return;
    void activeChapter(bookId,nextId).then(next=>{if(!alive||!next||next.bookId!==bookId)return;const source={bookId,id:next.id,revision:next.revision,text:next.text},key=aiReadingKey(source,nextRequestAiSettings,aiNames);const cached=next.epub?epubSession.current!.get(key):aiSession.current!.get(key);if(cached)player.prepareNext('nodes' in cached?(cached.nodes as string[]).join('\n'):cached.result);}).catch(()=>{});
    return()=>{alive=false;};
  },[mode,autoNext,aiKey,nextAiState,chapterId,list,nextRequestAiSettings,speech==='playing'||speech==='loading'||speech==='paused']);
  useEffect(()=>{setTtsTextOverride('');},[chapter?.id,mode]);
  useEffect(()=>{if(continueRef.current&&autoNext&&chapter?.id===chapterId&&!waitingForConvert&&speechText&&ttsIdentity?.key===identityKey){continueRef.current=false;play(false);}},[chapterId,chapter?.id,speechText,waitingForConvert,autoNext,ttsIdentity,identityKey]);
  function closeSelection(){lookupReqId.current++;selection.current=undefined;setSelected(undefined);setMeaning({meanings:[],hanviet:''});setLookupLoading(false);setWordModal('');setWordBusy(false);setWordError('');}
  async function lookupSelection(source:string,context=selection.current){
    const req=++lookupReqId.current;setSelectionTranslation('');setMeaning({meanings:[],hanviet:''});setLookupLoading(true);setWordError('');
    try{const result=await lookup(source);const converted=await convert(source,names||[],{standardizePunctuation:true,capitalize:false});if(readerAlive.current&&req===lookupReqId.current&&selection.current===context){setMeaning(result);setSelectionTranslation(converted.map(token=>token.targetText).join('').trim());}}
    catch(e){if(readerAlive.current&&req===lookupReqId.current&&selection.current===context)setWordError(errorText(e));}
    finally{if(readerAlive.current&&req===lookupReqId.current&&selection.current===context)setLookupLoading(false);}
  }
  function selectToken(token:Token,element?:HTMLElement){
    if(!chapter||waitingForConvert)return;
    const context={chapterId:chapter.id,revision:chapter.revision,token};selection.current=context;
    if(element){const rect=element.getBoundingClientRect();setPopupAnchor({left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom});}
    setSelected(token);setNameKey(token.source);setNameValue('');setWordModal('');setWordError('');void lookupSelection(token.source,context);
  }
  function expandSelection(direction:'left'|'right'){
    if(!chapter||!selected||wordBusy||waitingForConvert)return;
    try{const next=expandReaderSelection(chapter.text,tokens,selected.sourceStart,selected.sourceEnd,direction);selectToken({...selected,...next});}
    catch(e){setWordError(errorText(e));}
  }
  async function applyWord(value:string,persistent:boolean,scope:'book'|'global'='book'){
    const context=selection.current,active=currentChapter.current,key=nameKey.trim(),replacement=value.trim();
    if(wordBusy||waitingForConvert||!context||!active||active.id!==context.chapterId||active.revision!==context.revision)return;
    if(!key||!replacement||/[\r\n=]/.test(key)||/[\r\n]/.test(replacement)||key.length>256||replacement.length>2048){setWordError('Chữ Trung và nghĩa cần nằm trên một dòng, tối đa 256 / 2.048 ký tự.');return;}
    setWordBusy(true);setWordError('');
    try{
      if(persistent){
        await saveReaderName(bookId,context.chapterId,context.revision,key,replacement,scope);
        setTempWordEdits(items=>items.filter(edit=>edit.chapterId!==context.chapterId||edit.revision!==context.revision||edit.sourceEnd<=context.token.sourceStart||edit.sourceStart>=context.token.sourceEnd));
      }
      else{
        const edit={chapterId:context.chapterId,revision:context.revision,sourceStart:context.token.sourceStart,sourceEnd:context.token.sourceEnd,value:replacement};
        const otherContexts=tempWordEdits.filter(e=>e.chapterId!==edit.chapterId||e.revision!==edit.revision);
        const sameContext=tempWordEdits.filter(e=>e.chapterId===edit.chapterId&&e.revision===edit.revision&&(e.sourceEnd<=edit.sourceStart||e.sourceStart>=edit.sourceEnd));
        const compatible=applyCompatibleReaderWordEdits(active.text,tokens,sameContext);
        applyReaderWordEdits(active.text,compatible.tokens,[edit]);
        setTempWordEdits([...otherContexts,...compatible.accepted.map(item=>({...item,chapterId:edit.chapterId,revision:edit.revision})),edit]);
      }
      if(readerAlive.current&&selection.current===context){closeSelection();notify(persistent?(scope==='global'?'Đã lưu Name chung.':'Đã lưu Name cố định cho truyện này.'):'Đã áp dụng tạm cho cụm đang chọn.');}
    }catch(e){if(readerAlive.current&&selection.current===context)setWordError(errorText(e));}
    finally{if(readerAlive.current&&selection.current===context)setWordBusy(false);}
  }
  function externalWordTool(kind:'translate'|'search'){
    if(!nameKey.trim())return;
    const url=kind==='translate'?googleTranslationUrl(nameKey):googleMeaningUrl(nameKey);
    window.open(url,'_blank','noopener,noreferrer');
  }
  async function removeSelectedName(){const context=selection.current,active=currentChapter.current;if(wordBusy||!context||!active||active.id!==context.chapterId||active.revision!==context.revision)return;setWordBusy(true);setWordError('');try{await deleteReaderName(bookId,context.chapterId,context.revision,nameKey.trim());if(readerAlive.current&&selection.current===context){closeSelection();notify('Đã xóa Name riêng của truyện.');}}catch(error){if(readerAlive.current&&selection.current===context)setWordError(errorText(error));}finally{if(readerAlive.current&&selection.current===context)setWordBusy(false);}}
  const wordExpansion=useMemo(()=>{if(!chapter||!selected)return {left:false,right:false};const result={left:false,right:false};for(const direction of ['left','right'] as const){try{const next=expandReaderSelection(chapter.text,tokens,selected.sourceStart,selected.sourceEnd,direction);result[direction]=(next.sourceStart!==selected.sourceStart||next.sourceEnd!==selected.sourceEnd)&&next.source.length<=256;}catch{}}return result;},[chapter?.text,tokens,selected]);
  function openWordModal(kind:'add'|'meaning'){setNameValue(kind==='meaning'?(meaning.meanings[0]||selected?.targetText.trim()||''):(meaning.hanviet||selected?.targetText.trim()||''));setWordModal(kind);}
  const editBefore=useRef<Chapter|undefined>(undefined);
  async function saveEdit(splitAt?:number){if(!editBefore.current||edit===null)return;try{await saveSharedChapter(editBefore.current,edit,splitAt);setEdit(null);stopReading();}catch(error){notify(errorText(error));}}
  const filtered=list?.filter(c=>c.title.toLocaleLowerCase().includes(tocFilter.toLocaleLowerCase())||(c.displayTitle&&c.displayTitle.toLocaleLowerCase().includes(tocFilter.toLocaleLowerCase())))||[];
  return <div className={`reader theme-${settings.theme} ${focusMode?'reader-focus':''}`} style={{'--tts-highlight':settings.highlightColor,...(settings.background?{'--paper':settings.background}:{}),...(settings.textColor?{'--ink':settings.textColor}:{})} as CSSProperties}>
    <header className="reader-header"><button onClick={()=>{save();onBack();}}>{backLabel}</button><span>Thư phòng / Đọc truyện</span></header>
    <div className="reader-book-heading"><h1><ConvertedTitle text={book?.title||''} bookId={bookId} displayTitle={book?.displayTitle}/></h1><button className="chapter-title-menu" aria-label="Mở thông tin và mục lục truyện" onClick={()=>{save();onBookInfo();}}><ConvertedTitle text={chapter?.title||'Đang mở…'} bookId={bookId} displayTitle={chapter?.displayTitle}/></button></div>
    <nav className="chapter-navigation chapter-navigation-top" aria-label="Điều hướng chương đầu trang"><button disabled={currentIndex<=0} onClick={()=>changeChapter(list![currentIndex-1].id)}>← Chương trước</button><button onClick={()=>{setTool('');setNamePanel(false);setToc(true);}}>☷ Mục lục</button><button disabled={!list?.[currentIndex+1]} onClick={()=>changeChapter(list![currentIndex+1].id)}>Chương sau →</button></nav>
    <div className="reader-actions">
      <div className="segmented reader-modes" role="group" aria-label="Bản đọc và dịch">
        <button aria-pressed={mode==='convert'&&tool!=='ai'} onClick={()=>selectReaderMode('convert')}>Convert</button>
        <button aria-pressed={mode==='raw'&&tool!=='ai'} onClick={()=>selectReaderMode('raw')}>Bản gốc</button>
        <button aria-pressed={mode==='ai'} title={mode==='convert'?'Giữ Convert và dịch sẵn AI chương sau':undefined} onClick={clickAiMode}>Dịch AI</button>
      </div><details className="reader-more"><summary>Công cụ ▾</summary><div><button onClick={()=>{closeSelection();setTool('');setNamePanel(false);editBefore.current=chapter?{...chapter}:undefined;setEdit(chapter?.text||'');}}>Sửa chương</button><button onClick={()=>{if(chapter)download(new Blob([chapter.text],{type:'text/plain;charset=utf-8'}),`${chapter.title.replace(/[<>:"/\\|?*]/g,'_')}.txt`);}}>Xuất TXT</button><button onClick={()=>toggleTool('help')}>Hướng dẫn thao tác</button></div></details>
    </div>
    {mode==='ai'&&!aiReady&&aiPreview&&(aiPreview.total>1||aiPreview.half)&&<section className="ai-part-progress" aria-label="Tiến độ dịch chương"><div><strong>{aiPreview.half?`Nửa ${aiPreview.half}/2 · `:''}{aiParallelText.running}</strong><small>Đã xong {aiPreview.done}/{aiPreview.total} phần</small><span>{aiError?'Giữ phần hoàn tất trong phiên; tải lại sẽ dùng những phần đã lưu thành công.':aiPreview.waitUntil&&aiPreview.waitUntil>Date.now()?`API đang bận · Chờ ${Math.max(1,Math.ceil((aiPreview.waitUntil-Date.now())/1000))} giây`:'Đang hoàn thiện bản dịch…'}</span>{!aiError&&aiParallelText.keys&&<small>{aiParallelText.keys}</small>}{!aiError&&!!aiPreview.retrying?.length&&<small>Đang phục hồi phần {aiPreview.retrying.join(', ')} · Giữ các phần đã dịch.</small>}{partialWait&&<small>Đã đọc hết phần đã dịch — sẽ tự đọc tiếp khi có phần mới.</small>}{aiPreview.text&&<small>Bạn đang đọc phần đã dịch. Chương sẽ hoàn tất khi đủ mọi phần.</small>}</div><progress aria-label="Số phần đã dịch" max={aiPreview.total} value={aiPreview.done}/>{!aiError&&<button onClick={stopAi}>Dừng dịch</button>}</section>}
    {waitingForConvert&&<div className="reader-convert-status" role="status">{mode==='ai'?aiCurrentStatus:conversionError?'Chưa cập nhật: '+conversionError:renderedText?'Đang cập nhật bản Convert…':'Đang chuẩn bị bản Convert…'}{mode==='ai'&&(aiLoadError||aiError)?<button onClick={()=>{if(aiFailureAction(aiFailureCode)==='settings'){setTool('ai');return;}retryAi();}}>{aiFailureAction(aiFailureCode)==='settings'?'Sửa cấu hình AI':aiPreview?.done||aiPreview?.half===2?'Tiếp tục phần còn thiếu':'Thử lại AI'}</button>:conversionError&&<button onClick={()=>setConversionRun(n=>n+1)}>Thử lại Convert</button>}</div>}
    {mode==='ai'&&aiError&&alternativeAiModel&&chapter&&<details className="ai-retry-options"><summary>Tùy chọn khác</summary><p>Dịch lại toàn chương sẽ dùng thêm lượt dịch.</p><button title="Dịch lại toàn chương bằng model dự phòng; dùng thêm lượt dịch." onClick={()=>{aiAutomaticRetry.current=false;setAiRetryAt(0);setAiRetryIn(0);setFallbackAttempt({bookId,chapterId,revision:chapter.revision,settings:JSON.stringify(savedRequestSettings),model:alternativeAiModel});}}>Dịch lại bằng {AI_MODELS.find(m=>m.id===alternativeAiModel)?.label??alternativeAiModel}</button></details>}
    {aiModelNotice?.key===aiKey&&(mode==='ai'||backgroundAi)&&<div className="reader-convert-status ai-model-notice" role="status">{aiModelNotice.text}</div>}
    {backgroundAi&&!waitingForConvert&&nextAiStatus!=='ready'&&<div className="reader-convert-status" role="status">{aiLoadError||preloadError||nextAiDescription}{aiRetryAt?` · Tự thử lại sau ${aiRetryIn} giây`:''}{aiLoadError||preloadError?<button onClick={()=>{aiAutomaticRetry.current=false;setAiRetryAt(0);setAiRetryIn(0);if(aiLoadError)setAiHydrateRetry(n=>n+1);else setAiPrewarmRetry(n=>n+1);}}>Thử lại chương sau</button>:nextAiStatus==='loading'&&<button onClick={()=>{setConvertAiNext(undefined);setAiRetryAt(0);setAiRetryIn(0);}}>Dừng dịch sẵn</button>}</div>}
    <article ref={article} className="prose" style={{maxWidth:settings.width,fontSize:settings.fontSize,lineHeight:settings.lineHeight,fontFamily:readerFonts[settings.font]||readerFonts.arial,textAlign:settings.align||'left',textShadow:settings.textShadow?'0 0 1px currentColor':'none'}}>
      <div className="chapter-kicker">CHƯƠNG / PHẦN {Math.max(0,currentIndex)+1} TRÊN {list?.length||0}</div>
      {chapter?.epub&&epubNodes?<EpubFrame bookId={bookId} layout={chapter.epub} nodes={epubNodes} nameImages={chapterImages} sentence={!ttsTextOverride?sentence:undefined} highlightColor={settings.highlightColor} words={mode==='convert'?convertedEpubWords(chapter.epub,displayTokens,dictionaryRevision==='[]'):undefined} onNavigate={(key,shift)=>{if(tool||namePanel||toc||selected||edit!==null||ttsEditor)return;manualScrollUntil.current=Date.now()+3000;const amount=Math.max(80,window.innerHeight*.85);if(key==='Home'||key==='End')window.scrollTo({top:key==='Home'?0:document.documentElement.scrollHeight,behavior:'smooth'});else window.scrollBy({top:(key==='PageUp'||key===' '&&shift?-1:1)*amount,behavior:'smooth'});}} appearance={{paper:settings.background||({light:'#ffffff',sepia:'#eae4d3',dark:'#161b19',gray:'#2b3030'}[settings.theme]),ink:settings.textColor||({light:'#26332c',sepia:'#26332c',dark:'#cbd1c8',gray:'#dde0d8'}[settings.theme]),font:settings.font,fontSize:settings.fontSize,lineHeight:settings.lineHeight,align:settings.align||'left',textShadow:!!settings.textShadow}} onWordSelect={(start,end,anchor)=>{if(mode!=='convert'||waitingForConvert)return;const token=displayTokens.find(token=>token.sourceStart===start&&token.sourceEnd===end);if(token){setTool('');setNamePanel(false);selectToken(token);setPopupAnchor(anchor);}}}/>:!renderedText&&waitingForConvert?<p className="notice">{mode==='ai'?aiCurrentStatus:conversionError?'Không cập nhật được bản Convert.':'Đang Convert trong Worker…'}</p>:paragraphs.map((p,i)=><p key={`${chapterId}-${mode}-${i}`} style={{background:'transparent'}} data-paragraph={i} data-empty={!p.text.trim()} className={!ttsTextOverride&&sentence&&sentence.start<p.start+p.text.length&&sentence.end>p.start?'speaking':''}>{mode==='convert'?(blocks[i]||[]).map((x,j)=><button type="button" key={`${x.token.sourceStart}-${x.token.sourceEnd}-${j}`} className="word-token" aria-disabled={waitingForConvert} data-source-start={x.sourceStart} data-source-end={x.sourceEnd} data-source-literal={x.literal} onClick={e=>{if(waitingForConvert)return;setTool('');setNamePanel(false);selectToken(x.token,e.currentTarget);}}><NameImageText text={x.text} matches={x.token.nameImage?findNameImages(x.text,[x.token.nameImage],1):[]}/></button>):<NameImageText text={p.text} matches={mode==='ai'?imageMatches:[]} offset={p.start} highlight={!ttsTextOverride?sentence:undefined} color={settings.highlightColor}/>}{!p.text.trim()&&'\u00a0'}</p>)}
      <nav className="chapter-navigation" aria-label="Điều hướng chương cuối trang"><button disabled={currentIndex<=0} onClick={()=>changeChapter(list![currentIndex-1].id)}>← Chương trước</button><button onClick={()=>{setTool('');setNamePanel(false);setToc(true);}}>☷ Mục lục</button><button disabled={!list?.[currentIndex+1]} onClick={()=>changeChapter(list![currentIndex+1].id)}>Chương sau →</button></nav>
    </article>
    {tool==='speech'&&<ReaderPanel title="Nghe sách" kind="speech" onClose={()=>setTool('')}><p className="muted">Câu đang đọc được gửi đến gateway TikTok cộng đồng. Có hai giọng tiếng Việt; dịch vụ có thể gián đoạn.</p><div className="tts-bar"><button className="primary" disabled={!chapter||speech==='loading'||(mode==='ai'&&!speechText.trim())} onClick={()=>speech==='playing'?playerRef.current?.pause():speech==='paused'?playerRef.current?.resume():handleListen()}>{speech==='playing'?'Ⅱ Tạm dừng':speech==='paused'?'▶ Tiếp tục':speech==='loading'?'Đang tải TikTok…':'▶ Nghe TikTok'}</button><button aria-label="Dừng đọc" onClick={()=>stopReading()}>■</button><button onClick={openTtsEditor}>Câu ({sentences(speechText,true).length})</button><label>Giọng<select aria-label="Giọng đọc" value={tiktokVoices.some(v=>v.available&&v.id===settings.voiceId)?settings.voiceId:tiktokVoices[0].id} onChange={e=>{stopReading();setSettings(s=>({...s,voiceId:e.target.value}));}}>{tiktokVoices.filter(v=>v.available).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>Tốc độ<input aria-label="Tốc độ đọc" type="range" min="0.5" max="5" step="0.1" value={settings.ttsRate} onChange={e=>{stopReading();setSettings(s=>({...s,ttsRate:+e.target.value}));}}/></label><output>{settings.ttsRate}</output><label>Màu highlight<input aria-label="Màu làm nổi bật văn bản" type="color" value={settings.highlightColor} onChange={e=>setSettings(s=>({...s,highlightColor:e.target.value}))}/></label><button disabled={!settingsHydrated} onClick={()=>persistSettings(settings)}>Lưu cài đặt</button><label className="check"><input type="checkbox" checked={autoNext} onChange={e=>{changeReaderOptions({autoNext:e.target.checked});}}/>Qua chương</label><small>TikTok TTS · tiếng Việt. Audio giữ phiên được tạo trên máy, không tải qua mạng.</small></div><p className="muted">Tốc độ được điều chỉnh trên thiết bị. Khi sửa câu đọc, highlight trên bản gốc tạm tắt để tránh tô sai đoạn.</p></ReaderPanel>}
    {toc&&<Modal title="Mục lục" onClose={()=>setToc(false)}><input aria-label="Tìm chương" placeholder="Tìm chương…" value={tocFilter} onChange={e=>{setTocFilter(e.target.value);setTocPage(0);}}/><div className="toc">{filtered.slice(tocPage*60,tocPage*60+60).map(c=><button className={c.id===chapterId?'current':''} key={c.id} onClick={()=>changeChapter(c.id)}><ConvertedTitle text={c.title} bookId={bookId} displayTitle={c.displayTitle}/></button>)}</div><div className="pager"><button disabled={!tocPage} onClick={()=>setTocPage(p=>p-1)}>Trước</button><span>{tocPage+1}</span><button disabled={(tocPage+1)*60>=filtered.length} onClick={()=>setTocPage(p=>p+1)}>Tiếp</button></div></Modal>}
    {edit!==null&&<Modal title="Sửa nội dung chương" onClose={()=>setEdit(null)} wide><p className="muted">Sửa bản lưu trong ứng dụng. File nguồn giữ nguyên. EPUB giữ các đoạn và mục lục gốc; TXT có thể đặt con trỏ để tách chương.</p><textarea ref={editRef} aria-label="Nội dung chương" rows={18} value={edit} onChange={e=>setEdit(e.target.value)}/><footer><button disabled={!!chapter?.epub} onClick={()=>void saveEdit(editRef.current?.selectionStart)}>Tách tại con trỏ</button><button className="primary" onClick={()=>void saveEdit()}>Lưu thay đổi</button></footer></Modal>}
    {selected&&!wordModal&&<WordPopup source={nameKey} hanviet={meaning.hanviet} meanings={meaning.meanings} translated={selectionTranslation} custom={nameValue} loading={lookupLoading} busy={wordBusy} error={wordError} anchor={popupAnchor} canExpandLeft={wordExpansion.left} canExpandRight={wordExpansion.right} onSourceChange={value=>{setNameKey(value);void lookupSelection(value);}} onCustomChange={setNameValue} onExpand={expandSelection} onApply={(value,persistent)=>void applyWord(value,persistent)} onClose={closeSelection} onManage={()=>{closeSelection();openNames();}} onRun={()=>{closeSelection();setTempWordEdits([]);modeTouched.current=true;setMode('convert');setConversionRun(n=>n+1);}} onAddName={()=>openWordModal('add')} onEditMeaning={()=>openWordModal('meaning')} onCopy={()=>{void navigator.clipboard.writeText(nameKey).then(()=>notify('Đã sao chép chữ Trung.')).catch(e=>notify(errorText(e)));}} onTranslate={()=>externalWordTool('translate')} onSearch={()=>externalWordTool('search')}/>}
    {selected&&wordModal==='add'&&<NameEditDialog source={nameKey} hanviet={meaning.hanviet} english={meaning.english||[]} meanings={meaning.meanings} stored={[...new Set([...(names||[]).filter(row=>row.key===nameKey.trim()).map(row=>row.value),...(aiGlobalNames||[]).filter(row=>row.key===nameKey.trim()).map(row=>row.value),...(meaning.names||[])])]} loading={lookupLoading} busy={wordBusy} error={wordError} canDelete={(names||[]).some(row=>row.key===nameKey.trim())} onSourceChange={value=>{setNameKey(value);void lookupSelection(value);}} onApply={(value,scope)=>void applyWord(value,true,scope)} onDelete={()=>void removeSelectedName()} onClose={closeSelection}/> }
    {selected&&wordModal==='meaning'&&<Modal title="Sửa nghĩa Vietphrase" onClose={()=>{if(!wordBusy)closeSelection();}}><label>Chữ Trung<input aria-label="Chữ Trung để lưu" disabled={wordBusy} value={nameKey} onChange={e=>setNameKey(e.target.value)}/></label><label>Nghĩa / tên Việt<input aria-label="Tên Việt để lưu" disabled={wordBusy} value={nameValue} onChange={e=>setNameValue(e.target.value)}/></label><div className="choices">{meaning.meanings.map((value,i)=><button key={i} disabled={wordBusy} onClick={()=>setNameValue(value)}>{value}</button>)}</div><div className="choices">{nameCaseOptions.map(option=><button key={option.id} disabled={wordBusy} onClick={()=>setNameValue(value=>formatNameCase(value,option.id))}>{option.label}</button>)}</div><p className="muted">Lưu nghĩa tùy chỉnh trên thiết bị. File Vietphrase gốc giữ nguyên.</p>{wordError&&<p role="alert">{wordError}</p>}<footer><button disabled={wordBusy} onClick={()=>void applyWord(nameValue,false)}>Áp dụng tạm</button><button className="primary" disabled={wordBusy} onClick={()=>void applyWord(nameValue,true,'book')}>Lưu cho truyện</button><button disabled={wordBusy} onClick={()=>void applyWord(nameValue,true,'global')}>Lưu Name chung</button></footer></Modal>}
    {namePanel&&<ReaderPanel title="Name riêng của truyện" kind="names" onClose={()=>setNamePanel(false)}>
      <div className="ai-actions"><button aria-pressed={!showCommonNames} onClick={()=>setShowCommonNames(false)}>Name truyện → AI</button><button aria-pressed={showCommonNames} onClick={()=>setShowCommonNames(true)}>Names chung</button></div>
      {showCommonNames?<Suspense fallback={<p>Đang mở Names chung…</p>}><CommonNamesPanel/></Suspense>:<Suspense fallback={<p role="status">Đang mở bảng Name…</p>}><NameManager bookId={bookId} names={names||[]} draft={nameDraft} setDraft={updateNameDraft} onSave={applyNames} saving={nameSaving} onDelete={deleteName} notify={notify}/></Suspense>}
    </ReaderPanel>}
    {tool==='settings'&&<ReaderPanel title="Cài đặt hiển thị" onClose={()=>setTool('')}><DisplaySettings settings={settings} setSettings={setSettings} onNames={openNames} onSpeech={()=>setTool('speech')} onHelp={()=>setTool('help')}/></ReaderPanel>}
    {tool==='help'&&<ReaderPanel title="Hướng dẫn thao tác" kind="help" onClose={()=>setTool('')}><ReaderHelp/></ReaderPanel>}
    {preloadError&&mode==='ai'&&<p role="status" className="notice">Chưa tải trước: {preloadError}</p>}
    {tool==='ai'&&<AiPanel job={{target:panelNext?'Chương sau':'Chương đang đọc',status:!aiOnline&&panelRunning?'Chờ kết nối mạng':panelError?(aiRetryAt?'Chờ tự tiếp tục':'Đã tạm dừng'):panelRunning?'Đang dịch':panelNext?nextAiDescription:aiReady?'Đã hoàn tất':'Chọn Dịch AI để bắt đầu',model:panelNext?aiNextModel:aiActiveModel,progress:panelProgress,error:panelError,configuration:panelAction,history:panelNext?aiNextHistory:aiHistory,errorCode:panelNext?aiPreloadCode:aiFailureCode,requestId:panelNext?aiPreloadId:aiFailureId,retryIn:aiRetryAt&&aiRetryIsPrewarm.current===panelNext?Math.max(1,aiRetryIn):undefined}} onRetry={panelError&&panelAction!=='settings'?()=>retryAi(panelNext):undefined} onPauseRetry={aiRetryAt?()=>{setAiRetryAt(0);setAiRetryIn(0);}:undefined} current={{model:aiReady?aiText.modelsSummary:modelCache?.key===modelLookupKey&&modelCache.current?modelCache.current:mode==='ai'?(aiPreview?.halfModels?aiResultModelLabel({model:'hybrid',halves:{models:aiPreview.halfModels}}):aiActiveModel):undefined,status:aiReady?'ready':aiError?'error':mode==='ai'?'loading':'idle'}} next={{model:nextAiState.key===aiKey&&nextAiStatus!=='idle'?aiNextModel||modelCache?.key===modelLookupKey&&modelCache.next||undefined:modelCache?.key===modelLookupKey?modelCache.next:undefined,status:!list?.[currentIndex+1]?'unavailable':!preloadAi&&!backgroundAi?'off':nextAiStatus}} onOpenSettings={()=>{save();onAiSettings?.();}} preload={preloadAi} onPreloadChange={value=>changeReaderOptions({preloadAi:value})} bookId={bookId} onSettingsChange={(value,defer)=>{if(readerAlive.current){if(defer&&mode==='ai')setSavedPromptSession({chapterId,retry:aiRetry,settings:requestAiSettings});else{setSavedPromptSession(undefined);stopReading();}setAiSettings(value);}}} onClose={()=>setTool('')} notify={notify}/>}
    {ttsEditor&&<Modal title="Sửa câu đọc trong phiên" onClose={()=>setTtsEditor(false)} wide><p className="muted">Chỉ thay nội dung gửi đến TTS trong chương hiện tại. Bản truyện đã lưu không thay đổi.</p><div className="sentence-editor">{ttsDraft.map((text,i)=><label key={i}>Câu {i+1}<textarea rows={2} value={text} onChange={e=>setTtsDraft(old=>old.map((value,index)=>index===i?e.target.value:value))}/></label>)}</div><footer><button onClick={()=>{setTtsTextOverride('');setTtsEditor(false);stopReading();}}>Dùng bản truyện</button><button onClick={saveTtsDraft}>Áp dụng cho phiên</button></footer></Modal>}
    {speechNotice&&<div className="reader-convert-status" role="status">{speechNotice}</div>}
    <div className="floating-tools">{focusMode&&<><button aria-label="Chương trước nhanh" disabled={currentIndex<=0} onClick={()=>changeChapter(list![currentIndex-1].id)}>‹</button><button aria-label="Chương sau nhanh" disabled={!list?.[currentIndex+1]} onClick={()=>changeChapter(list![currentIndex+1].id)}>›</button></>}{(pendingAiListen||speech==='playing'||speech==='paused'||speech==='loading')&&<button aria-label="Dừng đọc nhanh" onClick={()=>stopReading()}>■</button>}<button className="ai-trigger" data-prewarm={nextAiStatus} aria-describedby="reader-prewarm-status" aria-label="Tùy chỉnh prompt và model" aria-expanded={tool==='ai'} title={`Tùy chỉnh prompt và model · ${nextAiDescription}`} onClick={toggleAi}>⚙ AI{nextAiStatus!=='idle'&&<span className="prewarm-badge" aria-hidden="true">{nextAiStatus==='ready'?'✓':nextAiStatus==='error'?'!':'…'}</span>}</button><span id="reader-prewarm-status" className="prewarm-description" role="status">{nextAiDescription}</span><button className="listen-trigger" aria-label="Nghe truyện nhanh" aria-pressed={!!pendingAiListen||speech==='playing'||speech==='paused'||speech==='loading'} data-state={pendingAiListen?'waiting':speech} title={pendingAiListen?'Dừng chờ bản AI':speech==='loading'?'Tạm dừng tải':speech==='playing'?'Tạm dừng nghe':speech==='paused'||cursorResumable?'Tiếp tục nghe':'Nghe sách'} data-resume={cursorResumable?'true':undefined} disabled={!chapter||!settingsHydrated} onClick={handleListen}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{pendingAiListen||speech==='loading'?<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>:speech==='playing'?<><path d="M8 5v14M16 5v14"/></>:speech==='paused'||cursorResumable?<path d="m8 5 11 7-11 7Z"/>:<><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="5" height="9" rx="2"/><rect x="16" y="12" width="5" height="9" rx="2"/></>}</svg></button><button className="settings-trigger" aria-label="Cài đặt đọc truyện" aria-expanded={tool==='settings'} aria-controls="reader-settings" onClick={()=>toggleTool('settings')}>⚙</button></div>
  </div>;
}
