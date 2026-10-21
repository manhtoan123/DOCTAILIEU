import {afterEach,it,expect,vi} from 'vitest';
import {TikTokPlayer,tiktokVoices,sentences} from '../src/features/tts/services/tts';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const options={rate:1,pitch:1,flex:0};
const response=()=>new Response(JSON.stringify({success:true,data:'//PkxAAAAAAA'}),{headers:{'Content-Type':'application/json'}});

it('preserves a saved media time when paused before metadata permits seeking',async()=>{
  const p=setup();let finishPlay!:()=>void;
  // A native element may reject seeking until loadedmetadata and leave time at 0.
  const pendingPlay=new Promise<void>(resolve=>{finishPlay=resolve;});
  const Native=globalThis.Audio;
  let metadata=false,time=0;
  vi.stubGlobal('Audio',class extends Native {
    constructor(){super();Object.defineProperty(this,'currentTime',{get:()=>time,set:value=>{if(!metadata)throw new Error('No metadata yet');time=value;},configurable:true});this.play=vi.fn().mockReturnValueOnce(pendingPlay).mockResolvedValue(undefined);}
  });
  try{
    p.player.start('First. Second.',tiktokVoices[0],options,{offset:6,audioTime:2.5});
    await vi.waitFor(()=>expect(p.audios).toHaveLength(1));
    const staleMetadata=p.audios[0].onloadedmetadata;
    expect(p.player.position()).toEqual({offset:6,audioTime:2.5});
    p.player.pause();expect(p.player.position()).toEqual({offset:6,audioTime:2.5});
    metadata=true;finishPlay();staleMetadata?.();await Promise.resolve();
    expect(p.states.at(-1)).toBe('paused');p.player.resume();
    await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
    expect(p.player.position()).toEqual({offset:6,audioTime:2.5});
  }finally{finishPlay?.();p.player.stop();}
});

it('pause during a slow next chunk resumes that chunk and discards its late response',async()=>{
  let resolve!: (response:Response)=>void,secondCalls=0;
  const p=setup(vi.fn().mockImplementation(async(_url,init)=>{
    const text=JSON.parse(init.body).text;
    if(text===' Second.'&&++secondCalls===1)return new Promise<Response>(r=>{resolve=r;});
    return response();
  }));
  try{
    p.player.start('First. Second. Third.',tiktokVoices[0],options);
    await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
    p.audios[0].onended!();expect(p.states.at(-1)).toBe('loading');
    expect(p.player.position()).toEqual({offset:6,audioTime:0});p.player.pause();
    resolve(response());await Promise.resolve();expect(p.states.at(-1)).toBe('paused');
    p.player.resume();await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
    expect(p.player.position()).toEqual({offset:6,audioTime:0});
    expect(p.fetcher.mock.calls.filter(c=>JSON.parse(c[1].body).text==='First.')).toHaveLength(1);
    expect(p.audios).toHaveLength(1);expect(p.player.resources().requests).toBeLessThanOrEqual(3);
  }finally{resolve?.(response());p.player.stop();}
});

it('late ended callbacks cannot advance a new chapter using the same audio element',async()=>{
  const p=setup();try{
    p.player.start('First. Second.',tiktokVoices[0],options);await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
    const staleEnded=p.audios[0].onended!;p.player.stop();
    p.player.start('New chapter.',tiktokVoices[0],options);await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
    staleEnded();expect(p.player.position()).toEqual({offset:0,audioTime:0});expect(p.states.at(-1)).toBe('playing');
  }finally{p.player.stop();}
  expect(p.player.resources()).toMatchObject({requests:0,pending:0,activeAudio:false,activeUrl:false});
});
function setup(fetcher=vi.fn().mockImplementation(async()=>response())){const audios:FakeAudio[]=[];const states:string[]=[];
 class FakeAudio{currentTime=0;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;onloadedmetadata:(()=>void)|null=null;playbackRate=1;play=vi.fn().mockResolvedValue(undefined);pause=vi.fn();load=vi.fn();removeAttribute=vi.fn();constructor(){audios.push(this);}}
 vi.stubGlobal('Audio',FakeAudio);vi.stubGlobal('fetch',fetcher);vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});const player=new TikTokPlayer(s=>states.push(s),()=>{});return {player,audios,states,fetcher};}
