import {adoptLegacyPolish,writePolishResult,writePolishTerms} from '../../ai/services/polish-result-store';
import {continueAiRun} from '../../ai/services/ai-auto-continue';
import {useEffect,useRef,useState} from 'react';
import {db} from '../../../core/db';
import {errorText} from '../../../shared/components/common';
import {AiReadingSession,aiReadingKey} from '../../ai/services/ai-reading';
import {convertPolishKey,convertPolishSettings,DEFAULT_POLISH_PROMPT,POLISH_PROMPT_KEY,POLISH_OPTIONS_KEY,polishedEpubNodes,progressivePolish,polishOriginalEnd,locatePolishFallback,polishPrompt,type PolishPair} from '../../ai/services/convert-polish';
import {aiModelLabel} from '../../ai/services/ai-hybrid-prompt';
import {AI_MODELS,DEFAULT_AI_MODEL,normalizeAiModel} from '../../ai/types/ai-models';
import {PolishPartsBar} from './PolishPartsBar';
import {PolishTerms} from './PolishTerms';
import {combinePolishTerms,type PolishTerm} from '../../ai/services/polish-output';
import type {AiPartsProgress} from '../../ai/services/ai-parts';
import './convert-polish.css';
import './name-discovery.css';
export interface ConvertPolishInput {bookId:string;chapterId:string;revision:number;text:string;original:string;pairs:PolishPair[];model:string;splitParts?:boolean;nodes?:string[]}
export default function ConvertPolishDialog({input,onClose,cancelRef}:{input:ConvertPolishInput;onClose:()=>void;cancelRef?:{current:(()=>void)|undefined}}){
 const runAbort=useRef<AbortController|undefined>(undefined);
 const loadAbort=useRef<AbortController|undefined>(undefined);
 const stoppedRun=useRef<AbortController|undefined>(undefined);
 const stoppedTermsWrite=useRef<AbortController|undefined>(undefined);
 const session=useRef<AiReadingSession|null>(null),alive=useRef(true),locked=useRef(false);
 useEffect(()=>{const cancel=()=>{loadAbort.current?.abort();stoppedRun.current=undefined;stoppedTermsWrite.current?.abort();runAbort.current?.abort();session.current?.clear();};if(cancelRef)cancelRef.current=cancel;return()=>{if(cancelRef?.current===cancel)cancelRef.current=undefined;};},[cancelRef]);
 const [progress,setProgress]=useState<AiPartsProgress>();
 const [runApplied,setRunApplied]=useState(false);
 const [savedTerms,setSavedTerms]=useState<PolishTerm[]>([]);
 const [savedSkipped,setSavedSkipped]=useState(0);
 const [model,setModel]=useState(normalizeAiModel(input.model)??DEFAULT_AI_MODEL);
 const [savingTerms,setSavingTerms]=useState(false);
 const [parallel]=useState(input.splitParts??true);
 const [prompt,setPrompt]=useState(DEFAULT_POLISH_PROMPT);
 const [key,setKey]=useState(''),[result,setResult]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const canResume=!!progress&&(progress.done<progress.total||!runApplied);
 useEffect(()=>{
  alive.current=true;
  let current=true;
  const loading=new AbortController();loadAbort.current=loading;
  void convertPolishKey(input.chapterId,input.revision,input.text,input.original).then(async key=>{
   let [saved,savedPrompt]=await Promise.all([db.settings.get(key),db.settings.get(POLISH_PROMPT_KEY)]);
   if(!saved&&current){
    const legacy=await convertPolishKey(input.chapterId,input.revision,input.text);
    await adoptLegacyPolish(key,legacy,input.text,input.pairs,loading.signal);
    saved=await db.settings.get(key);
   }
   if(!current||loading.signal.aborted)return;
   setKey(key);
   setPrompt(polishPrompt(savedPrompt?.value));
   const value=saved?.value as {applied?:boolean;text?:unknown;model?:unknown;models?:unknown;terms?:PolishTerm[];skipped?:unknown[]}|undefined;
   if(typeof value?.text==='string'){
    if(value.applied!==false)setResult(value.text);
    setSavedTerms(Array.isArray(value.terms)?value.terms.filter(term=>typeof term?.source==='string'&&typeof term?.convert==='string'&&typeof term?.meaning==='string'):[]);
    setSavedSkipped(Array.isArray(value.skipped)?value.skipped.length:0);
    const models=Array.isArray(value.models)?value.models.filter((entry):entry is string=>typeof entry==='string'):[];
    setStatus('Đã lưu · '+(models.length>1?models.map(aiModelLabel).join(' + '):aiModelLabel(typeof value.model==='string'?value.model:input.model)));
   }
  }).catch(e=>{if(current&&!loading.signal.aborted){setError(errorText(e));setStatus('Không mở được Trau chuốt');}});
  return()=>{current=false;loading.abort();alive.current=false;stoppedRun.current=undefined;stoppedTermsWrite.current?.abort();runAbort.current?.abort();session.current?.clear();};
 },[input]);
 async function run(){
  if(locked.current||savingTerms||!key||!prompt.trim())return;
  locked.current=true;setBusy(true);setError('');setStatus('Đang trau chuốt');
  const resume=canResume;
  const keepPrevious=!!result;
  if(!resume)setProgress(undefined);
  const controller=new AbortController();runAbort.current=controller;
  const runningSession=session.current??=new AiReadingSession();
  let taskKey:string|undefined;
  let runProgress:AiPartsProgress|undefined;
  const abort=()=>{if(taskKey)runningSession.cancel(taskKey);};
  controller.signal.addEventListener('abort',abort,{once:true});
 let writes=Promise.resolve(),lastEnd=0,lastPrefix='',lastFallbackSignature='',runPrompt=prompt,runParallel=parallel,knownTerms=savedTerms;
 const saveProgress=(state:AiPartsProgress,terms:PolishTerm[])=>{
    const end=state.completedSourceEnd??0,prefix=state.completedText??'';
    const fallbackSignature=!keepPrevious&&state.done>0&&prefix?JSON.stringify(state.polishFallback??[]):undefined;
    const changed=end>lastEnd||(end===lastEnd&&(prefix!==lastPrefix||fallbackSignature!==lastFallbackSignature));
    const text=fallbackSignature&&changed?progressivePolish(input.text,prefix,end):undefined;
    const hasNewTerms=terms.length>knownTerms.length;
    if(!text&&!hasNewTerms)return;
    if(text&&fallbackSignature){lastEnd=end;lastPrefix=prefix;lastFallbackSignature=fallbackSignature;}
    knownTerms=terms;
    writes=writes.then(async()=>{
      if(!alive.current||controller.signal.aborted)return;
      if(!text){await writePolishTerms(key,terms,model,controller.signal);return;}
      if(input.nodes){try{polishedEpubNodes(input.nodes,text);}catch{
        if(hasNewTerms)await writePolishTerms(key,terms,model,controller.signal);
        return;
      }}
      await writePolishResult(key,{version:4,applied:true,partial:true,sourceEnd:end,originalEnd:polishOriginalEnd(input.pairs,end),prefix,
        baseConvert:input.text,fallback:locatePolishFallback(input.pairs,state.polishFallback),text,model:state.polishModels?.at(-1)??model,
        ...(state.polishModels&&state.polishModels.length>1?{models:state.polishModels}:{}),prompt:runPrompt,terms,skipped:state.polishSkipped,updatedAt:Date.now()},controller.signal);
    });
    void writes.catch(()=>{});
  };
  try{
   const [savedPrompt,savedOptions]=await Promise.all([db.settings.get(POLISH_PROMPT_KEY),db.settings.get(POLISH_OPTIONS_KEY)]);
   runPrompt=polishPrompt(savedPrompt?.value);
   const options=savedOptions?.value as {splitParts?:unknown}|undefined;if(typeof options?.splitParts==='boolean')runParallel=options.splitParts;
   controller.signal.throwIfAborted();
   const source={bookId:input.bookId,id:'polish:'+input.chapterId,revision:input.revision,text:input.text,polishPairs:input.pairs,polishPreserveLines:!!input.nodes};
   const settings={...convertPolishSettings(model,runPrompt),splitParts:runParallel};
   if(!runningSession.preparePolishRun(source,settings,resume)){
     setProgress(undefined);
     setStatus('Cài đặt đã đổi · Bắt đầu lượt trau chuốt mới');
     return;
   }
   setRunApplied(false);
   const activeKey=taskKey=aiReadingKey(source,settings,[]);
   const publish=(p:AiPartsProgress)=>{
     if(!alive.current||controller.signal.aborted)return;
     runProgress=p;
     setProgress(p);
     setStatus('Đang trau chuốt');
     const terms=combinePolishTerms([knownTerms,p.polishTerms]);
     if(terms.length>knownTerms.length)setSavedTerms(terms);
     saveProgress(p,terms);
   };
   const response=await continueAiRun(options=>runningSession.request(source,settings,[],undefined,undefined,publish,
     {immediate:true,skipFailedPolishParts:true,...options}),()=>runningSession.retryDeadline(activeKey)??0,controller.signal,
     seconds=>{if(alive.current)setStatus(seconds?`Chờ thử lại ${seconds}s`:'Đang tiếp tục');});
   await writes;
   if(!alive.current||controller.signal.aborted)return;
   if(input.nodes)polishedEpubNodes(input.nodes,response.result);
   const terms=combinePolishTerms([knownTerms,response.polishTerms]), skipped=response.polishSkipped??[];
   await writePolishResult(key,{version:4,applied:true,text:response.result,model:response.model,...(response.polishModels?{models:response.polishModels}:{}),prompt:runPrompt,terms,skipped,
     ...(response.polishFallback?.length?{baseConvert:input.text,fallback:locatePolishFallback(input.pairs,response.polishFallback)}:{}),updatedAt:Date.now()},controller.signal);
   if(alive.current&&!controller.signal.aborted){
     setResult(response.result);
     setSavedTerms(terms);
     setSavedSkipped(skipped.length);
     setRunApplied(true);
     setStatus('Đã áp dụng bản trau chuốt');
   }
  }catch(e){
   await writes.catch(()=>{});
   if(alive.current&&stoppedRun.current===controller&&knownTerms.length>savedTerms.length){
     const commit=new AbortController();stoppedTermsWrite.current=commit;
     try{await writePolishTerms(key,knownTerms,model,commit.signal);}
     catch(error){if(!commit.signal.aborted)setError(errorText(error));}
     finally{stoppedTermsWrite.current=undefined;}
   }
   if(alive.current){
    if(controller.signal.aborted)setStatus('Đã dừng');
    else if(runProgress&&runProgress.polishSkipped?.length===runProgress.total)setStatus('Giữ Convert');
    else{setError(errorText(e));setStatus('Tạm dừng · Giữ Convert');}
   }
  }
 finally{controller.signal.removeEventListener('abort',abort);if(runAbort.current===controller)runAbort.current=undefined;if(stoppedRun.current===controller)stoppedRun.current=undefined;locked.current=false;if(alive.current)setBusy(false);}
 }
 const skippedCount=progress?.polishSkipped?.length??0;
 const retrySkipped=canResume&&skippedCount>0&&progress.done+skippedCount>=progress.total;
 const startLabel=canResume?(retrySkipped?'Thử lại phần lỗi':'Tiếp tục trau chuốt'):result?'Trau chuốt lại':'Bắt đầu trau chuốt';
 return <section className="polish-inline name-discovery" aria-label="Trau chuốt Convert">
  <header>
    <strong>Trau chuốt Convert</strong>
    <div className="polish-heading-status">
      {status&&<small role="status" title={error||undefined}>{status}</small>}
      <button className="name-discovery-icon" type="button" aria-label="Đóng trau chuốt" disabled={busy||savingTerms} onClick={onClose}>×</button>
    </div>
  </header>
  <div className="name-discovery-toolbar">
    <select aria-label="Model trau chuốt" value={model} disabled={busy||savingTerms} onChange={event=>setModel(normalizeAiModel(event.target.value)??DEFAULT_AI_MODEL)}>
      {AI_MODELS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    {busy?<button type="button" onClick={()=>{stoppedRun.current=runAbort.current;runAbort.current?.abort();}}>Dừng trau chuốt</button>
      :<button type="button" className="name-discovery-primary" disabled={savingTerms||!key||!prompt.trim()} onClick={()=>void run()}>{startLabel}</button>}
  </div>
  {progress?<PolishPartsBar progress={progress} busy={busy}/>:savedSkipped>0&&<small>{savedSkipped} phần giữ Convert</small>}
  <PolishTerms terms={savedTerms} busy={busy} saving={savingTerms} onSavingChange={setSavingTerms}/>
 </section>;
}
