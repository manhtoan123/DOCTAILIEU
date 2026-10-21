import {afterEach,it,expect,vi} from 'vitest';
import {TikTokPlayer,tiktokVoices,sentences,type SpeechState} from '../src/features/tts/services/tts';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
const options={rate:1.4,pitch:1,flex:0};
const mp3=btoa(String.fromCharCode(0xff,0xf3,0xe4,0xc4,1,2,3,4));
const response=(data:unknown={success:true,data:mp3},headers:Record<string,string>={})=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json',...headers}});
function setup(fetcher=vi.fn().mockImplementation(async()=>response())){
  const states:SpeechState[]=[];const errors:string[]=[];const audios:FakeAudio[]=[];const ended=vi.fn();
  class FakeAudio {
    playbackRate=1;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;
    play=vi.fn().mockResolvedValue(undefined);pause=vi.fn();removeAttribute=vi.fn();load=vi.fn();
    constructor(public src:string){audios.push(this);}
  }
  vi.stubGlobal('fetch',fetcher);vi.stubGlobal('Audio',FakeAudio);
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:synthetic');const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  const player=new TikTokPlayer((state,_sentence,message)=>{states.push(state);if(message)errors.push(message);},ended);
  return {player,fetcher,states,errors,audios,create,revoke,ended};
}
async function playing(p:ReturnType<typeof setup>){await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));}
it('automatically retries the same sentence after repeated gateway failure',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response('',{status:503})).mockImplementation(async()=>response());const p=setup(fetcher);
 p.player.start('Xin chào.',tiktokVoices[0],options);await vi.advanceTimersByTimeAsync(600);
 expect(p.states.at(-1)).toBe('loading');expect(p.errors[0]).toContain('Tự thử lại');expect(p.player.position().offset).toBe(0);
 await vi.advanceTimersByTimeAsync(2000);expect(p.states.at(-1)).toBe('playing');expect(fetcher).toHaveBeenCalledTimes(3);expect(fetcher.mock.calls[2][1].body).toBe(fetcher.mock.calls[0][1].body);p.player.stop();
});
it('refetches corrupt gateway audio and only publishes the validated replacement',async()=>{
 vi.useFakeTimers();const p=setup(vi.fn().mockResolvedValueOnce(response({success:true,data:'%%%='})).mockImplementation(async()=>response()));
 p.player.start('Test.',tiktokVoices[0],options);await vi.advanceTimersByTimeAsync(0);expect(p.create).not.toHaveBeenCalled();expect(p.states.at(-1)).toBe('loading');
 await vi.advanceTimersByTimeAsync(2000);expect(p.states.at(-1)).toBe('playing');expect(p.create).toHaveBeenCalledTimes(1);p.player.stop();
});
it.each(['pause','stop'] as const)('%s cancels automatic recovery without restarting playback',async action=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response('',{status:503})).mockImplementation(async()=>response());const p=setup(fetcher);
 p.player.start('Test.',tiktokVoices[0],options);await vi.advanceTimersByTimeAsync(600);p.player[action]();await vi.advanceTimersByTimeAsync(60000);
 expect(fetcher).toHaveBeenCalledTimes(2);expect(p.states.at(-1)).toBe(action==='stop'?'idle':'paused');p.player.stop();
});
it('audio recovery retains the current offset and media time instead of restarting the chapter',async()=>{
 vi.useFakeTimers();const p=setup();p.player.start('First.Second.',tiktokVoices[0],options);await vi.advanceTimersByTimeAsync(0);
 p.audios[0].onended!();await vi.advanceTimersByTimeAsync(0);Object.assign(p.audios[0],{currentTime:2.5});p.audios[0].onerror!();
 expect(p.player.position()).toEqual({offset:6,audioTime:2.5});await vi.advanceTimersByTimeAsync(2000);
 expect(p.states.at(-1)).toBe('playing');expect(p.player.position()).toEqual({offset:6,audioTime:2.5});expect(p.ended).not.toHaveBeenCalled();p.player.stop();
});
it('429 recovery respects Retry-After and waits for connection without making requests',async()=>{
 vi.useFakeTimers();vi.stubGlobal('navigator',{onLine:false});const p=setup(vi.fn().mockResolvedValueOnce(new Response('',{status:429,headers:{'Retry-After':'10'}})).mockImplementation(async()=>response()));
 p.player.start('Test.',tiktokVoices[0],options);await vi.advanceTimersByTimeAsync(9000);expect(p.fetcher).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(3000);expect(p.fetcher).toHaveBeenCalledTimes(1);vi.stubGlobal('navigator',{onLine:true});await vi.advanceTimersByTimeAsync(1000);
 expect(p.states.at(-1)).toBe('playing');expect(p.fetcher).toHaveBeenCalledTimes(2);p.player.stop();
});
it('does not loop when autoplay permission is denied',async()=>{
 vi.useFakeTimers();const p=setup();p.player.start('Test.',tiktokVoices[0],options);await vi.advanceTimersByTimeAsync(0);p.player.pause();p.audios[0].play.mockRejectedValueOnce(new DOMException('Permission required','NotAllowedError'));p.player.resume();await vi.advanceTimersByTimeAsync(60000);
 expect(p.states.at(-1)).toBe('error');expect(p.fetcher).toHaveBeenCalledTimes(1);p.player.stop();
});
it('recovers a long HTTP500 chunk with bounded smaller chunks and exact offsets',async()=>{
 const texts:string[]=[];const p=setup(vi.fn().mockImplementation(async(_url:string,init:RequestInit)=>{const {text}=JSON.parse(init.body as string);texts.push(text);return Array.from(text).length>100?new Response('',{status:500}):response();}));
 const text='a'.repeat(180)+'.';p.player.start(text,tiktokVoices[0],options);await playing(p);expect(texts.slice(0,2)).toEqual([text,text]);expect(texts.slice(2).join('')).toBe(text);expect(texts.slice(2).every(t=>Array.from(t).length<=100)).toBe(true);expect(p.errors).toEqual([]);p.player.stop();
});
it('posts each requested voice once without undocumented options or credentials',async()=>{
  for(const voice of tiktokVoices.filter(v=>v.available)){
    const p=setup();p.player.start('Xin chào.',voice,options);await playing(p);
    expect(p.fetcher).toHaveBeenCalledTimes(1);
    const [url,init]=p.fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('https://ottsy.weilbyte.dev/api/generation');expect(init.method).toBe('POST');expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body as string)).toEqual({text:'Xin chào.',voice:voice.serverId});
    expect(p.audios[0].playbackRate).toBe(1.4);expect(p.create.mock.calls[0][0]).toMatchObject({type:'audio/mpeg',size:8});p.player.stop();
  }
});
it('rejects unavailable legacy female2 without calling the gateway',async()=>{const p=setup();p.player.start('Test.',tiktokVoices[2],options);await vi.waitFor(()=>expect(p.errors).toHaveLength(1));expect(p.fetcher).not.toHaveBeenCalled();});
it.each([
  ['malformed JSON',()=>new Response('{',{headers:{'Content-Type':'application/json'}}),'JSON không hợp lệ'],
  ['HTML',()=>new Response('<html>SPA</html>',{headers:{'Content-Type':'text/html'}}),'chưa trả JSON'],
  ['failure flag',()=>response({success:false,data:mp3}),'không tạo được'],
  ['invalid base64',()=>response({success:true,data:'%%%='}),'base64 không hợp lệ'],
  ['noncanonical base64',()=>response({success:true,data:'//=='}),'base64 không hợp lệ'],
  ['empty audio',()=>response({success:true,data:''}),'base64 không hợp lệ'],
  ['non-audio bytes',()=>response({success:true,data:btoa('synthetic text')}),'không phải MP3'],
  ['declared oversize',()=>response(undefined,{'Content-Length':'2097153'}),'quá lớn'],
  ['stream oversize',()=>new Response(' '.repeat(2097153),{headers:{'Content-Type':'application/json'}}),'quá lớn'],
  ['HTTP error',()=>new Response('unavailable',{status:503}),'HTTP 503']
])('reports %s without publishing invalid audio',async(_name,make,message)=>{
  const p=setup(vi.fn().mockImplementation(async()=>make()));p.player.start('Test.',tiktokVoices[0],options);
  await vi.waitFor(()=>expect(p.errors).toHaveLength(1));expect(p.errors[0]).toContain(message);expect(p.fetcher).toHaveBeenCalledTimes(message==='HTTP 503'?2:1);expect(p.create).not.toHaveBeenCalled();p.player.stop();
});
it('bounds the entire request even if fetch ignores abort',async()=>{
  vi.useFakeTimers();const p=setup(vi.fn().mockReturnValue(new Promise(()=>{})));p.player.start('Test.',tiktokVoices[0],options);
  await vi.advanceTimersByTimeAsync(30000);expect(p.states.at(-1)).toBe('loading');expect(p.errors[0]).toContain('quá thời gian');
  expect((p.fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].signal?.aborted).toBe(true);p.player.stop();
});
it('stops an in-flight request and ignores its late response',async()=>{
  let resolve!:(r:Response)=>void;const p=setup(vi.fn().mockReturnValue(new Promise<Response>(r=>{resolve=r;})));
  p.player.start('Test.',tiktokVoices[0],options);p.player.stop();resolve(response());await Promise.resolve();await Promise.resolve();
  expect(p.states.at(-1)).toBe('idle');expect(p.errors).toEqual([]);expect(p.create).not.toHaveBeenCalled();
});
it('ignores an old response while a replacement generation plays',async()=>{
  let resolve!:(r:Response)=>void;const p=setup(vi.fn().mockReturnValueOnce(new Promise<Response>(r=>{resolve=r;})).mockImplementation(async()=>response()));
  p.player.start('Old.',tiktokVoices[0],options);p.player.start('New.',tiktokVoices[1],options);await playing(p);resolve(response());await Promise.resolve();await Promise.resolve();
  expect(p.audios).toHaveLength(1);expect(p.errors).toEqual([]);p.player.stop();
});
it.each(['success','failure'])('ignores late resume %s after Stop',async(result)=>{
  const p=setup();p.player.start('Test.',tiktokVoices[0],options);await playing(p);let resolve!:()=>void;let reject!:(e:Error)=>void;
  p.audios[0].play.mockReturnValueOnce(new Promise<void>((r,j)=>{resolve=r;reject=j;}));p.player.pause();p.player.resume();p.player.stop();
  if(result==='success')resolve();else reject(new Error('late'));await Promise.resolve();await Promise.resolve();expect(p.states.at(-1)).toBe('idle');expect(p.revoke).toHaveBeenCalledTimes(1);
});
it('cleans failed playback and cannot revive on its pending play resolution',async()=>{
  const p=setup();p.player.start('Test.',tiktokVoices[0],options);await playing(p);const oldEnded=p.audios[0].onended!;p.audios[0].onerror!();
  expect(p.states.at(-1)).toBe('loading');expect(p.revoke).toHaveBeenCalledTimes(1);expect(p.audios[0].load).toHaveBeenCalledOnce();oldEnded();expect(p.ended).not.toHaveBeenCalled();p.player.stop();
});
it('releases each URL between chunks and at natural completion',async()=>{
  const p=setup();p.player.start('First. Second.',tiktokVoices[0],options);await playing(p);p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(2));await playing(p);p.audios[0].onended!();
  expect(p.states.at(-1)).toBe('ended');expect(p.revoke).toHaveBeenCalledTimes(2);expect(p.ended).toHaveBeenCalledOnce();p.player.stop();expect(p.revoke).toHaveBeenCalledTimes(2);
});
it('splits astral Unicode at 200 codepoints and preserves exact UTF16 offsets',()=>{
  const text='🙂'.repeat(199)+'文🙂'.repeat(120)+'!\nNext.';const list=sentences(text);
  expect(list[0].text).toBe('🙂'.repeat(199)+'文');expect(list[0].end).toBe(399);expect(list[1].start).toBe(399);
  expect(list.every(s=>Array.from(s.text).length<=200)).toBe(true);expect(list.map(s=>s.text).join('')).toBe(text);
  for(const s of list){expect(text.slice(s.start,s.end)).toBe(s.text);expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(s.text)).toBe(false);}
});
it('times out a stalled response body and cancels its reader',async()=>{
  vi.useFakeTimers();const cancel=vi.fn();const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel});
  const p=setup(vi.fn().mockResolvedValue(new Response(body,{headers:{'Content-Type':'application/json'}})));p.player.start('Test.',tiktokVoices[0],options);
  await vi.advanceTimersByTimeAsync(30000);expect(p.errors[0]).toContain('quá thời gian');expect(cancel).toHaveBeenCalledOnce();expect(p.create).not.toHaveBeenCalled();p.player.stop();
});