it('restores exact second chunk and media time without replaying completed chunks',async()=>{const p=setup();p.player.start('First. Second. Third.',tiktokVoices[0],options,{offset:6,audioTime:2.5});await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));expect(JSON.parse(p.fetcher.mock.calls[0][1].body).text).toBe(' Second.');expect(p.audios[0].currentTime).toBe(2.5);p.audios[0].onended!();await vi.waitFor(()=>expect(p.audios[0].play).toHaveBeenCalledTimes(2));expect(p.player.position()).toEqual({offset:14,audioTime:0});p.player.stop();});
it('pause loading cancels old response and resume owns only one new generation',async()=>{let resolve!:(r:Response)=>void;const p=setup(vi.fn().mockReturnValueOnce(new Promise<Response>(r=>resolve=r)).mockImplementation(async()=>response()));p.player.start('First.',tiktokVoices[0],options);p.player.pause();expect(p.states.at(-1)).toBe('paused');resolve(response());await Promise.resolve();expect(p.audios).toHaveLength(0);p.player.resume();await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));expect(p.audios).toHaveLength(1);p.player.stop();});
it('an error keeps the current sentence for recovery, never the first',async()=>{const p=setup();p.player.start('First. Second.',tiktokVoices[0],options,{offset:6,audioTime:0});await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));p.audios[0].onerror!();expect(p.states.at(-1)).toBe('loading');const saved=p.player.position();expect(saved.offset).toBe(6);p.player.start('First. Second.',tiktokVoices[0],options,saved);await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));expect(p.fetcher.mock.calls.map(c=>JSON.parse(c[1].body).text)).toEqual([' Second.',' Second.']);p.player.stop();});
it('resume after an audio interruption retries in place with the same sentence and media time',async()=>{
 const p=setup();p.player.start('First. Second.',tiktokVoices[0],options,{offset:6,audioTime:2.5});await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
 p.audios[0].onerror!();expect(p.states.at(-1)).toBe('loading');
 await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'),{timeout:4000});expect(p.player.position()).toEqual({offset:6,audioTime:2.5});
 expect(p.fetcher.mock.calls.map(c=>JSON.parse(c[1].body).text)).toEqual([' Second.',' Second.']);expect(p.audios).toHaveLength(1);p.player.stop();
});
it('repeated network interruptions resume the failed fourth chunk without replaying the first three',async()=>{
 let offline=false;const p=setup(vi.fn().mockImplementation(async()=>{if(offline)throw new TypeError('Failed to fetch');return response();}));
 p.player.start('One.Two.Three.Four.',tiktokVoices[0],options);await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));await vi.waitFor(()=>expect(p.fetcher).toHaveBeenCalledTimes(3));
 offline=true;p.audios[0].onended!();await vi.waitFor(()=>expect(p.audios[0].play).toHaveBeenCalledTimes(2));p.audios[0].onended!();await vi.waitFor(()=>expect(p.audios[0].play).toHaveBeenCalledTimes(3));p.audios[0].onended!();
 await vi.waitFor(()=>expect(p.states.at(-1)).toBe('loading'),{timeout:3000});expect(p.player.position()).toEqual({offset:14,audioTime:0});
 await new Promise(resolve=>setTimeout(resolve,800));
 const retry=p.fetcher.mock.calls.length;offline=false;await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'),{timeout:5000});
 expect(p.fetcher.mock.calls.slice(retry).map(c=>JSON.parse(c[1].body).text)).toEqual(['Four.']);expect(p.player.position()).toEqual({offset:14,audioTime:0});expect(p.audios).toHaveLength(1);p.player.stop();
});
it('restores a cursor inside a chunk split after HTTP500 without replaying its completed prefix',async()=>{
 const p=setup(),text='a'.repeat(180)+'.';p.player.start(text,tiktokVoices[0],options,{offset:100,audioTime:2.5});await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
 expect(JSON.parse(p.fetcher.mock.calls[0][1].body).text).toBe(text.slice(100));expect(p.player.position()).toEqual({offset:100,audioTime:2.5});p.player.stop();
});
it('a cursor from an old mid-word cut restarts its containing segment without seeking into different audio',async()=>{
 const text='Từ '.repeat(65)+'hai mươi tuổi còn ở phía trước và tiếp tục câu chuyện',p=setup(),current=sentences(text).find(s=>s.end>200)!;
 expect(text.slice(0,200)).toMatch(/hai m$/);p.player.start(text,tiktokVoices[0],options,{offset:200,audioTime:7.5});await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
 expect(p.player.position()).toEqual({offset:current.start,audioTime:0});expect(JSON.parse(p.fetcher.mock.calls[0][1].body).text).toBe(current.text);expect(p.audios[0].currentTime).toBe(0);p.player.stop();
});

