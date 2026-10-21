import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {expect,it} from 'vitest';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
it('actual workerd/D1 atomically detects simultaneous edits and preserves deletion tombstones',async()=>{
 const bundle=await build({stdin:{contents:`import {handleSharedPrompts} from './server/shared-prompts';export default {fetch(r,e){return handleSharedPrompts(r,e)}}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'});
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01',d1Databases:['DB']}));
 try{
  const database=await runtime.getD1Database('DB');const sql=await readFile('migrations/0009_shared_prompts.sql','utf8');for(const statement of sql.split(';').filter(s=>s.trim()))await database.prepare(statement).run();
  const profile={id:'synthetic',title:'Synthetic',settings:{...AI_DEFAULTS,systemPrompt:'甲😀'.repeat(2000),hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:'Gọi anh.',secondHalfPrompt:'{{name}} {{firstHalfSource}} {{firstHalfTranslation}} {{text}}'}},updatedAt:1};
  const put=(baseRevision:number,value:unknown=profile)=>runtime.dispatchFetch('https://synthetic.example/api/prompts',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:profile.id,baseRevision,profile:value})});
  const created=await put(0);expect(created.status).toBe(200);const first=(await created.json() as any).row;
  const concurrent=await Promise.all([put(first.revision,{...profile,title:'A'}),put(first.revision,{...profile,title:'B'})]);expect(concurrent.map(r=>r.status).sort()).toEqual([200,409]);
  const rows=(await (await runtime.dispatchFetch('https://synthetic.example/api/prompts?after=0')).json() as any).rows;expect(rows).toHaveLength(1);expect(rows[0].profile.settings.systemPrompt).toBe(profile.settings.systemPrompt);expect(rows[0].profile.settings.hybrid).toEqual(profile.settings.hybrid);
  expect((await put(rows[0].revision,null)).status).toBe(200);expect((await put(0)).status).toBe(409);
  const delta=await (await runtime.dispatchFetch(`https://synthetic.example/api/prompts?after=${rows[0].revision}`)).json() as any;expect(delta.rows).toHaveLength(1);expect(delta.rows[0].profile).toBeNull();expect(delta.revision).toBeGreaterThanOrEqual(delta.rows[0].revision);
 }finally{await runtime.dispose();}
},30000);