it('does not send standalone ellipsis or punctuation to the gateway and preserves following offsets',()=>{
 const text='... Ta thật không có muốn lục ngươi a 2\n!!!\nXin chào.';const list=sentences(text);
 expect(list[0].start).toBe(3);expect(list[0].text).toContain('Ta thật');expect(list.every(s=>/[\p{L}\p{N}]/u.test(s.text))).toBe(true);for(const s of list)expect(text.slice(s.start,s.end)).toBe(s.text);
 expect(sentences('...\n!!!\n　')).toEqual([]);
});

function pendingSetup(){
  const pending:{text:string;voice:string;signal:AbortSignal;resolve:(response:Response)=>void;reject:(error:Error)=>void}[]=[];
  const p=setup(vi.fn().mockImplementation((_url:string,init:RequestInit)=>new Promise<Response>((resolve,reject)=>{
    const {text,voice}=JSON.parse(init.body as string) as {text:string;voice:string};
    pending.push({text,voice,signal:init.signal as AbortSignal,resolve,reject});
  })));
  return {...p,pending};
}
const retained=(p:ReturnType<typeof setup>)=>(p.player as unknown as {requests:Map<string,unknown>}).requests.size;

it('requests the next two chunks before ended, shares pending work and bounds the retained window',async()=>{
  const p=pendingSetup();p.player.start('One.Two.Three.Four.Five.',tiktokVoices[0],options);
  expect(p.pending.map(r=>r.text)).toEqual(['One.']);expect(p.audios).toHaveLength(0);p.pending[0].resolve(response());await playing(p);
  expect(p.pending.map(r=>r.text)).toEqual(['One.','Two.','Three.']);expect(retained(p)).toBe(3);
  p.audios[0].onended!();expect(p.states.at(-1)).toBe('loading');expect(p.fetcher).toHaveBeenCalledTimes(4);expect(retained(p)).toBe(3);
  p.pending[1].resolve(response());await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(2));await playing(p);
  expect(p.pending.map(r=>r.text)).toEqual(['One.','Two.','Three.','Four.']);expect(retained(p)).toBe(3);
  p.pending[2].resolve(response());p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(3));await playing(p);
  expect(p.pending.map(r=>r.text)).toEqual(['One.','Two.','Three.','Four.','Five.']);expect(retained(p)).toBe(3);
  p.pending[3].resolve(response());p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(4));await playing(p);expect(retained(p)).toBe(2);
  p.pending[4].resolve(response());p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(5));await playing(p);expect(retained(p)).toBe(1);
  p.audios[0].onended!();expect(retained(p)).toBe(0);expect(p.ended).toHaveBeenCalledOnce();p.player.stop();
});

