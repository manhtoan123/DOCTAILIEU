import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {describe,it,expect} from 'vitest';
const token='a'.repeat(64);
describe('Pages to private regional AI Worker',()=>{
 it.each([['', ''],['', 'https://reader.example'],['b'.repeat(64),'https://reader.example'],[token,'https://other.example'],[token,'https://reader.example']])('preserves empty-input validation for any credentials and origin through binding %s %s',async(credential,origin)=>{
 const bundle=async(contents:string)=>(await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 const pages=await bundle(`import {onRequest} from './functions/api/ai/translate';export default {fetch(request,env){return onRequest({request,env});}}`);
 const ai=await bundle(`import worker from './server/ai-worker';export default worker;`);
 const runtime=new Miniflare(convertV4MiniflareOptions({workers:[{name:'pages',modules:true,script:pages,compatibilityDate:'2026-01-01',serviceBindings:{AI_TRANSLATOR:'ai'}},{name:'ai',modules:true,script:ai,compatibilityDate:'2026-01-01',bindings:{GEMINI_API_KEY:'synthetic-key-only'}}]}));
 try{const response=await runtime.dispatchFetch('https://reader.example/api/ai/translate',{method:'POST',headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:'{"text":""}'});expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'text_empty'});}finally{await runtime.dispose();}
 },20000);
 it.each([undefined,'https://other.example'])('accepts anonymous synthetic translation through binding with origin %s and no capability hash',async origin=>{
 const bundle=async(contents:string)=>(await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 const pages=await bundle(`import {onRequest} from './functions/api/ai/translate';export default {fetch(request,env){return onRequest({request,env});}}`);
 const ai=await bundle(`import worker from './server/ai-worker';export default worker;`);
 let calls=0;
 const runtime=new Miniflare(convertV4MiniflareOptions({workers:[
 {name:'pages',modules:true,script:pages,compatibilityDate:'2026-01-01',serviceBindings:{AI_TRANSLATOR:'ai'}},
 {name:'ai',modules:true,script:ai,compatibilityDate:'2026-01-01',bindings:{GEMINI_API_KEY:'synthetic-key-only'},outboundService:async(request:Request)=>{
 calls++;expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
 expect(request.headers.get('x-goog-api-key')).toBe('synthetic-key-only');expect(request.headers.get('Authorization')).toBeNull();
 return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Lâm Nhi mở cửa.'}]},finishReason:'STOP'}]}),{headers:{'Content-Type':'application/json'}});
 }}]}));
 try{
 const response=await runtime.dispatchFetch('https://reader.example/api/ai/translate',{method:'POST',headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},body:JSON.stringify({text:'林儿开门。'})});
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({result:'Lâm Nhi mở cửa.',finishReason:'STOP'});expect(calls).toBe(1);
 }finally{await runtime.dispose();}
 },20000);
});
