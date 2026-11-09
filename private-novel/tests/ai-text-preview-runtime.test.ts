import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {expect,it} from 'vitest';
it.each(['gemma-4-26b-a4b-it','gemini-3.5-flash-lite'])('native workerd streams negotiated text before final with a synthetic upstream: %s',async(model)=>{
 const entry=`import {handleAiTranslate} from './server/ai-translate';
 globalThis.fetch=async(url)=>{if(!String(url).includes('/models/${model}:streamGenerateContent'))throw Error('Wrong synthetic model endpoint');return new Response(new ReadableStream({start(c){const push=(text,finishReason)=>c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]},...(finishReason?{finishReason}:{})}],...(finishReason?{usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}}:{})})+'\\n\\n'));push('Đoạn đầu.\\n');setTimeout(()=>{push('Đã xong.','STOP');c.close()},500)}}),{headers:{'Content-Type':'text/event-stream'}});};
 export default {fetch(request){return handleAiTranslate(request,{GEMINI_API_KEY:'synthetic-preview-runtime'})}};`;
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'synthetic-text-preview.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-01-01'}));
 try{
 const response=await runtime.dispatchFetch('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson','X-AI-Preview':'1'},body:JSON.stringify({text:'你好',model})});
 const reader=response.body!.getReader(),decoder=new TextDecoder();let text='',draft=false,final=false;
 for(;;){const row=await reader.read();if(row.done)break;text+=decoder.decode(row.value,{stream:true});if(!draft&&text.includes('"type":"text"')){draft=true;if(!final)expect(text).not.toContain('"type":"result"');}if(text.includes('"type":"result"'))final=true;}
 const rows=text.trim().split('\n').map(line=>JSON.parse(line));expect(draft).toBe(true);expect(rows.findIndex(r=>r.type==='text')).toBeLessThan(rows.findIndex(r=>r.type==='result'));expect(rows.at(-1)).toMatchObject({type:'result',status:200,data:{result:'Đoạn đầu.\nĐã xong.'}});
 }finally{await runtime.dispose();}
},20000);
it('native Worker immediately moves from failing key to another key and keeps streaming/credentials bounded',async()=>{
 const entry=`import {handleAiTranslate} from './server/ai-translate';
 globalThis.fetch=async(url,init)=>{if(!String(url).includes('/models/gemini-3.5-flash-lite:streamGenerateContent'))throw Error('Wrong endpoint');if(new Headers(init.headers).get('x-goog-api-key')==='synthetic-native-alpha')return new Response('Synthetic temporary failure',{status:503,headers:{'Retry-After':'120'}});return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Đã chuyển key.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}})+'\\n\\n',{headers:{'Content-Type':'text/event-stream'}})};
 export default {fetch(request){return handleAiTranslate(request,{GEMINI_API_KEYS:JSON.stringify(['synthetic-native-alpha','synthetic-native-beta'])})}};`;
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'synthetic-key-rotation.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}),runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-01-01'}));
 try{const response=await runtime.dispatchFetch('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson','X-AI-Immediate':'1'},body:JSON.stringify({text:'你好',model:'gemini-3.5-flash-lite'})}),wire=await response.text(),rows=wire.trim().split('\n').map(line=>JSON.parse(line));expect(rows.at(-1)).toMatchObject({type:'result',status:200,headers:{'X-AI-Key-Slot':'2'},data:{result:'Đã chuyển key.'}});expect(wire).not.toContain('synthetic-native-');}finally{await runtime.dispose();}
},20000);

it.each([false,true])('native Worker reports fast first answer then aborts idle7s, preview=%s',async preview=>{
 const entry=`import {handleAiTranslate} from './server/ai-translate';
 globalThis.fetch=async()=>new Response(new ReadableStream({start(c){const encode=(v)=>new TextEncoder().encode('data: '+JSON.stringify(v)+'\\n\\n');c.enqueue(encode({candidates:[{content:{parts:[{text:'Answer.'}]}}]}));this.timer=setTimeout(()=>{c.enqueue(new TextEncoder().encode(':alive\\n\\n'));c.enqueue(encode({candidates:[{content:{parts:[{text:'Private reasoning',thought:true}]}}]}))},6000)},cancel(){clearTimeout(this.timer)}}),{headers:{'Content-Type':'text/event-stream'}});
 export default {fetch(request){return handleAiTranslate(request,{GEMINI_API_KEY:'synthetic-idle-runtime'})}};`;
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'synthetic-idle-runtime.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}),runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-01-01'}));
 try{const started=Date.now(),response=await runtime.dispatchFetch('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson',...(preview?{'X-AI-Preview':'1'}:{})},body:JSON.stringify({text:'Synthetic source',model:'gemma-4-26b-a4b-it'})}),wire=await response.text(),rows=wire.trim().split('\n').map(line=>JSON.parse(line));expect(rows.some(row=>row.type==='text')).toBe(preview);expect(rows.some(row=>row.type==='progress'&&!row.lease)).toBe(true);expect(rows.at(-1)).toMatchObject({type:'result',status:504,data:{error:'ai_timeout'}});expect(Date.now()-started).toBeGreaterThanOrEqual(6900);expect(Date.now()-started).toBeLessThan(12000);expect(wire).not.toContain('Private reasoning');}finally{await runtime.dispose();}
},20000);