it('deduplicates exact repeated chunks only while they remain in the playback window',async()=>{
  const p=pendingSetup();p.player.start('Same.Same.Same.Other.Same.',tiktokVoices[0],options);
  p.pending[0].resolve(response());await playing(p);expect(p.fetcher).toHaveBeenCalledTimes(1);
  p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(2));await playing(p);expect(p.pending.map(r=>r.text)).toEqual(['Same.','Other.']);
  p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(3));await playing(p);expect(p.fetcher).toHaveBeenCalledTimes(2);p.player.stop();expect(retained(p)).toBe(0);
  p.player.start('Same.',tiktokVoices[0],options);expect(p.fetcher).toHaveBeenCalledTimes(3);p.player.stop();
});

it('Stop aborts every speculative request and ignores late responses including a replacement voice',async()=>{
  const p=pendingSetup();p.player.start('One.Two.Three.',tiktokVoices[0],options);p.pending[0].resolve(response());await playing(p);
  const oldEnded=p.audios[0].onended!;p.player.stop();expect(p.pending.every(r=>r.signal.aborted)).toBe(true);expect(retained(p)).toBe(0);
  p.player.start('One.Two.Three.',tiktokVoices[1],options);expect(p.pending[3].voice).toBe(tiktokVoices[1].serverId);
  p.pending[1].resolve(response());p.pending[2].resolve(response());oldEnded();p.pending[3].resolve(response());await playing(p);
  expect(p.create).toHaveBeenCalledTimes(2);expect(p.pending.slice(3).map(r=>r.voice)).toEqual(Array(3).fill(tiktokVoices[1].serverId));expect(p.errors).toEqual([]);
  p.player.stop();expect(p.pending.every(r=>r.signal.aborted)).toBe(true);expect(retained(p)).toBe(0);
});

