import 'fake-indexeddb/auto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import type {D1Database} from '@cloudflare/workers-types';
import {db} from '../src/core/db';
import {AI_DEFAULTS,aiBookSettingsKey} from '../src/features/ai/services/ai-reading';
import {getPromptStock,savePromptProfile,selectPromptProfile,deletePromptProfile,PROMPT_STOCK_KEY} from '../src/features/ai/prompt/prompt-stock';
import {syncPromptStock,getPromptSyncStatus,getPromptConflicts,resolvePromptConflict,PROMPT_SYNC_KEY} from '../src/features/ai/prompt/prompt-sync';
import {handleSharedPrompts} from '../server/shared-prompts';

const make=(id='p',title='Profile',bookId?:string)=>({id,title,...(bookId?{bookId}:{}),settings:{...AI_DEFAULTS,systemPrompt:title},updatedAt:1});
class NativeD1 {
 native=new DatabaseSync(':memory:');
 constructor(){this.native.exec(readFileSync(new URL('../migrations/0009_shared_prompts.sql',import.meta.url),'utf8'));}
 prepare(sql:string){const native=this.native;let params:any[]=[];return {sql,bind(...next:any[]){params=next;return this;},execute(){const statement=native.prepare(sql);return {results:statement.columns().length?statement.all(...params):(statement.run(...params),[]),success:true};}};}
 async batch(statements:ReturnType<NativeD1['prepare']>[]){this.native.exec('BEGIN');try{const result=statements.map(s=>s.execute());this.native.exec('COMMIT');return result;}catch(error){this.native.exec('ROLLBACK');throw error;}}
 close(){this.native.close();}
}
let server:NativeD1;
const request=(id:string,profile:unknown,baseRevision=0)=>new Request('https://test/api/prompts',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,profile,baseRevision})});
const handle=(r:Request)=>handleSharedPrompts(r,{DB:server as unknown as D1Database});
beforeEach(async()=>{await db.settings.clear();server=new NativeD1();});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();server.close();});
function connect(){return vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>handle(new Request(`https://test${url}`,init))));}

describe('independent native SQLite CAS regression',()=>{
 it('serializes same-base updates, and stale updates cannot resurrect a tombstone',async()=>{
  const inserted=await (await handle(request('p',make()))).json();const revision=inserted.row.revision;
  const [deleted,stale]=await Promise.all([handle(request('p',null,revision)),handle(request('p',make('p','stale'),revision))]);
  expect(deleted.status).toBe(200);expect(stale.status).toBe(409);expect((await stale.json()).row.profile).toBeNull();
  expect((await handle(request('p',make('p','new'),0))).status).toBe(409);
 });
 it('retains scope on direct update and rejects reserved prototype identifiers',async()=>{
  const saved=await (await handle(request('p',make('p','Book','a')))).json();
  expect((await handle(request('p',make('p','Changed','b'),saved.row.revision))).status).toBe(413);
  expect((await (await handle(new Request('https://test/api/prompts'))).json()).rows[0].profile.bookId).toBe('a');
  for(const id of ['__proto__','prototype','constructor','default'])expect((await handle(request(id,make(id)))).status).toBe(400);
 });
 it('bounds body, requires JSON, rejects method and malformed schema without creating rows',async()=>{
  expect((await handle(new Request('https://test/api/prompts',{method:'DELETE'}))).status).toBe(405);
  expect((await handle(new Request('https://test/api/prompts',{method:'PUT',body:'{}'}))).status).toBe(415);
  expect((await handle(request('p',make('different')))).status).toBe(400);
  expect((await handle(request('p',{...make(),settings:{...AI_DEFAULTS,temperature:2}}))).status).toBe(400);
  expect((await handle(new Request('https://test/api/prompts',{method:'PUT',headers:{'Content-Type':'application/json'},body:'x'.repeat(98305)}))).status).toBe(400);
  expect((await handle(new Request('https://test/api/prompts?after=-1'))).status).toBe(400);
  expect((await (await handle(new Request('https://test/api/prompts'))).json()).rows).toEqual([]);
 });
 it('rolls back metadata revision if a batch write errors',async()=>{
  server.native.exec("CREATE TRIGGER reject_write BEFORE INSERT ON shared_prompts BEGIN SELECT RAISE(ABORT,'fail'); END");
  expect((await handle(request('p',make()))).status).toBe(503);
  expect((await (await handle(new Request('https://test/api/prompts'))).json()).revision).toBe(0);
 });
 it('returns a cursor and rows from one batch, delivering updates and deletions after cursor',async()=>{
  await handle(request('p',make()));const first=await (await handle(new Request('https://test/api/prompts'))).json();
  await handle(request('p',null,first.rows[0].revision));await handle(request('q',make('q')));
  const next=await (await handle(new Request(`https://test/api/prompts?after=${first.revision}`))).json();
  expect(next.rows.map((r:any)=>[r.id,r.profile===null])).toEqual([['p',true],['q',false]]);expect(next.rows.every((r:any)=>r.revision<=next.revision)).toBe(true);
 });
});

