// User-authorized comparison of ONE selected chapter. No keys, cloud writes or fallback.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError,filterNamesForText} from '../src/features/ai/services/ai-translate';
import {AI_MODELS} from '../src/features/ai/types/ai-models';
import {splitAiText} from '../src/features/ai/services/ai-parts';
const origin='https://thu-phong-private.pages.dev',dir='.dsh-tmp/model-benchmark';
const extra=['gemini-2.5-pro','gemini-2.5-flash-lite','gemini-3.6-flash','gemini-3.5-flash-lite','gemini-4-argon'];
const models=[...AI_MODELS.map(m=>m.id),...extra];
const snapshot=await(await fetch(origin+'/api/cloud/books/0fef4fb3-7517-4b2c-94b8-5e02dee09a2c')).json();
const chapter=snapshot.chapters.find((c:{id:string})=>c.id==='b2acac31-b05d-4e92-92d6-3aff345165ac');
if(!chapter||chapter.text!==JSON.parse(readFileSync(dir+'/chapter.json','utf8')).text)throw Error('Source snapshot changed');
const nameRows=new Map<string,{key:string;value:string}>(snapshot.names.map((n:{key:string;value:string})=>[n.key,n]));let cursor=0;
for(let page=0;page<30;page++){
 const state=await(await fetch(`${origin}/api/state?book=${chapter.bookId}&after=${cursor}`)).json();
 if(!Array.isArray(state.rows))throw Error('Name state unavailable');
 for(const {record:r} of state.rows)if(r.kind==='name'){if(r.value===null)nameRows.delete(r.key);else nameRows.set(r.key,{key:r.key,value:r.value});}
 cursor=state.cursor;if(!state.more)break;if(page===29)throw Error('Name pagination cap');
}
const matched=filterNamesForText(chapter.text,[...nameRows.values()]);
const names=Object.entries(matched).map(([key,value])=>({key,value}));
if(existsSync(dir+'/results.json')&&existsSync(dir+'/fixture.json')&&JSON.stringify(JSON.parse(readFileSync(dir+'/fixture.json','utf8')).names)!==JSON.stringify(names))throw Error('Cannot resume changed Names');
writeFileSync(dir+'/fixture.json',JSON.stringify({chapter,names},null,2));
const previous=existsSync(dir+'/results.json')?JSON.parse(readFileSync(dir+'/results.json','utf8')):undefined;
const runs:any[]=previous?.runs??[],report={chapterId:chapter.id,title:chapter.title,sourceChars:chapter.text.length,sourceSha256:createHash('sha256').update(chapter.text).digest('hex'),matchedNames:names.length,parts:splitAiText(chapter.text,names.map(n=>n.key)).map(p=>p.text.length),rounds:2,cache:'fresh session each run',fallback:false,temperature:0,bounds:'6 HTTP per run; no new send after 100s; shared production recovery; total cap168',models,runs};
if(previous&&previous.sourceSha256!==report.sourceSha256)throw Error('Cannot resume changed source');
let totalCalls=runs.reduce((sum,r)=>sum+r.requests,0);
for(let round=1;round<=2;round++)for(const actualModel of round===1?models:[...models].reverse()){
 if(runs.some(r=>r.model===actualModel&&r.round===round))continue;
 const apiOnly=extra.includes(actualModel),localModel=apiOnly?'comparison-'+actualModel:actualModel;
 const started=Date.now(),calls:{ms:number;status:number;chars:number;error?:string;reason?:string;inputTokens?:number;outputTokens?:number}[]=[];let firstReadableMs:number|undefined,lastProgress,rejections=0;
 const session=new AiReadingSession(async(input,signal)=>{
  if(calls.length>=6||Date.now()-started>=100000)throw new AiTranslateClientError('benchmark_budget','Benchmark request cap');
  if(++totalCalls>168)throw new AiTranslateClientError('benchmark_budget','Benchmark total cap');
  const at=Date.now();const response=await fetch(origin+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,model:apiOnly?undefined:actualModel,...(apiOnly?{benchmarkModel:actualModel}:{})}),signal:AbortSignal.any([signal!,AbortSignal.timeout(40000)])});
  const data=await response.json(),reason=response.headers.get('X-AI-Failure-Reason')??undefined;
  calls.push({ms:Date.now()-at,status:response.status,chars:input.text.length,...(!response.ok?{error:data.error,reason}:{inputTokens:data.inputTokens,outputTokens:data.outputTokens})});
  if(!response.ok){if(reason==='upstream_http'&&++rejections>=3)throw new AiTranslateClientError('benchmark_provider_rejected','Repeated provider rejection',response.status,reason);throw new AiTranslateClientError(data.error,data.error,response.status,reason,undefined,undefined,Number(response.headers.get('Retry-After')??0)*1000||undefined);}
  if(data.model!==actualModel||data.finishReason!=='STOP'||typeof data.result!=='string'||!data.result.trim())throw Error('Wrong model or incomplete response');
  return {...data,model:localModel,...(response.headers.get('X-AI-Parallel')==='2'?{parallel:2 as const}:{})};
 });
 let run;
 try{
  const result=await session.request({bookId:chapter.bookId,id:chapter.id,revision:chapter.revision,text:chapter.text},{...AI_DEFAULTS,model:localModel,fallbackModels:[],temperature:0},names,undefined,undefined,p=>{lastProgress={done:p.done,total:p.total};if(p.text&&firstReadableMs===undefined)firstReadableMs=Date.now()-started;});
  const output=result.result;writeFileSync(`${dir}/${actualModel}-r${round}.txt`,output);
  run={model:actualModel,round,status:'complete',ms:Date.now()-started,firstReadableMs,requests:calls.length,calls,outputChars:output.length,hanRemaining:(output.match(/[\u3400-\u9fff]/g)||[]).length,paragraphs:output.split(/\n+/).filter(p=>p.trim()).length,progress:lastProgress};
 }catch(error){const e=error as {code?:string;name?:string};run={model:actualModel,round,status:'failed',ms:Date.now()-started,firstReadableMs,requests:calls.length,calls,error:e.code??e.name,progress:lastProgress};}
 finally{session.clear();}
 runs.push(run);writeFileSync(dir+'/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(run));
 if(totalCalls>=168)throw Error('Comparison cap reached; partial results saved');
}