it('keeps a failed prefetch handled and reports it once when the chunk becomes current after its bounded retry',async()=>{
  const p=pendingSetup();p.player.start('One.Two.Three.',tiktokVoices[0],options);p.pending[0].resolve(response());await playing(p);
  p.pending[1].reject(new Error('synthetic prefetch failure'));
  await vi.waitFor(()=>expect(p.pending).toHaveLength(4));expect(p.pending[3].text).toBe('Two.');p.pending[3].reject(new Error('synthetic prefetch failure'));
  await Promise.resolve();await Promise.resolve();
  expect(p.states.at(-1)).toBe('playing');expect(p.errors).toEqual([]);p.player.pause();expect(p.states.at(-1)).toBe('paused');p.player.resume();await playing(p);
  p.audios[0].onended!();await vi.waitFor(()=>expect(p.errors).toHaveLength(1));expect(p.states.at(-1)).toBe('loading');
  expect(p.errors[0]).toContain('synthetic prefetch failure. Tự thử lại');expect(p.fetcher).toHaveBeenCalledTimes(4);expect(p.audios).toHaveLength(1);expect(p.pending[2].signal.aborted).toBe(true);expect(retained(p)).toBe(0);p.player.stop();
});

it('evicts completed chunks so repeated text outside the window is fetched anew',async()=>{
  const p=setup();p.player.start('One.Two.Three.Four.One.',tiktokVoices[0],options);await playing(p);
  expect(p.fetcher).toHaveBeenCalledTimes(3);
  for(let i=0;i<3;i++){p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(i+2));await playing(p);expect(retained(p)).toBeLessThanOrEqual(3);}
  expect(p.fetcher.mock.calls.map(call=>JSON.parse((call as unknown as [string,RequestInit])[1].body as string).text)).toEqual(['One.','Two.','Three.','Four.','One.']);p.player.stop();
});

