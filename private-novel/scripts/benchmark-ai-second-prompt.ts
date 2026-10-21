// Bounded comparison: old v1 and editable v2; no keys, cloud writes or source edits.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {filterNamesForText} from '../src/features/ai/services/ai-translate';
import {splitAiText} from '../src/features/ai/services/ai-parts';
import {LEGACY_SECOND_HALF_PROMPT as DEFAULT_SECOND_HALF_PROMPT} from '../src/features/ai/services/ai-hybrid-prompt';
import {aiRecoveryCut} from '../src/features/ai/services/ai-complete';
const refined=process.argv.includes('--refined'),dir='.dsh-tmp/ai-hybrid-prompt'+(refined?'/refined':''),origin='https://thu-phong-private.pages.dev';mkdirSync(dir,{recursive:true});
const fixture=JSON.parse(readFileSync('.dsh-tmp/model-benchmark/fixture.json','utf8'));
const novel=splitAiText(fixture.chapter.text,fixture.names.map((n:{key:string})=>n.key))[1].text;
const novelSample=readFileSync('.dsh-tmp/model-retest/gemini-3.7-flash-r1.txt','utf8');
const dialogue='夏彦说：“你真的愿意留下吗？”对方摇头回答：“我答应帮忙，可没有答应替你做决定。请先把事情讲清楚。”夏彦收起地图，解释了前面的危险。他们争论的不是谁更勇敢，而是谁负责照顾受伤的伙伴。“先救人，再考虑奖励。”他说。对方沉默片刻，终于同意了。';
const full=Array.from({length:8},(_,i)=>`第${i+1}段\n${dialogue}${dialogue}`).join('\n'),cut=aiRecoveryCut(full);
const old=JSON.parse(readFileSync('.dsh-tmp/ai-hybrid/cold-synthetic-dialogue.json','utf8')).results[0];
if(full.length!==old.sourceChars||cut!==old.calls[0].targetChars)throw Error('Dialogue spans changed');
const sample=readFileSync('.dsh-tmp/ai-hybrid/synthetic-dialogue.txt','utf8').slice(0,old.calls.find((c:any)=>c.sampleChars)?.sampleChars);
const fixtures=[{id:'dialogue-labels',text:full.slice(cut),sample,names:filterNamesForText(full,fixture.names)},{id:'selected-novel',text:novel,sample:novelSample,names:filterNamesForText(fixture.chapter.text,fixture.names)}];
const models=['gemini-3.1-flash-lite','gemini-3.5-flash-lite'],jobs=fixtures.flatMap(f=>models.flatMap(model=>(!refined&&f.id==='dialogue-labels'?[1,2]:[2]).map(version=>({f,model,version,id:`${f.id}-${model}-v${version}`}))));
const results:any[]=[];let index=0;
async function worker(){while(index<jobs.length){const {f,model,version,id}=jobs[index++],at=Date.now();let result;
 try{const r=await fetch(origin+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:f.text,model,names:f.names,systemPrompt:AI_DEFAULTS.systemPrompt,userPromptTemplate:AI_DEFAULTS.userPromptTemplate,temperature:0,continuation:{version,sample:f.sample,rules:'',...(version===2?{promptTemplate:DEFAULT_SECOND_HALF_PROMPT}:{})}}),signal:AbortSignal.timeout(40000)});const d=await r.json(),ok=r.ok&&d.model===model&&d.finishReason==='STOP'&&typeof d.result==='string'&&d.result.trim();if(ok)writeFileSync(`${dir}/${id}.txt`,d.result);result={id,model,version,sourceChars:f.text.length,sampleChars:f.sample.length,success:!!ok,status:r.status,ms:Date.now()-at,error:d.error,inputTokens:d.inputTokens,outputTokens:d.outputTokens,hanRemaining:ok?(d.result.match(/[\u3400-\u9fff]/g)||[]).length:undefined};
 }catch(e){result={id,model,version,success:false,status:0,ms:Date.now()-at,error:(e as Error).name};}
 results.push(result);writeFileSync(dir+'/quality.json',JSON.stringify({automaticRetry:false,concurrent:2,temperature:0,fixedSample:true,results},null,2));console.log(JSON.stringify(result));}}
await Promise.all([worker(),worker()]);
