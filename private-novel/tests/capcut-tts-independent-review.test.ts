import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {handleCapcutTts,type CapcutTtsEnv} from '../server/capcut-tts';
import {capcutMd5} from '../server/capcut-md5';

const secret='sessionid=synthetic-owner-session; sid_tt=synthetic-sid';
const env:CapcutTtsEnv={CAPCUT_SESSION_JSON:JSON.stringify({cookie:secret,deviceId:'123456789'})};
function database(first=async()=>({attempts:1})){
 const statement={bind:()=>statement,first,run:async()=>({success:true})};
 return {prepare:()=>statement} as unknown as NonNullable<CapcutTtsEnv['DB']>;
}
function request(body=JSON.stringify({text:'Xin chào.',voice:'BV074_streaming'})){
 return new Request('https://synthetic.example/api/tts',{method:'POST',headers:{Origin:'https://synthetic.example','Content-Type':'application/json',Cookie:'browser-cookie=do-not-forward',Authorization:'Bearer do-not-forward',Referer:'https://synthetic.example/private-chapter','X-Client-Marker':'do-not-forward'},body});
}
function synthesis(url='https://audio.byteoversea.com/synthetic.mp3'){
 return new Response(JSON.stringify({ret:0,data:{tts_materials:[{meta_data:{url}}]}}),{headers:{'Content-Type':'application/json'}});
}
const mp3=Uint8Array.from([0xff,0xf3,0xe4,0xc4,1,2,3,4]);
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('matches independently computed MD5 at padding boundaries and on UTF-8 input',()=>{
 for(const value of ['','Tiếng Việt 😀 中文',...[1,55,56,63,64,65,127,128,129].map(n=>'x'.repeat(n))]){
  expect(capcutMd5(value)).toBe(createHash('md5').update(value,'utf8').digest('hex'));
 }
});

it('bounds a stalled admission query by the whole request deadline',async()=>{
 vi.useFakeTimers();let entered=false,release!:(value:{attempts:number})=>void;
 const db=database(()=>{entered=true;return new Promise(resolve=>{release=resolve;});});
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 let response:Response|undefined;const pending=handleCapcutTts(request(),{...env,DB:db}).then(result=>{response=result;return result;});
 try{
  await vi.waitFor(()=>expect(entered).toBe(true));
  await vi.advanceTimersByTimeAsync(20000);
  expect(response?.status).toBe(504);expect(await response!.json()).toEqual({success:false,error:'tts_timeout'});
  expect(fetcher).not.toHaveBeenCalled();
 }finally{release?.({attempts:1});await pending;}
});

it.each(['{','[]','null','"text"'])('rejects malformed client JSON %s as a permanent client error',async body=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const response=await handleCapcutTts(request(body),{...env,DB:database()});
 expect(response.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();expect(await response.text()).not.toContain(secret);
});

it('sends only the owned session to fixed synthesis and no credentials to CDN',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(synthesis()).mockResolvedValueOnce(new Response(mp3,{headers:{'Content-Type':'audio/mpeg'}}));
 vi.stubGlobal('fetch',fetcher);
 const response=await handleCapcutTts(request(),{...env,DB:database()});
 expect(response.status).toBe(200);expect(fetcher).toHaveBeenCalledTimes(2);
 const [upstream,init]=fetcher.mock.calls[0] as [string,RequestInit];const headers=new Headers(init.headers);
 expect(upstream).toBe('https://edit-api-sg.capcut.com/storyboard/v1/tts/multi_platform');
 expect(headers.get('Cookie')).toBe(secret);expect(headers.has('Authorization')).toBe(false);
 const [,cdn]=fetcher.mock.calls[1] as [string,RequestInit];const cdnHeaders=new Headers(cdn.headers);
 // Workers RequestInit has no browser credentials mode. Check the outbound
 // security boundary directly: no incoming or session authentication headers.
 expect(cdn.redirect).toBe('manual');
 for(const name of ['Cookie','Authorization','Origin','Referer','X-Client-Marker','sign','did'])expect(cdnHeaders.has(name)).toBe(false);
 const body=await response.text();expect(body).not.toContain(secret);expect(body).not.toContain('synthetic-owner-session');
});

it.each([
 'https://audio.byteoversea.com.attacker.example/a.mp3',
 'https://attackerbyteoversea.com/a.mp3',
 'http://audio.byteoversea.com/a.mp3',
 'https://audio.byteoversea.com:444/a.mp3',
 'https://user:password@audio.byteoversea.com/a.mp3',
 'https://audio.byteoversea.com/a.mp3#fragment',
 'https://127.0.0.1/a.mp3',
 'https://[::1]/a.mp3'
])('rejects unsafe CDN target %s before a second network call',async url=>{
 const fetcher=vi.fn().mockResolvedValue(synthesis(url));vi.stubGlobal('fetch',fetcher);
 const response=await handleCapcutTts(request(),{...env,DB:database()});
 expect(response.status).toBe(502);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await response.json()).toEqual({success:false,error:'capcut_invalid_audio_url'});
});

it('does not follow an allowed CDN redirect or reflect its redirect location',async()=>{
 const location='https://attacker.example/private?session=synthetic-leak';
 const fetcher=vi.fn().mockResolvedValueOnce(synthesis()).mockResolvedValueOnce(new Response(null,{status:302,headers:{Location:location}}));vi.stubGlobal('fetch',fetcher);
 const response=await handleCapcutTts(request(),{...env,DB:database()});
 expect(response.status).toBe(502);expect(fetcher).toHaveBeenCalledTimes(2);expect(await response.text()).not.toContain(location);
});