it('switching to natural grouping resumes the exact legacy audio and its saved time',async()=>{
 const p=setup(),text='First. Second. Third. Fourth.';
 p.player.start(text,tiktokVoices[0],{...options,flex:1},{offset:6,audioTime:2.5});
 await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
 expect(JSON.parse(p.fetcher.mock.calls[0][1].body).text).toBe(' Second.');expect(p.player.position()).toEqual({offset:6,audioTime:2.5});p.player.stop();
});

it('a grouped cursor resumes the same grouped MP3 rather than its first short sentence',async()=>{
 const p=setup(),text='First. Second. Third. Fourth.';
 p.player.start(text,tiktokVoices[0],{...options,flex:1},{offset:0,audioTime:2.5,grouping:'natural'});
 await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));
 expect(JSON.parse(p.fetcher.mock.calls[0][1].body).text).toBe(text);expect(p.player.position()).toEqual({offset:0,audioTime:2.5});expect(p.player.chunking()).toBe('natural');p.player.stop();
});
it('legacy resume keeps sentence boundaries until the canonical grouped boundary, including a second reload',async()=>{
 const p=setup(),text='First. Second. Third. Fourth.';
 p.player.start(text,tiktokVoices[0],{...options,flex:1},{offset:6,audioTime:2.5,grouping:'sentence'});await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));expect(p.player.chunking()).toBe('sentence');
 p.audios[0].onended!();await vi.waitFor(()=>expect(p.player.position().offset).toBe(14));await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));p.audios[0].currentTime=1.5;const saved={...p.player.position(),grouping:p.player.chunking()};expect(saved.grouping).toBe('sentence');p.player.stop();
 const count=p.fetcher.mock.calls.length;p.player.start(text,tiktokVoices[0],{...options,flex:1},saved);await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));expect(JSON.parse(p.fetcher.mock.calls[count][1].body).text).toBe(' Third.');expect(p.player.position()).toEqual({offset:14,audioTime:1.5});p.player.stop();
});

it('natural default restores legacy HTTP500 subchunks inside a merged sentence without replaying its prefix',async()=>{
 const p=setup(),text='Short.'+'a'.repeat(130)+'.';p.player.start(text,tiktokVoices[0],{...options,flex:1},{offset:106,audioTime:1.5,grouping:'sentence'});await vi.waitFor(()=>expect(p.states.at(-1)).toBe('playing'));expect(JSON.parse(p.fetcher.mock.calls[0][1].body).text).toBe(text.slice(106));expect(p.player.position()).toEqual({offset:106,audioTime:1.5});expect(p.player.chunking()).toBe('sentence');p.player.stop();
});
