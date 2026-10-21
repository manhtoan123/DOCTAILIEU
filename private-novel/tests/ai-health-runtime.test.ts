import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {expect,it} from 'vitest';
it('persists broken-key exclusion and model cooldowns across isolate resets; 404 retains keys',async()=>{
 const bundle=await build({stdin:{contents:`import {handleAiTranslate,resetAiKeyState} from './server/ai-translate';import {handleAiKeys} from './server/ai-keys';export default {fetch(r,e){if(new URL(r.url).pathname==='/reset'){resetAiKeyState();return new Response('ok')}return new URL(r.url).pathname.endsWith('keys')?handleAiKeys(r,e):handleAiTranslate(r,e)}}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'});
 let status=403,message='Your API key was reported as leaked. Please use another API key.',calls=0;
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01',d1Databases:['DB'],bindings:{GEMINI_API_KEY:'AIza'+'A'.repeat(35)},outboundService:async()=>{calls++;return new Response(JSON.stringify({error:{message}}),{status,headers:{'Content-Type':'application/json'}});}}));
 const translate=()=>runtime.dispatchFetch('https://synthetic.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'合成文字。'})});
 try{
  const database=await runtime.getD1Database('DB');for(const file of ['0006_ai_keys.sql','0008_ai_key_health.sql']){const sql=(await readFile('migrations/'+file,'utf8')).replace(/--[^\n]*/g,'');for(const statement of sql.split(';').filter(s=>s.trim()))await database.prepare(statement).run();}
  await translate();expect(calls).toBe(1);await runtime.dispatchFetch('https://synthetic.example/reset');await translate();expect(calls).toBe(1);
  const snapshot=await (await runtime.dispatchFetch('https://synthetic.example/api/ai/keys')).json() as any;expect(snapshot.excluded).toBe(1);expect(JSON.stringify(snapshot)).not.toContain('AIza'+'A'.repeat(35));
  await database.prepare('DELETE FROM ai_key_health').run();await runtime.dispatchFetch('https://synthetic.example/reset');status=404;message='Model does not exist';expect((await translate()).status).toBe(404);
  await runtime.dispatchFetch('https://synthetic.example/reset');await translate();expect(calls).toBe(3);expect((await database.prepare('SELECT * FROM ai_key_health WHERE disabled=1').all()).results).toHaveLength(0);
  status=403;message='Permission denied for this model';await translate();expect(calls).toBe(4);await runtime.dispatchFetch('https://synthetic.example/reset');await translate();expect(calls).toBe(4);expect((await database.prepare('SELECT * FROM ai_key_cooldowns').all()).results).toHaveLength(1);
 }finally{await runtime.dispose();}
},30000);
