import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {D1Database} from '@cloudflare/workers-types';
import {capcutVietnameseVoices} from '../src/shared/constants/capcut-voices';
import {handleCapcutTts,type CapcutTtsEnv} from '../server/capcut-tts';
const origin='https://reader.invalid',cdn='https://audio.ibytedtos.com/fixture.mp3';
const bytes=new Uint8Array(readFileSync(new URL('./fixtures/tts-continuous.mp3',import.meta.url)));
const secret=JSON.stringify({cookie:'sessionid=synthetic-owned-session',deviceId:'12345678',tdid:'98765'});
let native:DatabaseSync,env:CapcutTtsEnv;
beforeEach(()=>{
  native=new DatabaseSync(':memory:');native.exec(readFileSync(new URL('../migrations/0001_auth.sql',import.meta.url),'utf8'));
  const db={prepare(sql:string){let args:unknown[]=[];return {bind(...values:unknown[]){args=values;return this;},async first(){return native.prepare(sql).get(...args as any[])??null;},async run(){native.prepare(sql).run(...args as any[]);return {success:true};}};}} as unknown as D1Database;
  env={DB:db,CAPCUT_SESSION_JSON:secret};
});
afterEach(()=>{native.close();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
function request(body:unknown={text:'Xin chào.',voice:'BV074_streaming'},headers:Record<string,string>={}){return new Request(origin+'/api/tts',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.17',...headers},body:JSON.stringify(body)});}
function upstream(url=cdn){return Response.json({ret:'0',data:{tts_materials:[{meta_data:{url}}]}});}
function audio(){return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});}
function setup(){return vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(upstream()).mockResolvedValueOnce(audio()));}
it.each(capcutVietnameseVoices.map(v=>[v.serverId,v.resource]))('maps %s to its exact resource and returns validated audio',async(voice,resource)=>{
  setup();const response=await handleCapcutTts(request({text:'Xin chào.',voice}),env);expect(response.status).toBe(200);
  const result=await response.json() as {success:boolean;data:string};expect(result.success).toBe(true);expect(Buffer.from(result.data,'base64')).toEqual(Buffer.from(bytes));
  const calls=vi.mocked(fetch).mock.calls;expect(calls).toHaveLength(2);expect(calls[0][0]).toBe('https://edit-api-sg.capcut.com/storyboard/v1/tts/multi_platform');
  const init=calls[0][1]!;expect(init.redirect).toBe('manual');expect(init.signal).toBeInstanceOf(AbortSignal);expect(new Headers(init.headers).get('Cookie')).toBe('sessionid=synthetic-owned-session');
  expect(JSON.parse(init.body as string)).toMatchObject({texts:['Xin chào.'],tts_conf:{speaker:voice,effect_id:resource,resource_id:resource,rate:1}});
  expect(new Headers(calls[1][1]?.headers).get('Cookie')).toBeNull();expect(response.headers.get('Set-Cookie')).toBeNull();expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('rejects non-POST and cross-origin requests before admission or upstream',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  expect((await handleCapcutTts(new Request(origin+'/api/tts'),env)).status).toBe(405);
  const scenarios:Record<string,string>[]=[{Origin:'https://attacker.invalid'},{'Sec-Fetch-Site':'cross-site'},{Origin:''}];
  for(const headers of scenarios)expect((await handleCapcutTts(request(undefined,headers),env)).status).toBe(403);
  expect((await handleCapcutTts(request(undefined,{'Content-Type':'text/plain'}),env)).status).toBe(415);expect(f).not.toHaveBeenCalled();
});
it.each([{text:'',voice:'BV074_streaming'},{text:'a'.repeat(201),voice:'BV074_streaming'},{text:'\ud800',voice:'BV074_streaming'},{text:'hello',voice:'constructor'},{text:'hello',voice:'BV074_streaming',cookie:'client-supplied'},{text:'a\u0000b',voice:'BV074_streaming'}])('rejects unsafe or unsupported client input %#',async body=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);expect((await handleCapcutTts(request(body),env)).status).toBe(400);expect(f).not.toHaveBeenCalled();
});
it('enforces bounded request bodies even without Content-Length',async()=>{
  expect((await handleCapcutTts(request({text:'a'.repeat(5000),voice:'BV074_streaming'}),env)).status).toBe(413);
});
it('admission is shared SQLite state and expiry cleanup preserves unrelated auth records',async()=>{
  native.prepare('INSERT INTO login_limits VALUES (?,?,?)').run('unrelated-login',1,0);
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async url=>String(url).includes('multi_platform')?upstream():audio()));
  for(let i=0;i<30;i++)expect((await handleCapcutTts(request(),env)).status).toBe(200);
  const response=await handleCapcutTts(request(),env);expect(response.status).toBe(429);expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);expect(fetch).toHaveBeenCalledTimes(60);
  expect(native.prepare('SELECT attempts FROM login_limits WHERE bucket=?').get('unrelated-login')).toEqual({attempts:1});
});
it('fails closed for missing session or DB and does not expose secret contents',async()=>{
  vi.stubGlobal('fetch',vi.fn());expect((await handleCapcutTts(request(),{DB:env.DB})).status).toBe(503);
  expect((await handleCapcutTts(request(),{CAPCUT_SESSION_JSON:secret})).status).toBe(503);
  const response=await handleCapcutTts(request(),{...env,CAPCUT_SESSION_JSON:JSON.stringify({cookie:'sessionid=do-not-echo\r\nX:test',deviceId:'1'})});expect(await response.text()).not.toContain('do-not-echo');expect(fetch).not.toHaveBeenCalled();
});
it.each([401,403,429,500,307])('sanitizes upstream HTTP %i without following redirects or leaking sessions',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private upstream response',{status,headers:{Location:'https://attacker.invalid','Set-Cookie':'sessionid=new-private-secret'}})));
  const response=await handleCapcutTts(request(),env);expect(response.status).toBe(status===401?401:status===403?403:status===429?429:502);expect(await response.text()).not.toMatch(/private|attacker|sessionid/);expect(fetch).toHaveBeenCalledTimes(1);
});
it('recognizes application login failure but does not forward its message',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ret:'1001',errmsg:'check login error; private credential'})));
  const response=await handleCapcutTts(request(),env);expect(response.status).toBe(401);expect(await response.json()).toEqual({success:false,error:'capcut_session_expired'});
});
it('stops on business rejection instead of creating a duplicate alternate task',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ret:'7',errmsg:'unsupported voice'})));expect((await handleCapcutTts(request(),env)).status).toBe(422);expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([new Response('not mp3',{headers:{'Content-Type':'audio/mpeg'}}),new Response(bytes,{status:302,headers:{Location:'https://attacker.invalid'}}),new Response('bad',{headers:{'Content-Type':'text/html'}})])('rejects untrusted audio %#',async response=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(upstream()).mockResolvedValueOnce(response));expect((await handleCapcutTts(request(),env)).status).toBe(502);
});
it('deadline and explicit cancellation abort a pending upstream request',async()=>{
  vi.useFakeTimers();let signal:AbortSignal|undefined;vi.stubGlobal('fetch',vi.fn().mockImplementation((_url,init)=>{signal=init.signal;return new Promise(()=>{});}));
  const pending=handleCapcutTts(request(),env);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));await vi.advanceTimersByTimeAsync(20001);expect((await pending).status).toBe(504);expect(signal?.aborted).toBe(true);
  const controller=new AbortController(),r=request();const pending2=handleCapcutTts(new Request(r,{signal:controller.signal}),env);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));controller.abort();expect((await pending2).status).toBe(504);
});

it('preserves the real web tdid in the signed upstream headers',async()=>{setup();env.CAPCUT_SESSION_JSON=JSON.stringify({cookie:'sessionid=synthetic-owned-session',deviceId:'12345678',tdid:'web',appVersion:'15.4.0'});expect((await handleCapcutTts(request(),env)).status).toBe(200);expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('tdid')).toBe('web');});
it.each(['WEB','web\r\nX:bad','other','web ','x'.repeat(33)])('rejects unrecognized server tdid tokens %#',async tdid=>{vi.stubGlobal('fetch',vi.fn());env.CAPCUT_SESSION_JSON=JSON.stringify({cookie:'sessionid=synthetic-owned-session',deviceId:'123',tdid});expect((await handleCapcutTts(request(),env)).status).toBe(503);expect(fetch).not.toHaveBeenCalled();});
