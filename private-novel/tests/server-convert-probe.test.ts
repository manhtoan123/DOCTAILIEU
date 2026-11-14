import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {LanguageEngine} from '../src/features/names-convert/services/language';
import {normalizeKey} from '../src/features/names-convert/services/reference-convert';
import {nameSourceKey} from '../src/features/names-convert/services/name-images';
import type {DictKind} from '../src/core/domain';
let runtime:Miniflare;
let workerScript='';
let database:Awaited<ReturnType<Miniflare['getD1Database']>>;
const fixtures:[DictKind,string,string][]=[['vp','打开','mở'],['vp','门','cửa'],['vp','中国','Trung Quốc'],['vp','人民','nhân dân'],['names','林儿','Lâm Nhi'],['hanviet','林','lâm'],['hanviet','儿','nhi'],['hanviet','门','môn'],['hanviet','山','sơn'],['english','林儿','Lin Er'],['rules','第{0}章','chương {0}'],['vp','林，儿','cụm chuẩn hóa'],['names','乙丙','Tên trước'],['names','甲乙','Tên sau']];
const full=new LanguageEngine();for(const [kind,key,value] of fixtures)full.add(kind,`${key}=${value}`);
const send=(data:unknown)=>runtime.dispatchFetch('https://local-probe.invalid/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
it('can omit the unused paragraph lookup while preserving every token meaning',async()=>{
 const response=await send({text:'林儿打开门。林儿打开门。',includeLookup:false});expect(response.status).toBe(200);const result=await response.json() as any;
 expect(result.lookup).toEqual({hanviet:'',meanings:[]});expect(result.lookups).toEqual(result.tokens.filter((t:any)=>t.source.trim()).map((t:any)=>({source:t.source,...full.lookup(t.source)})));
});
it('accepts an explicit blank Name over a dictionary match without losing source offsets',async()=>{
 const response=await send({text:'林儿打开门。',names:[{key:'林儿',value:''}]});
 expect(response.status).toBe(200);
 const {tokens}=await response.json() as {tokens:ReturnType<LanguageEngine['convert']>};
 expect(tokens.map(token=>token.targetText).join('')).toBe('Mở cửa.');
 expect(tokens[0]).toMatchObject({type:'name',source:'林儿',sourceStart:0,sourceEnd:2,targetText:''});
});
beforeAll(async()=>{
 const bundle=await build({entryPoints:['experiments/server-convert/worker.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
 workerScript=bundle.outputFiles[0].text;
 runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:workerScript,compatibilityDate:'2026-01-01',d1Databases:['PROBE_DB']}));
 database=await runtime.getD1Database('PROBE_DB');
 const schema=await readFile('experiments/server-convert/schema.sql','utf8');for(const sql of schema.split(';').filter(s=>s.trim()))await database.prepare(sql).run();
 await database.prepare('INSERT INTO probe_metadata VALUES(1,32)').run();
 await database.batch(fixtures.map(([kind,key,value],ordinal)=>database.prepare('INSERT INTO probe_dictionary VALUES(?,?,?,?,?)').bind(key,kind,value,normalizeKey(kind==='names'||kind==='names2'?nameSourceKey(key):key),ordinal)));
 // Seed identical unrelated rows in one local statement, avoiding 50 batch round trips.
 await database.prepare("WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<4999) INSERT INTO probe_dictionary SELECT '无关词'||i,'vp','Từ tổng hợp','无关词'||i,?+i FROM n").bind(fixtures.length).run();
},60000);
afterAll(async()=>{await runtime?.dispose();});
describe('isolated server Convert probe in workerd/D1',()=>{
 it('includes image metadata in the aggregate output cap even when every entry occurs once',async()=>{
  const keys=Array.from({length:40},(_,i)=>String.fromCodePoint(0x5000+i));
  const value='[i]https://archives.bulbagarden.net/media/upload/'+'a'.repeat(1800)+'.png[/]Hình';
  await database.batch(keys.map((key,index)=>database.prepare('INSERT INTO probe_dictionary VALUES(?,?,?,?,?)').bind(key,'names',value,key,91000+index)));
  try{
   const response=await send({text:keys.join(''),names:[]});
   expect(response.status).toBe(413);expect(await response.json()).toEqual({error:'output_limit'});
   expect(response.headers.get('X-Convert-Error')).toBe('output_limit');
  }finally{await database.prepare('DELETE FROM probe_dictionary WHERE ordinal>=91000 AND ordinal<91040').run();}
 });
 it.each(['private-name','dictionary'] as const)('rejects repeated %s expansion without returning a truncated result',async mode=>{
  if(mode==='dictionary')await database.prepare('INSERT INTO probe_dictionary VALUES(?,?,?,?,?)').bind('测','vp','X'.repeat(4096),'测',90000).run();
  try{
   const response=await send({text:'测'.repeat(512),names:mode==='private-name'?[{key:'测',value:'X'.repeat(256)}]:[]});
   expect(response.status).toBe(413);expect(await response.json()).toEqual({error:'output_limit'});
   expect(response.headers.get('X-Convert-Error')).toBe('output_limit');
   expect(response.headers.get('X-Convert-Reads')).toMatch(/^\d+$/);
  }finally{if(mode==='dictionary')await database.prepare('DELETE FROM probe_dictionary WHERE ordinal=90000').run();}
 });
 for(const storage of ['rows','packed'] as const)it(`SQL candidates preserve full-engine results and fail closed (${storage})`,async()=>{
  const sqlRuntime=new Miniflare(convertV4MiniflareOptions({modules:true,script:workerScript,compatibilityDate:'2026-01-01',d1Databases:['PROBE_DB'],bindings:{PROBE_STORAGE:storage,PROBE_SQL_CANDIDATES:'1'}}));
  try{
   const db=await sqlRuntime.getD1Database('PROBE_DB');const schema=await readFile(`experiments/server-convert/${storage==='packed'?'packed-schema':'schema'}.sql`,'utf8');for(const sql of schema.split(';').filter(s=>s.trim()))await db.prepare(sql).run();
   await db.prepare('INSERT INTO probe_metadata VALUES(1,32)').run();
   const rows:[DictKind,string,string][]=[...fixtures.filter(row=>row[0]!=='rules'),['vp','𠀀天','trời hiếm'],['vp','引"号','trích dẫn'],['vp','反\\斜','gạch chéo']];const complete=new LanguageEngine();
   for(const [ordinal,[kind,key,value]]of rows.entries()){
    complete.add(kind,`${key}=${value}`);const lookup=normalizeKey(kind==='names'||kind==='names2'?nameSourceKey(key):key),chars=[...lookup],id=((chars[0].codePointAt(0)??0)*31+(chars[1]?.codePointAt(0)??0))%4096;
    if(storage==='rows')await db.prepare('INSERT INTO probe_dictionary VALUES(?,?,?,?,?)').bind(key,kind,value,lookup,ordinal).run();
    else await db.prepare('INSERT INTO probe_buckets VALUES(?,?,?,?,?)').bind(id,ordinal,lookup,lookup,JSON.stringify({[lookup]:[[key,kind,value,ordinal]]})).run();
   }
   const request=(text:string,names:unknown[]=[])=>sqlRuntime.dispatchFetch('https://local-probe.invalid/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,names})});
   const candidateCount=(text:string,max:number)=>{const all=new Set<string>();for(const input of new Set([text,normalizeKey(text)])){const chars=[...input];for(let at=0;at<chars.length;at++){let key='';for(const char of chars.slice(at)){key+=char;if(key.length>max)break;all.add(key);}}}return all.size;};
   for(const text of ['林儿打开门。','林 ， 儿……\r\n未知','甲乙丙','𠀀天🙂','引"号反\\斜','完全未知']){
    const names=[{key:'$林儿',value:'Tiểu Lâm'}],response=await request(text,names);expect(response.status).toBe(200);const result=await response.json() as any;
    expect(result.tokens).toEqual(complete.convert(text,names,{reference:true,standardizePunctuation:true,capitalize:true}));expect(result.lookups).toEqual(result.tokens.filter((t:any)=>t.source.trim()).map((t:any)=>({source:t.source,...complete.lookup(t.source)})));expect(result.diagnostics.candidates).toBe(candidateCount(text,32));expect(result.diagnostics.candidateMode).toBe('sql');
   }
   for(const max of [1,2,3]){await db.prepare('UPDATE probe_metadata SET max_key_length=? WHERE id=1').bind(max).run();for(const text of ['🙂𠀀❄','🙂𠀀'])for(const names of [[],[{key:'🙂',value:'Nụ Cười'}]]){const response=await request(text,names);expect(response.status).toBe(200);const result=await response.json() as any;expect(result.diagnostics.candidates).toBe(candidateCount(text,max));expect(result.tokens).toEqual(complete.convert(text,names,{reference:true,standardizePunctuation:true,capitalize:true}));}}
   await db.prepare('UPDATE probe_metadata SET max_key_length=256 WHERE id=1').run();
   const overflow=await request(Array.from({length:200},(_,i)=>String.fromCodePoint(0x4e00+i)).join(''));expect(overflow.status).toBe(413);expect(await overflow.json()).toEqual({error:'candidate_limit'});
   await db.prepare('UPDATE probe_metadata SET max_key_length=32 WHERE id=1').run();
   const limitRows=Array.from({length:513},(_,i)=>{const ordinal=20000+i,lookup='测',id=lookup.codePointAt(0)!*31%4096;return storage==='rows'?db.prepare('INSERT INTO probe_dictionary VALUES(?,?,?,?,?)').bind(lookup,'vp','mẫu',lookup,ordinal):db.prepare('INSERT INTO probe_buckets VALUES(?,?,?,?,?)').bind(id,ordinal,lookup,lookup,JSON.stringify({[lookup]:[[lookup,'vp','mẫu',ordinal]]}));});
   for(let at=0;at<512;at+=100)await db.batch(limitRows.slice(at,Math.min(at+100,512)));
   const boundary=await request('测');expect(boundary.status).toBe(200);expect((await boundary.json() as any).diagnostics.loadedRows).toBe(512);
   await limitRows[512].run();const exceeded=await request('测');expect(exceeded.status).toBe(413);expect(await exceeded.json()).toEqual({error:'match_limit'});
   const ruleRows:[DictKind,string,string][]=[['rules','第{0}卷','新{0}'],['vp','新星','Nova']];
   for(const [index,[kind,key,value]]of ruleRows.entries()){const ordinal=10000+index,lookup=normalizeKey(key);complete.add(kind,`${key}=${value}`);if(storage==='rows')await db.prepare('INSERT INTO probe_dictionary VALUES(?,?,?,?,?)').bind(key,kind,value,lookup,ordinal).run();else if(kind==='rules')await db.prepare('INSERT INTO probe_rules VALUES(?,?,?,?,?)').bind(key,kind,value,lookup,ordinal).run();else{const chars=[...lookup],id=(chars[0].codePointAt(0)!*31+(chars[1]?.codePointAt(0)??0))%4096;await db.prepare('INSERT INTO probe_buckets VALUES(?,?,?,?,?)').bind(id,ordinal,lookup,lookup,JSON.stringify({[lookup]:[[key,kind,value,ordinal]]})).run();}}
   const ruleResult=await(await request('第星卷')).json() as any;expect(ruleResult.tokens).toEqual(complete.convert('第星卷',[],{reference:true,standardizePunctuation:true,capitalize:true}));expect(ruleResult.diagnostics.candidateMode).toBe('js');
  }finally{await sqlRuntime.dispose();}
 },30000);
 it('matches the existing engine for synthetic phrases, punctuation, rules, Unicode and private Names',async()=>{
  for(const text of ['林儿打开门。','中国人民。','第山章。','林儿😀，打开门！','林,儿','甲乙丙','\n林儿\n打开门。']){
   const names=[{key:'$林儿',value:'Tiểu Lâm'}];const response=await send({text,names});expect(response.status).toBe(200);const result=await response.json() as any;
   expect(result.tokens).toEqual(full.convert(text,names,{reference:true,standardizePunctuation:true,capitalize:true}));
   expect(result.lookups).toEqual(result.tokens.filter((t:any)=>t.source.trim()).map((t:any)=>({source:t.source,...full.lookup(t.source)})));
   expect(result.diagnostics.loadedRows).toBeLessThan(30);expect(result.diagnostics.queries).toBeGreaterThanOrEqual(3);expect(result.diagnostics.queries).toBeLessThanOrEqual(7);
  }
 });
 it('uses indexed candidate/rule queries instead of reading unrelated dictionary rows',async()=>{
  const result=await (await send({text:'林儿打开门。'})).json() as any;
  expect(result.diagnostics.rowsRead).toBeLessThan(1000);
  const explain=await database.prepare('EXPLAIN QUERY PLAN SELECT d.source_key,d.kind,d.value,d.ordinal FROM json_each(?) q CROSS JOIN probe_dictionary d ON d.lookup_key=q.value ORDER BY d.ordinal LIMIT ?').bind('["林儿"]',513).all();
  expect(JSON.stringify(explain.results)).toMatch(/PRIMARY KEY|INDEX/);
 });
 it('rejects oversized and malformed requests before querying the dictionary',async()=>{
  expect((await send({text:'甲'.repeat(513)})).status).toBe(400);
  expect((await send({text:'甲',names:[{key:'a=b',value:'x'}]})).status).toBe(400);
  expect((await runtime.dispatchFetch('https://local-probe.invalid/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(32769)})).status).toBe(413);
  expect((await runtime.dispatchFetch('https://local-probe.invalid/convert')).status).toBe(405);
 });
 it('bounds candidate generation and DB matches without truncating a successful translation',async()=>{
  await database.prepare('UPDATE probe_metadata SET max_key_length=256 WHERE id=1').run();
  const text=Array.from({length:200},(_,i)=>String.fromCharCode(0x4e00+i)).join('');
  expect((await send({text})).status).toBe(413);
  await database.prepare('UPDATE probe_metadata SET max_key_length=32 WHERE id=1').run();
 });
 it('records local round-trip evidence without claiming Cloudflare CPU or memory limits passed',async()=>{
  const timings:number[]=[];let diagnostics:unknown;
  for(let i=0;i<12;i++){const start=performance.now();const response=await send({text:'林儿打开门。中国人民。'.repeat(i<6?1:15)});expect(response.status).toBe(200);diagnostics=(await response.json() as any).diagnostics;timings.push(performance.now()-start);}
  await mkdir('.dsh-tmp/server-convert',{recursive:true});
  await writeFile('.dsh-tmp/server-convert/local-report.json',JSON.stringify({runtime:'local workerd + D1',dataset:'synthetic only',dictionaryRows:5014,localRoundTripMs:timings,diagnostics,cloudflareCpuMs:null,workerdPeakMemoryBytes:null,freeTierFit:'NOT VERIFIED',productionChanged:false},null,2));
 });
 it('retrieves rule-generated dependencies and matches the full engine',async()=>{
  const extra:[DictKind,string,string][]=[['rules','第{0}卷','新{0}'],['vp','新星','Nova']];
  try{
   for(let i=0;i<extra.length;i++){const [kind,key,value]=extra[i];await database.prepare('INSERT INTO probe_dictionary VALUES(?,?,?,?,?)').bind(key,kind,value,normalizeKey(key),10000+i).run();}
   const complete=new LanguageEngine();for(const [kind,key,value] of [...fixtures,...extra])complete.add(kind,`${key}=${value}`);
   const response=await send({text:'第星卷'});expect(response.status).toBe(200);
   const result=await response.json() as any;expect(result.tokens).toEqual(complete.convert('第星卷',[],{reference:true,standardizePunctuation:true,capitalize:true}));expect(result.diagnostics.queries).toBeGreaterThan(3);expect(result.diagnostics.queries).toBeLessThanOrEqual(7);
  }finally{await database.prepare('DELETE FROM probe_dictionary WHERE ordinal>=10000').run();}
 });
 it('packed rows preserve duplicate events, normalized collisions, rule dependencies and token lookups',async()=>{
  const packed=new Miniflare(convertV4MiniflareOptions({modules:true,script:workerScript,compatibilityDate:'2026-01-01',d1Databases:['PROBE_DB'],bindings:{PROBE_STORAGE:'packed'}}));
  try{
   const db=await packed.getD1Database('PROBE_DB'),schema=await readFile('experiments/server-convert/packed-schema.sql','utf8');for(const sql of schema.split(';').filter(s=>s.trim()))await db.prepare(sql).run();
   const extra:[DictKind,string,string][]=[['vp','秦，汉','Đầu'],['vp','秦,汉','Giữa'],['vp','秦，汉','Cuối'],['rules','第{0}卷','新{0}'],['vp','新星','Nova']];
   const complete=new LanguageEngine(),buckets=new Map<number,Record<string,unknown[]>>();
   for(const [ordinal,[kind,key,value]] of [...fixtures,...extra].entries()){
    complete.add(kind,`${key}=${value}`);const lookup=normalizeKey(kind==='names'||kind==='names2'?nameSourceKey(key):key),chars=[...lookup],id=((chars[0].codePointAt(0)??0)*31+(chars[1]?.codePointAt(0)??0))%4096;
    const payload=buckets.get(id)??Object.create(null) as Record<string,unknown[]>;buckets.set(id,payload);(payload[lookup]??=[]).push([key,kind,value,ordinal]);
    if(kind==='rules')await db.prepare('INSERT INTO probe_rules VALUES(?,?,?,?,?)').bind(key,kind,value,lookup,ordinal).run();
   }
   for(const [id,payload] of buckets)for(const [page,key] of Object.keys(payload).entries())await db.prepare('INSERT INTO probe_buckets VALUES(?,?,?,?,?)').bind(id,page,key,key,JSON.stringify({[key]:payload[key]})).run();
   await db.prepare('INSERT INTO probe_metadata VALUES(1,32)').run();
   for(const text of ['林儿打开门。','林,儿','甲乙丙','秦,汉','第星卷','林儿😀打开门。']){
    const response=await packed.dispatchFetch('https://local-probe.invalid/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});expect(response.status).toBe(200);const result=await response.json() as any;
    expect(result.tokens).toEqual(complete.convert(text,[],{reference:true,standardizePunctuation:true,capitalize:true}));
    expect(result.lookups).toEqual(result.tokens.filter((t:any)=>t.source.trim()).map((t:any)=>({source:t.source,...complete.lookup(t.source)})));
    expect(result.diagnostics.queries).toBeLessThanOrEqual(7);
   }
  }finally{await packed.dispose();}
 },30000);
});
