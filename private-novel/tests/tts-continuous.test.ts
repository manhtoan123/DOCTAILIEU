import {afterEach,expect,it,vi} from 'vitest';
import {ContinuousTtsPlayer} from '../src/features/tts/services/tts-continuous';
import {sentences,smallerTtsChunks,tiktokVoices} from '../src/features/tts/services/tts';
const options={rate:1,pitch:1,flex:0};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(fetcher:ReturnType<typeof vi.fn<(text:string,voice:unknown,signal:AbortSignal)=>Promise<Blob>>>=vi.fn(async()=>new Blob([new Uint8Array([1])]))){
 const states:{state:string;offset?:number;message?:string}[]=[],ended=vi.fn();
 class Buffer extends EventTarget {
  mode='';updating=false;from=0;to=0;appends=0;removals:number[]=[];
  get buffered(){return {length:this.to>0?1:0,start:()=>this.from,end:()=>this.to};}
  appendBuffer(){this.updating=true;queueMicrotask(()=>{this.to+=3;this.appends++;this.updating=false;this.dispatchEvent(new Event('updateend'));});}
  remove(_from:number,to:number){this.updating=true;this.removals.push(to);queueMicrotask(()=>{this.from=to;this.updating=false;this.dispatchEvent(new Event('updateend'));});}
 }
 const sources:Source[]=[];
 class Source extends EventTarget {static isTypeSupported=()=>true;readyState='open';duration=NaN;buffer=new Buffer();constructor(){super();sources.push(this);}addSourceBuffer(){return this.buffer;}endOfStream(){this.readyState='ended';}}
 class Audio {
  private source='';get src(){return this.source;}set src(value:string){this.source=value;this.srcChanges++;}srcChanges=0;currentTime=0;paused=true;readyState=4;error:null|object=null;playbackRate=1;
  ontimeupdate:(()=>void)|null=null;onwaiting:(()=>void)|null=null;onended:(()=>void)|null=null;onplaying:(()=>void)|null=null;onpause:(()=>void)|null=null;onerror:(()=>void)|null=null;
  play=vi.fn(async()=>{this.paused=false;});pause=vi.fn(()=>{this.paused=true;});removeAttribute=vi.fn(()=>{this.source='';});load=vi.fn(()=>{this.playbackRate=1;if(this.source)queueMicrotask(()=>sources.at(-1)?.dispatchEvent(new Event('sourceopen')));});
 }
 vi.stubGlobal('MediaSource',Source);vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:stream');const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const audio=new Audio(),player=new ContinuousTtsPlayer(audio as unknown as HTMLAudioElement,fetcher,sentences,smallerTtsChunks,(state,s,message)=>states.push({state,offset:s?.start,message}),ended);
 const tick=(time:number)=>{audio.currentTime=time;audio.ontimeupdate?.();};
 return {player,audio,sources,fetcher,states,ended,tick,revoke};
}
const text=Array.from({length:20},(_,i)=>`Sentence ${i}.`).join('');
it('appends three chunks to one source, advances offsets and trims consumed audio without unbounded requests',async()=>{
 const p=setup();p.player.start(text,tiktokVoices[0],options);await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(3));expect(p.audio.srcChanges).toBe(1);expect(p.sources[0].duration).toBe(Infinity);
 for(let i=1;i<=15;i++){p.tick(i*3+.05);await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(i+3));expect(p.player.resources().requests).toBeLessThanOrEqual(3);expect(p.player.position()).toMatchObject({offset:sentences(text)[i].start});}
 expect(p.audio.srcChanges).toBe(1);expect(p.sources[0].buffer.removals.length).toBeGreaterThan(0);expect(p.sources[0].buffer.from).toBeGreaterThan(0);p.player.stop();expect(p.revoke).toHaveBeenCalledOnce();expect(p.player.resources().activeAudio).toBe(false);
});
it('drains buffered audio before reporting a speculative network error and resumes the failed chunk',async()=>{
 let offline=true;const p=setup(vi.fn(async(s:string)=>{if(s==='Sentence 3.'&&offline)throw new Error('Network disconnected');return new Blob([new Uint8Array([1])]);}));
 p.player.start(text,tiktokVoices[0],options);await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(3));p.tick(3.1);await vi.waitFor(()=>expect(p.fetcher).toHaveBeenCalledTimes(4));expect(p.states.at(-1)?.state).toBe('playing');
 p.tick(9);await vi.waitFor(()=>expect(p.states.at(-1)).toMatchObject({state:'error',offset:sentences(text)[3].start}));expect(p.player.position()).toEqual({offset:sentences(text)[3].start,audioTime:0});
 offline=false;p.player.resume();await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(6));expect(p.audio.currentTime).toBe(9);expect(p.audio.srcChanges).toBe(1);p.player.stop();
});
it('pause during fetch prevents late playback; resume uses the fetched chunk and original cursor',async()=>{
 let resolve!:(blob:Blob)=>void;const p=setup(vi.fn(()=>new Promise<Blob>(r=>{resolve=r;})));p.player.start('One.',tiktokVoices[0],options);p.player.pause();resolve(new Blob([new Uint8Array([1])]));await Promise.resolve();await Promise.resolve();expect(p.audio.play).not.toHaveBeenCalled();p.player.resume();await vi.waitFor(()=>expect(p.audio.play).toHaveBeenCalledOnce());expect(p.fetcher).toHaveBeenCalledOnce();expect(p.player.position().offset).toBe(0);p.player.stop();
});
it('stop aborts requests and a stale completion never appends or starts audio',async()=>{
 let resolve!:(blob:Blob)=>void;const p=setup(vi.fn(()=>new Promise<Blob>(r=>{resolve=r;})));p.player.start('One.',tiktokVoices[0],options);const signal=p.fetcher.mock.calls[0][2] as AbortSignal;p.player.stop();resolve(new Blob([new Uint8Array([1])]));await Promise.resolve();await Promise.resolve();expect(signal.aborted).toBe(true);expect(p.audio.play).not.toHaveBeenCalled();expect(p.player.resources()).toMatchObject({requests:0,activeAudio:false});
});
it('prepared automatic chapter transition retains the same source and cached next chunk',async()=>{
 const p=setup();p.player.start('One.Two.',tiktokVoices[0],options);p.player.prepareNext('Next.Last.');await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(2));p.tick(6);expect(p.ended).toHaveBeenCalledOnce();p.player.stop(true);expect(p.audio.removeAttribute).not.toHaveBeenCalledTimes(2);
 p.player.start('Next.Last.',tiktokVoices[0],options);await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(4));expect(p.sources).toHaveLength(1);expect(p.audio.srcChanges).toBe(1);expect(p.fetcher.mock.calls.filter(call=>(call as unknown[])[0]==='Next.')).toHaveLength(1);p.tick(9.1);expect(p.player.position()).toMatchObject({offset:5});p.player.stop();
});
it('restore seeks within a chunk and reports chunk-relative time; native pause is reflected',async()=>{
 const p=setup();p.player.start('One.Two.Three.',tiktokVoices[0],options,{offset:4,audioTime:1.25});await vi.waitFor(()=>expect(p.audio.play).toHaveBeenCalled());expect(p.audio.currentTime).toBe(1.25);expect(p.player.position()).toEqual({offset:4,audioTime:1.25});p.audio.paused=true;p.audio.onpause?.();expect(p.states.at(-1)?.state).toBe('paused');p.player.resume();await vi.waitFor(()=>expect(p.audio.paused).toBe(false));p.player.stop();
});
it('preserves the chosen rate after native load resets it',async()=>{
 const p=setup();p.player.start('One.Two.',tiktokVoices[0],{...options,rate:1.8});await vi.waitFor(()=>expect(p.audio.play).toHaveBeenCalled());expect(p.audio.playbackRate).toBe(1.8);p.player.stop();
});
it('waiting at the decoded MP3 tail still reports a later request failure',async()=>{
 let reject!:(error:Error)=>void;const p=setup(vi.fn(async(s:string)=>s==='Sentence 3.'?new Promise<Blob>((_r,j)=>{reject=j;}):new Blob([new Uint8Array([1])])));
 p.player.start(text,tiktokVoices[0],options);await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(3));p.tick(3.1);await vi.waitFor(()=>expect(reject).toBeDefined());p.audio.currentTime=8.9;p.audio.onwaiting?.();reject(new Error('Network lost'));await vi.waitFor(()=>expect(p.states.at(-1)).toMatchObject({state:'error',offset:33}));expect(p.player.position()).toEqual({offset:33,audioTime:0});p.player.stop();
});
it('a failed fetch while restoring retains the saved time inside that same chunk',async()=>{
 let offline=true;const p=setup(vi.fn(async()=>{if(offline)throw new Error('Offline');return new Blob([new Uint8Array([1])]);}));p.player.start('One.Two.',tiktokVoices[0],options,{offset:4,audioTime:1.25});await vi.waitFor(()=>expect(p.states.at(-1)?.state).toBe('error'));expect(p.player.position()).toEqual({offset:4,audioTime:1.25});offline=false;p.player.resume();await vi.waitFor(()=>expect(p.audio.play).toHaveBeenCalled());expect(p.audio.currentTime).toBe(1.25);p.player.stop();
});
it('a checkpoint advancing the index before timeupdate still keeps the three-request cap',async()=>{
 let release!:(blob:Blob)=>void;const p=setup(vi.fn(async(s:string)=>s==='Sentence 3.'?new Promise<Blob>(r=>{release=r;}):new Blob([new Uint8Array([1])])));p.player.start(text,tiktokVoices[0],options);await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(3));p.audio.currentTime=3.1;p.player.position();p.audio.ontimeupdate?.();await vi.waitFor(()=>expect(release).toBeDefined());expect(p.player.resources().requests).toBe(3);release(new Blob([new Uint8Array([1])]));p.player.stop();
});
it('only ends after the final audio boundary and releases the native pipeline',async()=>{
 const p=setup();p.player.start('One.',tiktokVoices[0],options);await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBe(1));p.tick(2);expect(p.ended).not.toHaveBeenCalled();p.tick(3);expect(p.ended).toHaveBeenCalledOnce();expect(p.states.at(-1)?.state).toBe('ended');expect(p.player.resources().activeUrl).toBe(false);expect(p.audio.paused).toBe(true);
});
it('splits a rejected long gateway chunk without changing UTF16 source offsets',async()=>{
 const sentence='Một câu dài '+ 'nội dung '.repeat(16)+'.',p=setup(vi.fn(async(s:string)=>{if(Array.from(s).length>100)throw new Error('HTTP 500');return new Blob([new Uint8Array([1])]);}));p.player.start(sentence,tiktokVoices[0],options);await vi.waitFor(()=>expect(p.sources[0].buffer.appends).toBeGreaterThan(1));p.tick(3.1);expect(p.player.position().offset).toBe(smallerTtsChunks(sentences(sentence)[0])[1].start);p.player.stop();
});
