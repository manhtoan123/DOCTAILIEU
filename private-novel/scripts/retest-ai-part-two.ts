import {readFileSync,writeFileSync} from 'node:fs';
import {splitAiText} from '../src/features/ai/services/ai-parts';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {filterNamesForText} from '../src/features/ai/services/ai-translate';
const dir='.dsh-tmp/model-retest',fixture=JSON.parse(readFileSync('.dsh-tmp/model-benchmark/fixture.json','utf8'));
const parts=splitAiText(fixture.chapter.text,fixture.names.map((n:{key:string})=>n.key)),model='gemini-3.7-flash';
if(!readFileSync(dir+'/gemini-3.7-flash-r1.txt','utf8').trim())throw Error('Missing validated first part');
const results=await Promise.all([1,2].map(async trial=>{
 const at=Date.now();try{const r=await fetch('https://thu-phong-private.pages.dev/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,text:parts[1].text,context:parts[1].context,systemPrompt:AI_DEFAULTS.systemPrompt,userPromptTemplate:AI_DEFAULTS.userPromptTemplate,temperature:0,names:filterNamesForText(parts[1].text,fixture.names)}),signal:AbortSignal.timeout(40000)});
 const d=await r.json(),ok=r.ok&&d.model===model&&d.finishReason==='STOP'&&typeof d.result==='string'&&d.result.trim();
 if(ok){writeFileSync(`${dir}/gemini-3.7-flash-part2-${trial}.txt`,d.result);writeFileSync(`${dir}/gemini-3.7-flash-complete-${trial}.txt`,readFileSync(dir+'/gemini-3.7-flash-r1.txt','utf8')+'\n'+d.result);}
 return {trial,model,chars:parts[1].text.length,ms:Date.now()-at,status:r.status,success:!!ok,keyLabel:r.headers.get('X-AI-Key-Label'),error:d.error,reason:r.headers.get('X-AI-Failure-Reason'),hanRemaining:ok?(d.result.match(/[\u3400-\u9fff]/g)||[]).length:undefined};
 }catch(e){return {trial,model,ms:Date.now()-at,status:0,success:false,error:(e as Error).name};}
}));
writeFileSync(dir+'/part-two.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
