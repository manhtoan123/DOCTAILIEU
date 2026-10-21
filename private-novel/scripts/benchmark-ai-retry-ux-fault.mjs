// Deterministic fault comparison: no real API calls, keys, cloud or book writes.
import {build} from 'esbuild';
import {mkdirSync,readdirSync,existsSync,cpSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=resolve('.dsh-tmp/ai-retry-ux'),baseline=join(dir,'baseline');
function fillMissing(from,to){mkdirSync(to,{recursive:true});for(const file of readdirSync(from,{withFileTypes:true})){const a=join(from,file.name),b=join(to,file.name);if(file.isDirectory())fillMissing(a,b);else if(!existsSync(b))cpSync(a,b);}}
for(const sub of ['src','server'])fillMissing(resolve(sub),join(baseline,sub));
const originalFetch=globalThis.fetch,rows=[];
try{
 for(const [variant,root] of [['before',baseline],['after',resolve('.')]]){
  const out=join(dir,`fault-${variant}.mjs`);
  await build({stdin:{contents:`export {AiReadingSession,AI_DEFAULTS} from ${JSON.stringify(join(root,'src/features/ai/services/ai-reading.ts'))};export {aiTranslate} from ${JSON.stringify(join(root,'src/features/ai/services/ai-translate.ts'))};export {handleAiTranslate,resetAiKeyState} from ${JSON.stringify(join(root,'server/ai-translate.ts'))};`,resolveDir:resolve('.'),sourcefile:'fault.ts'},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
  const api=await import(pathToFileURL(out).href);let requests=0,upstream=0;
  globalThis.fetch=async(input,init)=>{
   const url=typeof input==='string'?input:input.url;
   if(url==='/api/ai/translate'){requests++;return api.handleAiTranslate(new Request('https://synthetic.example/api/ai/translate',init),{GEMINI_API_KEY:'synthetic-fault-key-only'});}
   if(!url.startsWith('https://generativelanguage.googleapis.com/'))throw Error('Unexpected URL');
   upstream++;return Response.json({error:{status:'INVALID_ARGUMENT',message:'SYNTHETIC private provider diagnostic'}},{status:400});
  };
  const session=new api.AiReadingSession(api.aiTranslate),start=Date.now();let code='';
  try{await session.request({bookId:'synthetic-fault',id:'1',revision:1,text:'林远推开窗，看见阿宁站在院子里。'},{...api.AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[]},[]);throw Error('Unexpected success');}
  catch(error){code=error.code??error.name;}
  finally{session.clear();api.resetAiKeyState();}
  rows.push({variant,requests,upstream,ms:Date.now()-start,code});
 }
}finally{globalThis.fetch=originalFetch;}
if(rows[0].requests!==3||rows[1].requests!==1||rows[1].code!=='ai_request_rejected')throw Error('Fault comparison invariant failed');
const report={synthetic:true,realApi:false,scenario:'permanent upstream400',rows};writeFileSync(join(dir,'pilot-fault.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
