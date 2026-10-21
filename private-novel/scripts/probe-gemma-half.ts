import {readFileSync,writeFileSync} from 'node:fs';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {filterNamesForText} from '../src/features/ai/services/ai-translate';
import {splitAiText} from '../src/features/ai/services/ai-parts';
const fixture=JSON.parse(readFileSync('.dsh-tmp/model-benchmark/fixture.json','utf8'));
const text=splitAiText(fixture.chapter.text,fixture.names.map((n:{key:string})=>n.key))[0].text,names=filterNamesForText(text,fixture.names);
const results=await Promise.all(['gemma-4-26b-a4b-it','gemma-4-31b-it'].map(async model=>{
 const started=Date.now();try{const r=await fetch('https://thu-phong-private.pages.dev/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,names,model,systemPrompt:AI_DEFAULTS.systemPrompt,userPromptTemplate:AI_DEFAULTS.userPromptTemplate,temperature:0}),signal:AbortSignal.timeout(40000)}),d=await r.json();const success=r.ok&&d.model===model&&d.finishReason==='STOP'&&!!d.result?.trim();if(success)writeFileSync(`.dsh-tmp/chapter-audit/${model}-half.txt`,d.result);return {model,status:r.status,ms:Date.now()-started,error:d.error,success,inputTokens:d.inputTokens,outputTokens:d.outputTokens,hanRemaining:success?(d.result.match(/[\u3400-\u9fff]/gu)||[]).length:undefined};}catch(e){return {model,status:0,ms:Date.now()-started,error:(e as Error).name,success:false};}
}));const report={chapterId:fixture.chapter.id,sourceChars:text.length,wholeChapter:false,firstHalf:true,fallback:false,retry:false,concurrent:2,results};writeFileSync('.dsh-tmp/chapter-audit/gemma-half-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
