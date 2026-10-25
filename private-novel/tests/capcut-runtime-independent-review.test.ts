import {afterAll,beforeAll,expect,it} from 'vitest';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mergeCapcutCookies} from '../server/capcut-session';

const initial='sessionid=synthetic-bootstrap; passport_csrf_token=csrf-before';
const rotated='sessionid=synthetic-rotated; passport_csrf_token=csrf-after';
const bootstrap=JSON.stringify({cookie:initial,deviceId:'12345',tdid:'web'});
let runtime:Miniflare,db:Awaited<ReturnType<Miniflare['getD1Database']>>,mode='rotate';
let releaseStale:(()=>void)|undefined,enterStale:(()=>void)|undefined;
const calls:{url:string;cookie:string|null}[]=[];
const post=()=>runtime.dispatchFetch('https://reader.invalid/api/tts',{method:'POST',headers:{Origin:'https://reader.invalid','Content-Type':'application/json'},body:JSON.stringify({text:'Synthetic review.',voice:'BV074_streaming'})});

beforeAll(async()=>{
 const script=(await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import {handleCapcutTts} from './server/capcut-tts';export default {fetch(request,env){return handleCapcutTts(request,env)}};`},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-01-01',bindings:{CAPCUT_SESSION_JSON:bootstrap,CAPCUT_SESSION_PERSISTENCE:'1'},d1Databases:['DB'],outboundService:async request=>{
  calls.push({url:request.url,cookie:request.headers.get('Cookie')});
  if(request.url.includes('/multi_platform')){
   if(mode==='hold-expired'){enterStale?.();await new Promise<void>(resolve=>{releaseStale=resolve;});return new Response('synthetic expired old request',{status:401});}
   if(mode==='expired')return new Response('private upstream cookie details',{status:401});
   if(mode==='denied')return new Response('private upstream cookie details',{status:403});
   const headers=new Headers({'Content-Type':'application/json'});
   if(mode==='rotate'){
    headers.append('Set-Cookie','sessionid=synthetic-rotated; Domain=.capcut.com; Path=/; Secure; HttpOnly');
    headers.append('Set-Cookie','passport_csrf_token=csrf-after; Path=/storyboard; Secure');
   }
   return new Response(JSON.stringify({ret:0,data:{tts_materials:[{meta_data:{url:'https://audio.ibytedtos.com/fixture.mp3'}}]}}),{headers});
  }
  return new Response(new Uint8Array([73,68,51,0,0,0,0,0,0,0]),{headers:{'Content-Type':'audio/mpeg'}});
 }}));
 db=await runtime.getD1Database('DB');
 for(const path of ['migrations/0001_auth.sql','migrations/0015_capcut_runtime_session.sql'])for(const sql of (await readFile(path,'utf8')).replace(/--[^\n]*/g,'').split(';').filter(p=>p.trim()))await db.prepare(sql).run();
},30000);
afterAll(async()=>{releaseStale?.();await runtime?.dispose();});

it('workerd/D1 rotates encrypted credentials, omits CDN cookies, and separates403 from expiry with shared backoff',async()=>{
 mode='hold-expired';const entered=new Promise<void>(resolve=>{enterStale=resolve;});const stale=post();await entered;
 mode='rotate';
 const first=await post();expect(first.status).toBe(200);expect(first.headers.get('Set-Cookie')).toBeNull();
 releaseStale?.();expect((await stale).status).toBe(401);
 const row=await db.prepare('SELECT * FROM capcut_runtime_session').first<{sealed:string;bootstrap:string;revision:number;blocked_until:number}>();
 expect(row).toMatchObject({revision:1,blocked_until:0});expect(row!.sealed).not.toContain('synthetic');expect(row!.bootstrap).not.toContain('synthetic');
 expect(calls[0].cookie).toBe(initial);expect(calls[1].cookie).toBe(initial);expect(calls[2].cookie).toBeNull();
 mode='denied';const denied=await post();expect(denied.status).toBe(403);expect(await denied.text()).not.toMatch(/private|sessionid/);
 expect(calls[3].cookie).toBe(rotated);expect(await db.prepare('SELECT revision,blocked_until FROM capcut_runtime_session').first()).toEqual({revision:1,blocked_until:0});
 mode='success';expect((await post()).status).toBe(200);
 mode='expired';const expired=await post();expect(expired.status).toBe(401);expect(await expired.text()).not.toMatch(/private|sessionid/);
 const before=calls.length;expect((await post()).status).toBe(401);expect(calls).toHaveLength(before);
 const blocked=await db.prepare('SELECT revision,blocked_until FROM capcut_runtime_session').first<{revision:number;blocked_until:number}>();expect(blocked!.revision).toBe(2);expect(blocked!.blocked_until).toBeGreaterThan(Date.now());
 // Tampering fails closed and never retries the bootstrap or sends ciphertext.
 await db.prepare("UPDATE capcut_runtime_session SET sealed='tampered',blocked_until=0").run();expect((await post()).status).toBe(503);expect(calls).toHaveLength(before);
},30000);

it.each([
 ['sessionid=attacker; Domain=attacker.invalid; Path=/'],
 ['sessionid=wrongpath; Path=/elsewhere'],
 ['sessionid=nearpath; Path=/story'],
 ['unrecognized=new; Path=/'],
 ['sessionid='+ 'x'.repeat(8192)],
])('rejects out-of-scope or oversized Set-Cookie %#',value=>{
 const headers=new Headers();headers.append('Set-Cookie',value);expect(mergeCapcutCookies(initial,headers)).toBe(initial);
});
it('honors valid expiry/deletion without invalidating the remaining session cookie',()=>{
 const headers=new Headers();headers.append('Set-Cookie','passport_csrf_token=; Max-Age=0; Path=/');expect(mergeCapcutCookies(initial,headers)).toBe('sessionid=synthetic-bootstrap');
});
