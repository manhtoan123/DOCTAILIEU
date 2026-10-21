import {afterEach,expect,it,vi} from 'vitest';
import {createMediaKeepAliveBlob,readMediaKeepAliveEnabled,writeMediaKeepAliveEnabled,TtsMediaKeepAlive} from '../src/features/tts/services/tts-media-keepalive';
import {TikTokPlayer,tiktokVoices} from '../src/features/tts/services/tts';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(play=vi.fn(async()=>{})){
 const audios:FakeAudio[]=[];
 class FakeAudio {src='';loop=false;volume=1;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;playbackRate=1;currentTime=0;play=play;pause=vi.fn();removeAttribute=vi.fn();load=vi.fn();constructor(){audios.push(this);}}
 vi.stubGlobal('Audio',FakeAudio);const create=vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:local-${Math.random()}`),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 return {audios,create,revoke,keeper:new TtsMediaKeepAlive()};
}
it('generates the verified ten-second silent PCM on-device with no network access',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const blob=createMediaKeepAliveBlob(),bytes=await blob.arrayBuffer(),view=new DataView(bytes);
 expect(blob.type).toBe('audio/wav');expect(blob.size).toBe(480044);expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('RIFF');expect(view.getUint32(24,true)).toBe(24000);expect(view.getUint32(40,true)/view.getUint32(28,true)).toBe(10);expect(new Uint8Array(bytes,44).every(value=>value===0)).toBe(true);expect(fetcher).not.toHaveBeenCalled();
});
it('enabling idle does not autoplay; one local carrier is reused across pause and freed on disable',async()=>{
 const p=setup();p.keeper.setEnabled(true);expect(p.audios).toHaveLength(0);p.keeper.start();p.keeper.start();expect(p.audios).toHaveLength(1);expect(p.audios[0]).toMatchObject({loop:true,volume:.01});expect(p.create.mock.calls[0][0]).toBeInstanceOf(Blob);p.keeper.pause();p.keeper.start();expect(p.audios).toHaveLength(1);expect(p.create).toHaveBeenCalledOnce();p.keeper.setEnabled(false);expect(p.revoke).toHaveBeenCalledOnce();expect(p.audios[0].removeAttribute).toHaveBeenCalledWith('src');
});
it('late play completion cannot restart a stopped carrier or pause a newer resume',async()=>{
 let resolve!:()=>void;const p=setup(vi.fn().mockReturnValueOnce(new Promise<void>(r=>{resolve=r;})).mockResolvedValue(undefined));p.keeper.setEnabled(true,true);p.keeper.pause();p.keeper.start();const before=p.audios[0].pause.mock.calls.length;resolve();await Promise.resolve();await Promise.resolve();expect(p.audios[0].pause).toHaveBeenCalledTimes(before);p.keeper.stop();
});
it('automatically enables background playback for new/legacy/blocked device storage',()=>{
 const storage=new Map<string,string>([['tts-media-keepalive-v1','1']]);vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value)});expect(readMediaKeepAliveEnabled()).toBe(true);writeMediaKeepAliveEnabled(false);expect(readMediaKeepAliveEnabled()).toBe(true);storage.clear();expect(readMediaKeepAliveEnabled()).toBe(true);vi.stubGlobal('localStorage',{getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}});expect(readMediaKeepAliveEnabled()).toBe(true);expect(()=>writeMediaKeepAliveEnabled(true)).not.toThrow();
});
it('blocked carrier never prevents normal TTS and audio error/Stop pause and free it',async()=>{
 const p=setup(vi.fn().mockImplementation(function(this:{loop:boolean}){return this.loop?Promise.reject(new DOMException('blocked','NotAllowedError')):Promise.resolve();})),states:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,data:'//PkxAAAAAAA'})));const player=new TikTokPlayer(state=>states.push(state),()=>{});player.setMediaKeepAlive(true);player.start('One.Two.',tiktokVoices[0],{rate:1,pitch:1,flex:0});await vi.waitFor(()=>expect(states.at(-1)).toBe('playing'));expect(p.audios).toHaveLength(2);const carrier=p.audios.find(a=>a.loop)!,voice=p.audios.find(a=>!a.loop)!;voice.onerror!();expect(states.at(-1)).toBe('loading');expect(carrier.pause).toHaveBeenCalled();player.stop();expect(carrier.removeAttribute).toHaveBeenCalledWith('src');
});
