import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {describe,it,expect} from 'vitest';
describe('AI actual workerd runtime at production compatibility date',()=>{
 it.each([[200,undefined],[200,'https://other.example'],[302,'https://other.example']])('handles anonymous Gemini HTTP %i with origin %s without redirect or secret forwarding',async(status,origin)=>{
 const bundle=await build({stdin:{contents:`import {handleAiTranslate} from './server/ai-translate';export default {fetch(r,e){return handleAiTranslate(r,e)}}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'});
 let calls=0;const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,outboundService:async(request:Request)=>{calls++;expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');expect(request.headers.get('x-goog-api-key')).toBe('synthetic-key-only');expect(request.headers.get('Authorization')).toBeNull();expect(request.headers.get('Origin')).toBeNull();return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Lâm Nhi mở cửa.'}]},finishReason:'STOP'}]}),{status:status as number,headers:{'Content-Type':'application/json',Location:'https://untrusted.example/secret'}});},compatibilityDate:'2026-01-01',bindings:{GEMINI_API_KEY:'synthetic-key-only'}}));
 try{
 const response=await runtime.dispatchFetch('https://reader.example/api/ai/translate',{method:'POST',headers:{...(origin?{Origin:String(origin)}:{}),'Content-Type':'application/json'},body:JSON.stringify({text:'林儿开门。'})});
 expect(response.status).toBe(status===200?200:502);
 const data=await response.json();expect(data).toMatchObject(status===200?{result:'Lâm Nhi mở cửa.',finishReason:'STOP'}:{error:'ai_upstream_error'});expect(calls).toBe(1);
 }finally{await runtime.dispose();}
 },20000);
});
