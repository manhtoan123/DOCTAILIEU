// Follow-up to the recorded 12-job pilot: same long synthetic source, no user data/cloud writes.
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=resolve('.dsh-tmp/ai-retry-ux'),origin='https://thu-phong-private.pages.dev';mkdirSync(dir,{recursive:true});
const plannedRuns=Number(process.env.AI_PILOT_RUNS??2),label=process.env.AI_PILOT_LABEL??'quality';
if(![1,2].includes(plannedRuns)||!/^[a-z-]{1,32}$/.test(label))throw Error('Invalid bounded pilot options');
// Fixed literal fixture from the original script; reject edits that make this anything except strings.
const fixtureScript=readFileSync('scripts/benchmark-ai-retry-ux.mjs','utf8');
const literal=fixtureScript.match(/const paragraphs=\[([\s\S]*?)\n\];/)?.[1];
if(!literal)throw Error('Missing pilot fixture');
const lines=literal.trim().split('\n').map(line=>line.trim());
if(lines.length!==8||lines.some(line=>!/^'[^'\\]*',?$/.test(line)))throw Error('Unexpected pilot fixture');
const paragraphs=lines.map(line=>line.replace(/^'|'[,]?$/g,''));
let text='第001章 雨夜的约定\n';while(text.length<7000)text+=paragraphs.join('\n\n')+'\n\n';
const names=[{key:'林远',value:'Lâm Viễn'},{key:'阿宁',value:'A Ninh'},{key:'青石镇',value:'trấn Thanh Thạch'}];
const outfile=join(dir,'pilot-quality.mjs');
await build({stdin:{contents:`export {AiReadingSession,AI_DEFAULTS} from './src/features/ai/services/ai-reading';export {aiTranslate} from './src/features/ai/services/ai-translate';export {hasCopiedSource} from './src/features/ai/services/ai-source-copy';`,resolveDir:resolve('.'),sourcefile:'pilot-quality.ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
const api=await import(pathToFileURL(outfile).href),realFetch=globalThis.fetch;
globalThis.fetch=(url,init)=>realFetch(typeof url==='string'&&url.startsWith('/')?origin+url:url,init);
const started=Date.now(),rows=[];let sends=0;
try{
  for(let repeat=1;repeat<=plannedRuns;repeat++){
    if(sends>=24||Date.now()-started>=360000)break;
    const calls=[],at=Date.now();let firstReadableMs;
    const session=new api.AiReadingSession(async(input,signal)=>{
      if(sends>=24||Date.now()-started>=360000)throw Error('pilot_budget');sends++;const requestAt=Date.now();
      try{const response=await api.aiTranslate(input,signal);calls.push({model:input.model,half:input.continuation?2:1,chars:input.text.length,ms:Date.now()-requestAt,status:'received',copied:api.hasCopiedSource(input.text,response.result,Object.values(input.names??{}))});return response;}
      catch(error){calls.push({model:input.model,half:input.continuation?2:1,chars:input.text.length,ms:Date.now()-requestAt,status:'error',code:error.code??error.name});throw error;}
    });
    const stop=setTimeout(()=>session.clear(),Math.min(150000,360000-(Date.now()-started)));
    const row={repeat,sourceChars:text.length};
    try{
      const response=await session.request({bookId:'synthetic-pilot-quality',id:'long',revision:1,text},{...api.AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:''}},names,undefined,undefined,p=>{if(p.text&&firstReadableMs===undefined)firstReadableMs=Date.now()-at;});
      Object.assign(row,{status:'complete',totalMs:Date.now()-at,firstReadableMs,requests:calls.length,copied:api.hasCopiedSource(text,response.result,names.map(n=>n.value)),hanRemaining:(response.result.match(/\p{Script=Han}/gu)??[]).length,literalNewlines:(response.result.match(/\\n/g)??[]).length,models:response.halves?.models});
      writeFileSync(join(dir,`translation-${label}-long-${repeat}.txt`),response.result);
    }catch(error){Object.assign(row,{status:error.name==='AbortError'?'cancelled':'error',error:error.code??error.name,totalMs:Date.now()-at,firstReadableMs,requests:calls.length});}
    finally{clearTimeout(stop);session.clear();}
    row.calls=calls;rows.push(row);writeFileSync(join(dir,`pilot-${label}.json`),JSON.stringify({synthetic:true,realApi:true,sequential:true,plannedRuns,maxClientRequests:24,perJobMs:150000,globalMs:360000,rows,sends,durationMs:Date.now()-started},null,2));
    console.log(JSON.stringify({...row,calls:undefined}));
  }
}finally{globalThis.fetch=realFetch;}
if(rows.length!==plannedRuns||rows.some(row=>row.status!=='complete'||row.copied||row.hanRemaining))process.exitCode=1;
