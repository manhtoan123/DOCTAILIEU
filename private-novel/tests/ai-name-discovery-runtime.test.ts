import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {it,expect} from 'vitest';
const source='林安去白云山。',answer='1. Chưa xác định.\n2. Rà soát.\n3. Nhân vật.\n4. Danh sách\n```text\n$白云山=Bạch Vân Sơn\n$林安=Lâm An\n```';
it('native Worker preserves validated Chinese Name keys with Han repair negotiated and still rejects truncation/refusal/schema errors',async()=>{
 const entry=`import {handleAiTranslate} from './server/ai-translate';
 globalThis.fetch=async(url,init)=>{const input=JSON.parse(init.body),prompt=input.contents[0].parts[0].text;if(prompt.includes('before/after'))throw Error('Name key must not enter Han repair');const wire=JSON.parse(prompt.replace(/^.*?\\n(?=\\{)/s,''));let text=${JSON.stringify(answer)},finishReason='STOP';if(wire.title==='cut')finishReason='MAX_TOKENS';if(wire.title==='refuse'){text='Tôi không thể hỗ trợ yêu cầu này.';finishReason='SAFETY';}if(wire.title==='bad')text='\u0060\u0060\u0060text\\n$不存在=Không Có\\n\u0060\u0060\u0060';return Response.json({candidates:[{content:{parts:[{text}]},finishReason}],usageMetadata:{promptTokenCount:3,candidatesTokenCount:3}});};
 export default {fetch(request){return handleAiTranslate(request,{GEMINI_API_KEY:'synthetic-name-runtime-only'})}};`;
 const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts',sourcefile:'synthetic-name-runtime.ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}),runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01'}));
 try{for(const title of ['normal','cut','refuse','bad']){
  const res=await runtime.dispatchFetch('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json','X-AI-Han-Repair':'1'},body:JSON.stringify({task:'name-extraction',text:JSON.stringify({version:1,source,title}),model:'gemini-2.5-flash',systemPrompt:'Tìm Name.',userPromptTemplate:'Dữ liệu:\n{{text}}'})});
  if(title==='normal'){expect(res.status).toBe(200);expect(await res.json()).toMatchObject({result:answer,finishReason:'STOP'});}else{expect(res.status).toBe(502);expect((await res.json()) as object).not.toHaveProperty('result');expect(res.headers.get('X-AI-Failure-Reason')).toBe(title==='cut'?'output_limit':title==='refuse'?'upstream_finish_reason':'upstream_schema');}
 }
 const invalid=await runtime.dispatchFetch('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'name-extraction',text:'not JSON',model:'gemini-2.5-flash'})});expect(invalid.status).toBe(400);
 }finally{await runtime.dispose();}
},30000);
