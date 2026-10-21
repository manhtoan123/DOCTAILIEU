// One cold selected TXT chapter, sequential hybrid stages. No keys or cloud writes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {AI_DEFAULTS,AiReadingSession} from '../src/features/ai/services/ai-reading';
import {aiTranslate,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {DEFAULT_SECOND_HALF_PROMPT} from '../src/features/ai/services/ai-hybrid-prompt';
import {aiRecoveryCut} from '../src/features/ai/services/ai-complete';
import {nameSourceKey} from '../src/features/names-convert/services/name-images';
const dir='.dsh-tmp/ai-hybrid-pair',origin='https://thu-phong-private.pages.dev';
mkdirSync(dir,{recursive:true});
const fixture=JSON.parse(readFileSync('.dsh-tmp/model-benchmark/fixture.json','utf8'));
const source={...fixture.chapter,revision:fixture.chapter.revision??1};
const settings={...AI_DEFAULTS,model:'gemini-3.7-flash',fallbackModels:['gemini-2.5-flash'],temperature:0,hybrid:{version:1 as const,liteModel:'gemini-3.5-flash-lite' as const,rules:'',secondHalfPrompt:DEFAULT_SECOND_HALF_PROMPT}};
const actualFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>actualFetch(typeof input==='string'&&input.startsWith('/')?origin+input:input,init);
const calls:Record<string,unknown>[]=[],at=Date.now(),firstSource=source.text.slice(0,aiRecoveryCut(source.text,fixture.names.map((n:{key:string})=>nameSourceKey(n.key))));let firstTranslation='',paired=false;
const session=new AiReadingSession(async(req:AiTranslateClientRequest,signal?:AbortSignal)=>{
 if(calls.length>=8)throw Error('Pilot request budget exhausted');
 const started=Date.now(),continuation=req.continuation;
 if(continuation?.version===3){
  if(continuation.firstHalfSource!==firstSource||continuation.sample!==firstTranslation)throw Error('Reference pair mismatch');
  paired=true;
 }
 const entry:Record<string,unknown>={stage:continuation?2:1,model:req.model,targetChars:req.text.length,firstSourceChars:continuation?.version===3?continuation.firstHalfSource.length:0,sampleChars:continuation?.sample.length??0};calls.push(entry);
 try{
  const result=await aiTranslate(req,signal);Object.assign(entry,{success:true,ms:Date.now()-started,finishReason:result.finishReason,inputTokens:result.inputTokens,outputTokens:result.outputTokens,outputChars:result.result.length,hanRemaining:(result.result.match(/[\u3400-\u9fff]/g)||[]).length,literalNewlines:(result.result.match(/\\n/g)||[]).length});
  if(!continuation)firstTranslation=result.result;
  writeFileSync(`${dir}/real-stage-${continuation?2:1}.txt`,result.result);return result;
 }catch(error){Object.assign(entry,{success:false,ms:Date.now()-started,error:(error as {code?:string}).code??(error as Error).name});throw error;}
 finally{writeFileSync(dir+'/real-progress.json',JSON.stringify({sourceChars:source.text.length,calls},null,2));}
});
const stopPilot=setTimeout(()=>session.clear(),100_000);
try{
 const result=await session.request(source,settings,fixture.names,undefined,undefined,p=>{if(p.half===1&&p.done===p.total)firstTranslation=p.text;});
 writeFileSync(dir+'/real-chapter.txt',result.result);
 const report={success:true,coldChapter:true,sequential:true,realApi:true,sourceChars:source.text.length,ms:Date.now()-at,pairedSourceAndTranslation:paired,models:result.halves?.models,hanRemaining:(result.result.match(/[\u3400-\u9fff]/g)||[]).length,literalNewlines:(result.result.match(/\\n/g)||[]).length,calls};
 writeFileSync(dir+'/real.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){const report={success:false,coldChapter:true,sequential:true,realApi:true,sourceChars:source.text.length,ms:Date.now()-at,pairedSourceAndTranslation:paired,error:(error as {code?:string}).code??(error as Error).name,calls};writeFileSync(dir+'/real.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exitCode=1;}
finally{clearTimeout(stopPilot);session.clear();globalThis.fetch=actualFetch;}
