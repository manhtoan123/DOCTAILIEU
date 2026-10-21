// Isolated, bounded pilot: synthetic text, public existing endpoint, no keys or cloud writes.
import {build} from 'esbuild';
import {mkdirSync,readFileSync,writeFileSync,existsSync,cpSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=resolve('.dsh-tmp/ai-retry-ux'),baseline=join(dir,'baseline'),origin='https://thu-phong-private.pages.dev';
mkdirSync(dir,{recursive:true});
function fillMissing(from,to){mkdirSync(to,{recursive:true});for(const file of readdirSync(from,{withFileTypes:true})){const a=join(from,file.name),b=join(to,file.name);if(file.isDirectory())fillMissing(a,b);else if(!existsSync(b))cpSync(a,b);}}
fillMissing(resolve('src'),join(baseline,'src'));
const modules={};
for(const [label,root] of [['before',baseline],['after',resolve('.')]]){
  const outfile=join(dir,`pilot-${label}.mjs`);
  await build({stdin:{contents:`export {AiReadingSession,AI_DEFAULTS} from ${JSON.stringify(join(root,'src/features/ai/services/ai-reading.ts'))};export {aiTranslate} from ${JSON.stringify(join(root,'src/features/ai/services/ai-translate.ts'))};`,resolveDir:resolve('.'),sourcefile:'pilot.ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
  modules[label]=await import(pathToFileURL(outfile).href);
}
const paragraphs=[
  '林远推开窗，看见阿宁提着灯笼站在院子里。雨还没有停，屋檐上的水一滴一滴地落下来。他问：“你不是说，天亮以后才出发吗？”',
  '阿宁摇了摇头，说：“桥那边传来了消息。如果我们再等下去，青石镇的人就来不及撤离了。”她说话时声音很轻，手却紧紧地握着那封湿透的信。',
  '林远没有马上回答。他想起昨日老人的叮嘱：路上的标记可以相信，但陌生人的承诺不能轻易相信。不过，这一次送信的人是他们认识多年的朋友。',
  '两人收好地图，把剩下的干粮分成两份。阿宁留下半壶水，林远则把药箱背在身上。他们没有带走桌上的银币，因为那是替邻居保管的东西。',
  '走到河边时，木桥已经被洪水冲断。林远先试了试绳索，确认牢固之后才让阿宁过去。他提醒她：“别看脚下，看着对面的灯。”',
  '阿宁到达对岸后，没有立刻往前走，而是回头举起灯笼。直到林远也平安过河，她才松了一口气。两个人都明白，真正困难的路还在前面。',
  '天色渐渐亮了。远处传来的钟声只有两下，并不是约好的三下。林远停住脚步，重新核对信上的时间，决定先找守桥人问清楚，不能只凭猜测往前走。',
  '守桥人解释说，钟楼的第三口钟昨夜坏了，镇上并没有发出新的警报。听到这个消息，他们终于放下心来，但仍然按照原计划赶往青石镇。'
];
const make=length=>{let text='第001章 雨夜的约定\n';while(text.length<length)text+=paragraphs.join('\n\n')+'\n\n';return text;};
const fixtures=[{name:'short',text:paragraphs.slice(0,4).join('\n\n')},{name:'medium',text:make(3200)},{name:'long',text:make(7000)}];
const names=[{key:'林远',value:'Lâm Viễn'},{key:'阿宁',value:'A Ninh'},{key:'青石镇',value:'trấn Thanh Thạch'}];
const realFetch=globalThis.fetch;globalThis.fetch=(url,init)=>realFetch(typeof url==='string'&&url.startsWith('/')?origin+url:url,init);
const started=Date.now(),rows=[];let sends=0;
try{
  for(const fixture of fixtures)for(let repeat=0;repeat<2;repeat++)for(const label of repeat%2?['after','before']:['before','after']){
    if(Date.now()-started>=900_000||sends>=96)break;
    const api=modules[label],runStarted=Date.now(),calls=[];let firstReadableMs;
    const session=new api.AiReadingSession(async(input,signal)=>{
      if(sends>=96||Date.now()-started>=900_000)throw new Error('pilot_budget');
      sends++;const at=Date.now();try{const result=await api.aiTranslate(input,signal);calls.push({model:input.model,half:input.continuation?2:1,chars:input.text.length,ms:Date.now()-at,status:'complete'});return result;}
      catch(e){calls.push({model:input.model,half:input.continuation?2:1,chars:input.text.length,ms:Date.now()-at,status:'error',code:e.code??e.name});throw e;}
    });
    const stop=setTimeout(()=>session.clear(),Math.min(100_000,Math.max(1,900_000-(Date.now()-started))));
    const row={variant:label,sample:fixture.name,repeat:repeat+1,sourceChars:fixture.text.length};
    try{
      const response=await session.request({bookId:'synthetic-pilot',id:fixture.name,revision:1,text:fixture.text},{...api.AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:''}},names,undefined,undefined,p=>{if(p.text&&firstReadableMs===undefined)firstReadableMs=Date.now()-runStarted;});
      Object.assign(row,{status:'complete',firstReadableMs,totalMs:Date.now()-runStarted,requests:calls.length,models:response.halves?.models??[response.model],hanRemaining:(response.result.match(/[\u3400-\u9fff]/g)||[]).length,literalNewlines:(response.result.match(/\\n/g)||[]).length});
      writeFileSync(join(dir,`translation-${fixture.name}-${repeat+1}-${label}.txt`),response.result);
    }catch(e){Object.assign(row,{status:e.name==='AbortError'?'cancelled':'error',firstReadableMs,totalMs:Date.now()-runStarted,requests:calls.length,error:e.code??e.name});}
    finally{clearTimeout(stop);session.clear();}
    row.calls=calls;rows.push(row);writeFileSync(join(dir,'pilot-real.json'),JSON.stringify({synthetic:true,realApi:true,sequential:true,sameCurrentServer:true,plannedRuns:12,finishedRuns:rows.length,sends,durationMs:Date.now()-started,rows},null,2));
    console.log(JSON.stringify({...row,calls:undefined}));
  }
}finally{globalThis.fetch=realFetch;}
const median=xs=>{const s=xs.slice().sort((a,b)=>a-b);return s.length?s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2:undefined;};
const report=['# AI retry/UI — pilot API thật','', 'Dữ liệu tổng hợp; 3 chương × 2 lần × 2 client trước/sau, chạy xen kẽ và tuần tự trên cùng backend hiện hành. Không dùng kết quả này để quy tác động backend hoặc hứa SLA.','', '| Client | STOP | Không sót Hán hoặc escape xuống dòng | Thời gian chương trung vị | Phần đầu trung vị | Request |','|---|---:|---:|---:|---:|---:|'];
for(const label of ['before','after']){const all=rows.filter(r=>r.variant===label),ok=all.filter(r=>r.status==='complete');report.push(`| ${label} | ${ok.length}/${all.length} | ${ok.filter(r=>r.hanRemaining===0&&r.literalNewlines===0).length}/${all.length} | ${median(ok.map(r=>r.totalMs))??'—'} ms | ${median(ok.map(r=>r.firstReadableMs).filter(v=>v!==undefined))??'—'} ms | ${all.reduce((n,r)=>n+r.requests,0)} |`);}
report.push('','STOP chỉ là thành công kỹ thuật. Bộ kiểm chữ Hán/escape không đánh giá toàn bộ ngữ nghĩa. Mỗi job dừng sau100giây; toàn phép thử15phút/96request client. Chi tiết từng lần, lỗi và model: `pilot-real.json`. Bản dịch lưu cục bộ để đối chiếu đủ đoạn/đoạn kết, Name, phủ định và nhân quả. Tách cache/resume khỏi phép thử cold; tỷ lệ trên mẫu nhỏ chỉ là mô tả, không phải tỷ lệ dài hạn.');writeFileSync(join(dir,'PILOT-RESULTS.md'),report.join('\n')+'\n');