it('skips punctuation-only tails after the 200-codepoint boundary',()=>{const text='A'+'!'.repeat(201)+'Next.';const list=sentences(text);expect(list).toHaveLength(2);expect(list[1].start).toBe(202);for(const s of list){expect(/[\p{L}\p{N}]/u.test(s.text)).toBe(true);expect(text.slice(s.start,s.end)).toBe(s.text);}});

it('retries transient HTTP500 once with exactly the same voice and text',async()=>{const fetcher=vi.fn().mockResolvedValueOnce(new Response('temporary',{status:500})).mockResolvedValue(response());const p=setup(fetcher);p.player.start('Xin chào.',tiktokVoices[0],options);await playing(p);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);p.player.stop();});
it('Stop cancels retry delay without making a second request',async()=>{vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValue(new Response('temporary',{status:500}));const p=setup(fetcher);p.player.start('Xin chào.',tiktokVoices[0],options);await vi.advanceTimersByTimeAsync(0);p.player.stop();await vi.advanceTimersByTimeAsync(1000);expect(fetcher).toHaveBeenCalledTimes(1);expect(p.states.at(-1)).toBe('idle');});
it('retries a transient network failure once with exactly the same sentence and voice',async()=>{const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(response());const p=setup(fetcher);p.player.start('Xin chào.',tiktokVoices[0],options);await playing(p);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);p.player.stop();});
it('backs off automatically after the immediate network retry is exhausted',async()=>{const fetcher=vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));const p=setup(fetcher);p.player.start('Xin chào.',tiktokVoices[0],options);await vi.waitFor(()=>expect(p.errors).toHaveLength(1),{timeout:3000});expect(p.errors[0]).toContain('Failed to fetch');expect(fetcher).toHaveBeenCalledTimes(2);expect(p.create).not.toHaveBeenCalled();p.player.stop();});
it('does not retry a request that was cancelled through its abort signal',async()=>{const fetcher=vi.fn().mockRejectedValue(new DOMException('Aborted','AbortError'));const p=setup(fetcher);p.player.start('Xin chào.',tiktokVoices[0],options);await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));await new Promise(resolve=>setTimeout(resolve,700));expect(fetcher).toHaveBeenCalledTimes(1);expect(p.errors).toEqual([]);expect(p.create).not.toHaveBeenCalled();p.player.stop();});

