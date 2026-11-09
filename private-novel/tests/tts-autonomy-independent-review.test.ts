import {afterEach,expect,it,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';

const bytes=new Uint8Array([255,243,228,196,1,2,3,4]);
const blob=new Blob([bytes],{type:'audio/mpeg'});
const response=()=>Response.json({success:true,data:Buffer.from(bytes).toString('base64')});
const options={rate:1,pitch:1,flex:0};
const stopping:(()=>void)[]=[];
afterEach(()=>{for(const stop of stopping.splice(0))stop();vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();vi.resetModules();});

async function setup(fetcher=vi.fn().mockImplementation(async()=>response()),storage=false){
 vi.stubEnv('VITE_TTS_GATEWAY','capcut-v2');vi.resetModules();
 if(storage)vi.stubGlobal('indexedDB',new IDBFactory());
 const cache=await import('../src/features/tts/services/tts-audio-cache');
 if(!storage){vi.spyOn(cache.ttsAudioCache,'get').mockResolvedValue(undefined);vi.spyOn(cache.ttsAudioCache,'put').mockResolvedValue(undefined);vi.spyOn(cache.ttsAudioCache,'duration').mockResolvedValue(undefined);}
 const audios:FakeAudio[]=[],states:string[]=[];
 class FakeAudio {currentTime=0;duration=1;readyState=1;playbackRate=1;src='';preload='';onended:(()=>void)|null=null;onerror:(()=>void)|null=null;onloadedmetadata:(()=>void)|null=null;ontimeupdate:(()=>void)|null=null;play=vi.fn().mockResolvedValue(undefined);pause(){}load(){}removeAttribute(){}constructor(){audios.push(this);}}
 vi.stubGlobal('Audio',FakeAudio);vi.stubGlobal('fetch',fetcher);vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:review');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const {TikTokPlayer,tiktokVoices}=await import('../src/features/tts/services/tts');
 const player=new TikTokPlayer(state=>states.push(state),()=>{});stopping.push(()=>player.stop());
 return {player,voice:tiktokVoices[0],cache:cache.ttsAudioCache,audios,states,fetcher};
}

it('replaces undecodable cached audio through the gateway while retaining saved seek',async()=>{
 const p=await setup(undefined,true),{ttsAudioCacheKey}=await import('../src/features/tts/services/tts-audio-cache');
 const {capcutVietnameseVoices}=await import('../src/shared/constants/capcut-voices');
 const resource=capcutVietnameseVoices.find(v=>v.serverId===p.voice.serverId)!.resource;
 const key=await ttsAudioCacheKey('/api/tts:'+p.voice.serverId+':'+resource,'Second.');await p.cache.put(key,blob);
 expect(await p.cache.get(key)).toBeDefined();vi.useFakeTimers();
 p.player.start('First.Second.',p.voice,options,{offset:6,audioTime:2.5});await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
 expect(p.fetcher).not.toHaveBeenCalled();p.audios[0].onerror!();
 expect(p.player.position()).toEqual({offset:6,audioTime:2.5});
 await vi.advanceTimersByTimeAsync(2000);await vi.waitFor(()=>expect(p.fetcher).toHaveBeenCalledTimes(1));
 await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));expect(p.player.position()).toEqual({offset:6,audioTime:2.5});
 expect(JSON.parse(p.fetcher.mock.calls[0][1].body)).toMatchObject({text:'Second.',voice:p.voice.serverId});
});