describe('independent client preservation regression',()=>{
 it('keeps local data while offline and while malformed remote rejects',async()=>{
  const local=await savePromptProfile({title:'Local',settings:{...AI_DEFAULTS}});const before=await getPromptStock();
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));await syncPromptStock();expect(await getPromptStock()).toEqual(before);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({revision:2,rows:[{id:'__proto__',revision:2,profile:make('__proto__')}]})));await syncPromptStock();
  expect(await getPromptStock()).toEqual(before);expect(await db.settings.get(PROMPT_SYNC_KEY)).toBeUndefined();expect(local.id).toBeTruthy();
 });
 it('preserves a local edit during PUT acknowledgement and sends it on the next sync',async()=>{
  const p=await savePromptProfile({title:'Original',settings:{...AI_DEFAULTS}});let edited=false;
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
   const response=await handle(new Request(`https://test${url}`,init));if(init?.method==='PUT'&&!edited){edited=true;await savePromptProfile({...p,title:'New local'});}return response;
  }));
  await syncPromptStock();expect((await getPromptStock()).profiles.find(v=>v.id===p.id)?.title).toBe('New local');expect(getPromptSyncStatus().state).toBe('local');
  await syncPromptStock();expect(getPromptSyncStatus().state).toBe('synced');expect((await (await handle(new Request('https://test/api/prompts'))).json()).rows[0].profile.title).toBe('New local');
 });
 it('keeps conflict until explicit resolution and shared deletion clears selection only without overriding manual settings',async()=>{
  connect();const p=await savePromptProfile({title:'First',settings:{...AI_DEFAULTS}});await selectPromptProfile('a',p.id);await selectPromptProfile('b',p.id);await syncPromptStock();
  const base=(await (await handle(new Request('https://test/api/prompts'))).json()).rows[0];
  await db.settings.put({key:aiBookSettingsKey('b'),value:{...(await db.settings.get(aiBookSettingsKey('b')))!.value as object,systemPrompt:'Manual'}});
  await savePromptProfile({...p,title:'Local edit'});await handle(request(p.id,null,base.revision));await syncPromptStock();
  expect(await getPromptConflicts()).toHaveLength(1);expect((await getPromptStock()).profiles.find(v=>v.id===p.id)?.title).toBe('Local edit');
  await resolvePromptConflict(p.id,'shared');expect((await getPromptStock()).profiles.some(v=>v.id===p.id)).toBe(false);
  expect((await db.settings.get(aiBookSettingsKey('a')))!.value).toMatchObject({chosenProfileId:'default'});
  expect((await db.settings.get(aiBookSettingsKey('b')))!.value).toEqual({...AI_DEFAULTS,systemPrompt:'Manual'});
 });
 it('local conflict resolution uses fresh tombstone revision and explicitly restores current local content',async()=>{
  connect();const p=await savePromptProfile({title:'First',settings:{...AI_DEFAULTS}});await syncPromptStock();const base=(await (await handle(new Request('https://test/api/prompts'))).json()).rows[0];
  await savePromptProfile({...p,title:'Local edit'});await handle(request(p.id,null,base.revision));await syncPromptStock();await resolvePromptConflict(p.id,'local');
  expect(await getPromptConflicts()).toHaveLength(0);expect(getPromptSyncStatus().state).toBe('synced');expect((await (await handle(new Request('https://test/api/prompts'))).json()).rows[0].profile.title).toBe('Local edit');
 });
 it('local deletion during pending create remains pending then sends tombstone',async()=>{
  const p=await savePromptProfile({title:'First',settings:{...AI_DEFAULTS}});let deleted=false;
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{const response=await handle(new Request(`https://test${url}`,init));if(init?.method==='PUT'&&!deleted){deleted=true;await deletePromptProfile(p.id);}return response;}));
  await syncPromptStock();expect(getPromptSyncStatus().state).toBe('local');await syncPromptStock();expect(getPromptSyncStatus().state).toBe('synced');expect((await (await handle(new Request('https://test/api/prompts'))).json()).rows[0].profile).toBeNull();
 });
 it('a fresh client can consume every live row allowed by server capacity',async()=>{
  const insert=server.native.prepare('INSERT INTO shared_prompts(id,profile,revision,deleted) VALUES(?,?,?,0)');
  for(let i=0;i<499;i++)insert.run(`p${i}`,JSON.stringify(make(`p${i}`)),i+1);server.native.exec('UPDATE prompt_sync_meta SET revision=499');
  expect((await handle(request('last',make('last')))).status).toBe(413);connect();await syncPromptStock();
  expect(getPromptSyncStatus().state).toBe('synced');expect((await getPromptStock()).profiles).toHaveLength(500);
 });
 it('an accepted identifier matching an Object method still allows local edits to sync',async()=>{
  expect((await handle(request('toString',make('toString')))).status).toBe(200);connect();await syncPromptStock();
  const p=(await getPromptStock()).profiles.find(p=>p.id==='toString')!;await savePromptProfile({...p,title:'Edited'});await syncPromptStock();
  expect(getPromptSyncStatus().state).toBe('synced');expect((await (await handle(new Request('https://test/api/prompts'))).json()).rows[0].profile.title).toBe('Edited');
 });
});