it('reuses one media element and ignores a previous chunk callback on that same element',async()=>{
  const p=setup();p.player.start('First.Second.Third.',tiktokVoices[0],options);await playing(p);
  const oldEnded=p.audios[0].onended!;oldEnded();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(2));await playing(p);
  oldEnded();expect(p.create).toHaveBeenCalledTimes(2);expect(p.player.position().offset).toBe(6);expect(p.audios).toHaveLength(1);
  p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(3));await playing(p);
  expect(p.player.diagnostics().map(t=>t.kind)).toEqual(['start','chunk','chunk']);expect(p.player.diagnostics().slice(1).every(t=>t.prefetched)).toBe(true);p.player.stop();
});
it('uses a spare tail slot for the next chapter without refetching or exceeding three requests',async()=>{
  const p=setup();p.player.start('First.Second.Third.',tiktokVoices[0],options);await playing(p);p.player.prepareNext('Next.Last.');
  expect(p.fetcher).toHaveBeenCalledTimes(3);p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(2));await playing(p);
  expect(p.fetcher.mock.calls.map(call=>JSON.parse(call[1].body).text)).toEqual(['First.','Second.','Third.','Next.']);expect(retained(p)).toBe(3);
  p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(3));await playing(p);p.audios[0].onended!();expect(retained(p)).toBe(1);
  p.player.stop(true);p.player.start('Next.Last.',tiktokVoices[0],options);await playing(p);
  expect(p.fetcher.mock.calls.filter(call=>JSON.parse(call[1].body).text==='Next.')).toHaveLength(1);expect(p.audios).toHaveLength(1);expect(p.player.diagnostics().at(-1)).toMatchObject({kind:'chapter',offset:0,prefetched:true});p.player.stop();expect(retained(p)).toBe(0);
});
it('manual Stop cancels next-chapter prefetch and a later start fetches afresh',async()=>{
  const p=pendingSetup();p.player.start('First.',tiktokVoices[0],options);p.player.prepareNext('Next.');p.pending[0].resolve(response());await playing(p);expect(retained(p)).toBe(2);
  p.player.stop();expect(p.pending.every(r=>r.signal.aborted)).toBe(true);p.player.start('Next.',tiktokVoices[0],options);expect(p.pending).toHaveLength(3);p.player.stop();
});
it('a different voice never adopts a prepared next-chapter request',async()=>{
  const p=setup();p.player.start('First.',tiktokVoices[0],options);p.player.prepareNext('Next.');await playing(p);p.audios[0].onended!();
  p.player.start('Next.',tiktokVoices[1],options);await playing(p);expect(p.fetcher.mock.calls.filter(call=>JSON.parse(call[1].body).text==='Next.')).toHaveLength(2);expect(p.player.diagnostics().at(-1)?.kind).toBe('start');p.player.stop();
});
it('pause during a pending resume cannot be undone by its late play promise',async()=>{
  const p=setup();p.player.start('First.Second.',tiktokVoices[0],options);await playing(p);p.player.pause();let resolve!:()=>void;
  p.audios[0].play.mockReturnValueOnce(new Promise<void>(r=>resolve=r));p.player.resume();p.player.pause();resolve();await Promise.resolve();await Promise.resolve();expect(p.states.at(-1)).toBe('paused');
  p.player.resume();await playing(p);p.audios[0].onended!();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(2));await playing(p);p.player.stop();
});
it('registers optional media controls and clears their handlers at Stop',async()=>{
  const handlers=new Map<string,(()=>void)|null>();const mediaSession={playbackState:'none',metadata:null,setActionHandler:vi.fn((action:string,handler:(()=>void)|null)=>handlers.set(action,handler))};
  vi.stubGlobal('navigator',{mediaSession});const p=setup();p.player.start('First.Second.',tiktokVoices[0],options);await playing(p);expect(mediaSession.playbackState).toBe('playing');
  handlers.get('pause')!();expect(p.states.at(-1)).toBe('paused');expect(mediaSession.playbackState).toBe('paused');handlers.get('play')!();await playing(p);
  handlers.get('stop')!();expect(p.states.at(-1)).toBe('idle');expect(mediaSession.playbackState).toBe('none');expect([...handlers.values()]).toEqual([null,null,null]);
});
it('an ended event queued before Pause cannot advance playback while paused',async()=>{
 const p=setup();p.player.start('First.Second.',tiktokVoices[0],options);await playing(p);const ended=p.audios[0].onended!;
 p.player.pause();ended();expect(p.states.at(-1)).toBe('paused');expect(p.player.position().offset).toBe(0);expect(p.create).toHaveBeenCalledTimes(1);p.player.stop();
});
it('explicit resume advances a completed paused chunk rather than replaying it',async()=>{
 const p=setup();p.player.start('First.Second.',tiktokVoices[0],options);await playing(p);const ended=p.audios[0].onended!;p.player.pause();ended();
 expect(p.player.position().offset).toBe(0);p.player.resume();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledTimes(2));await playing(p);expect(p.player.position().offset).toBe(6);expect(p.audios[0].play).toHaveBeenCalledTimes(2);p.player.stop();
});
it('publishes loading during pending resume so UI can stop it and its late resolution cannot revive playback',async()=>{
 const p=setup();p.player.start('First.',tiktokVoices[0],options);await playing(p);p.player.pause();let resolve!:()=>void;p.audios[0].play.mockReturnValueOnce(new Promise<void>(r=>resolve=r));
 p.player.resume();expect(p.states.at(-1)).toBe('loading');p.player.stop();resolve();await Promise.resolve();expect(p.states.at(-1)).toBe('idle');expect(p.player.resources()).toMatchObject({requests:0,activeAudio:false,activeUrl:false});
});
it('supports flex sentence grouping and records mediaMs in timings diagnostics',async()=>{
 const p=setup();
 p.player.start('Được. Nàng đi đâu? Ta đi dạo.',tiktokVoices[0],{rate:1,pitch:1,flex:1});
 await playing(p);
 const diag=p.player.diagnostics();
 expect(diag).toHaveLength(1);
 expect(diag[0]).toMatchObject({kind:'start',offset:0});
 expect(typeof diag[0].mediaMs).toBe('number');
 p.player.stop();
});