it('bounds active lookahead, preserves chunk text, and Stop cannot start queued work or write late audio',async()=>{
 const pending:{text:string;signal:AbortSignal;resolve:(response:Response)=>void}[]=[];
 const p=await setup(vi.fn().mockImplementation((_url,init)=>new Promise<Response>(resolve=>pending.push({text:JSON.parse(init.body).text,signal:init.signal,resolve}))));
 const text=Array.from({length:20},(_,i)=>'Sentence'+i+'.').join('');p.player.start(text,p.voice,options);
 await vi.waitFor(()=>expect(pending).toHaveLength(1));pending[0].resolve(response());await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
 await vi.waitFor(()=>expect(pending).toHaveLength(4));
 expect(p.player.resources().pending).toBe(3);expect(p.player.resources().requests).toBeLessThanOrEqual(12);
 // Parallel cache-key hashes may finish out of order; playback still owns its
 // source index. The first request stays solo and lookahead preserves exact text.
 expect(pending[0].text).toBe('Sentence0.');expect(pending.slice(1).map(p=>p.text).sort()).toEqual(['Sentence1.','Sentence2.','Sentence3.']);
 p.player.stop();const count=pending.length;for(const item of pending)item.resolve(response());await new Promise(resolve=>setTimeout(resolve,30));
 expect(pending.every(p=>p.signal.aborted)).toBe(true);expect(pending).toHaveLength(count);expect(p.states.at(-1)).toBe('idle');expect(p.player.resources()).toMatchObject({requests:0,pending:0,activeAudio:false,activeUrl:false});
 expect(p.cache.put).toHaveBeenCalledTimes(1);
});

it('expired sessions wait at the same cursor and Stop cancels the next check',async()=>{
 vi.useFakeTimers();const p=await setup(vi.fn().mockImplementation(async()=>Response.json({error:'capcut_session_expired'},{status:401})));
 const timeout=vi.spyOn(globalThis,'setTimeout');
 p.player.start('First.Second.',p.voice,options,{offset:6,audioTime:2.5});
 // waitFor advances fake time while native hashing completes. Check the actual
 // scheduled delay instead of measuring sixty seconds from that later observation.
 await vi.waitFor(()=>expect(timeout.mock.calls.some(([,delay])=>delay===60000)).toBe(true));
 expect(p.fetcher).toHaveBeenCalledTimes(1);
 expect(p.states.at(-1)).toBe('loading');expect(p.player.position()).toEqual({offset:6,audioTime:2.5});
 await vi.advanceTimersByTimeAsync(1000);expect(p.fetcher).toHaveBeenCalledTimes(1);p.player.stop();await vi.advanceTimersByTimeAsync(300001);expect(p.fetcher).toHaveBeenCalledTimes(1);expect(p.states.at(-1)).toBe('idle');
});

it('waiting for a session does not delay the first audio repair after reconnection',async()=>{
 vi.useFakeTimers();const p=await setup(vi.fn().mockResolvedValueOnce(Response.json({error:'capcut_session_expired'},{status:401})).mockImplementation(async()=>response())),timeout=vi.spyOn(globalThis,'setTimeout');
 // This case measures retry scheduling, not native WebCrypto completion time.
 vi.spyOn(await import('../src/features/tts/services/tts-audio-cache'),'ttsAudioCacheKey').mockResolvedValue('0'.repeat(64));
 p.player.start('First.',p.voice,options,{offset:0,audioTime:2.5});await vi.waitFor(()=>expect(timeout.mock.calls.some(([,delay])=>delay===60000)).toBe(true));
 await vi.advanceTimersByTimeAsync(60000);await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));expect(p.fetcher).toHaveBeenCalledTimes(2);p.audios[0].onerror!();
 await vi.advanceTimersByTimeAsync(50);expect(p.fetcher).toHaveBeenCalledTimes(3);expect(p.states.at(-1)).toBe('playing');expect(p.player.position()).toEqual({offset:0,audioTime:2.5});
});

it('missing/denied IndexedDB is optional and abort during blob preparation cannot publish a cache row',async()=>{
 const {TtsAudioCache}=await import('../src/features/tts/services/tts-audio-cache');
 for(const factory of [null,{open(){throw new DOMException('Denied','SecurityError');}} as unknown as globalThis.IDBFactory]){
  const optional=new TtsAudioCache({factory});await expect(optional.get('key')).resolves.toBeUndefined();await expect(optional.put('key',blob)).resolves.toBeUndefined();
 }
 const cache=new TtsAudioCache({factory:new IDBFactory(),name:'independent-review-abort'}),controller=new AbortController();
 let release!:(bytes:ArrayBuffer)=>void;
 class DelayedBlob extends Blob {override arrayBuffer(){return new Promise<ArrayBuffer>(resolve=>{release=resolve;});}}
 const pending=cache.put('aborted',new DelayedBlob([bytes],{type:'audio/mpeg'}),controller.signal);controller.abort();release(bytes.buffer);await pending;expect(await cache.get('aborted')).toBeUndefined();
});
