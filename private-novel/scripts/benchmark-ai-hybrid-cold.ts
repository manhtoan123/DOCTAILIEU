import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
const dir='.dsh-tmp/ai-hybrid',fixture=JSON.parse(readFileSync('.dsh-tmp/model-benchmark/fixture.json','utf8'));
mkdirSync(dir,{recursive:true});const settings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],hybrid:{version:1 as const,liteModel:'gemini-3.1-flash-lite' as const,rules:''}};
const results:unknown[]=[];
const dialogue='夏彦说：“你真的愿意留下吗？”对方摇头回答：“我答应帮忙，可没有答应替你做决定。请先把事情讲清楚。”夏彦收起地图，解释了前面的危险。他们争论的不是谁更勇敢，而是谁负责照顾受伤的伙伴。“先救人，再考虑奖励。”他说。对方沉默片刻，终于同意了。';
const idioms='这一次，夏彦决定先带受伤的伙伴离开。他提醒大家，不能捡了芝麻丢了西瓜，也不能因小失大。有人觉得错过奖励很可惜，他却说：“留得青山在，不怕没柴烧。逞一时之勇不是办法。”众人没有再争执，一边清理退路，一边寻找安全的地方。他没有放弃目标，只是把活着回来放在第一位。';
const cases=[{id:'selected-txt',text:fixture.chapter.text,epub:false},{id:'selected-epub-layout',text:fixture.chapter.text,epub:true},{id:'synthetic-dialogue',text:Array.from({length:8},(_,i)=>`第${i+1}段\n${dialogue}${dialogue}`).join('\n'),epub:false},{id:'synthetic-idioms',text:Array.from({length:7},(_,i)=>`第${i+1}段\n${idioms}${idioms}`).join('\n'),epub:false}];
for(const test of cases.filter(c=>!process.argv[2]||c.id===process.argv[2])){let requests=0,firstMs:number|undefined;const at=Date.now(),calls:unknown[]=[];
 const send=async(input:any,signal?:AbortSignal)=>{if(++requests>8||Date.now()-at>100000)throw new AiTranslateClientError('benchmark_budget','Cold pilot budget');const started=Date.now();const r=await fetch('https://thu-phong-private.pages.dev/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.any([signal!,AbortSignal.timeout(40000)])});const d=await r.json();calls.push({model:input.model,ms:Date.now()-started,status:r.status,sampleChars:input.continuation?.sample.length??0,targetChars:input.text.length,error:d.error});if(!r.ok)throw new AiTranslateClientError(d.error,d.error,r.status,r.headers.get('X-AI-Failure-Reason')??undefined);if(d.model!==input.model||d.finishReason!=='STOP')throw Error('Invalid provider result');return d;};
 const source={...fixture.chapter,id:test.id,text:test.text},session=test.epub?new EpubAiSession(undefined,send):new AiReadingSession(send);let report;
 try{const onProgress=(p:{text:string})=>{if(p.text&&firstMs===undefined)firstMs=Date.now()-at;};
 const result=test.epub?await(session as EpubAiSession).request(source,settings,fixture.names,{path:'synthetic.xhtml',body:'<body><p>synthetic layout only</p></body>',styles:[],nodes:test.text.split('\n').filter((s:string)=>s.trim())},undefined,onProgress):await(session as AiReadingSession).request(source,settings,fixture.names,undefined,undefined,onProgress);
 writeFileSync(dir+'/'+test.id+'.txt',result.result);report={id:test.id,sourceChars:test.text.length,success:true,ms:Date.now()-at,firstMs,requests,models:result.halves?.models,hanRemaining:(result.result.match(/[\u3400-\u9fff]/g)||[]).length,calls};
 }catch(e){report={id:test.id,sourceChars:test.text.length,success:false,ms:Date.now()-at,firstMs,requests,error:(e as any).code??(e as Error).name,calls};}finally{session.clear();}
 results.push(report);writeFileSync(dir+(process.argv[2]?'/cold-'+process.argv[2]+'.json':'/cold.json'),JSON.stringify({cache:'fresh session, no persistence',automaticRetries:'existing app recovery within 8-send cap per case',results},null,2));console.log(JSON.stringify(report));
}
