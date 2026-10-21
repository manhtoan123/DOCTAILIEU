import type {Sentence,SpeechState,TikTokVoice,TtsOptions,TtsPosition,TtsResources} from './tts';

interface Segment {index:number;start:number;end:number;sentence:Sentence}
interface Request {controller:AbortController;ready:boolean;settled:boolean;result:Promise<{blob:Blob}|{error:Error}>}
const aborted=()=>new DOMException('Đã dừng phát.','AbortError');

/** One native media timeline. No silent carrier and no source changes between chunks. */
export class ContinuousTtsPlayer {
 static supported(audio:HTMLAudioElement){return typeof MediaSource!=='undefined'&&typeof HTMLMediaElement!=='undefined'&&audio instanceof HTMLMediaElement&&MediaSource.isTypeSupported('audio/mpeg');}
 private source?:MediaSource;private buffer?:SourceBuffer;private url?:string;private lifetime?:AbortController;private opened?:Promise<void>;
 private list:Sentence[]=[];private index=0;private appended=0;private segments:Segment[]=[];private requests=new Map<string,Request>();
 private state:SpeechState='idle';private generation=0;private pumping=false;private drained=false;private failed?:{index:number;error:Error};private resumeTime=0;private nextText='';private text='';private voice!:TikTokVoice;private rate=1;private boundary=false;
 constructor(private audio:HTMLAudioElement,private fetchAudio:(text:string,voice:TikTokVoice,signal:AbortSignal)=>Promise<Blob>,private chunks:(text:string)=>Sentence[],private smaller:(sentence:Sentence)=>Sentence[],private change:(state:SpeechState,sentence?:Sentence,message?:string)=>void,private ended:()=>void){}
 position():TtsPosition{this.locate();const segment=this.segments.find(s=>s.index===this.index);return {offset:this.list[this.index]?.start??this.list.at(-1)?.end??0,audioTime:segment?Math.max(0,this.audio.currentTime-segment.start):this.resumeTime};}
 resources():TtsResources{const next=this.list[this.index+1]??this.chunks(this.nextText)[0];return {requests:this.requests.size,pending:[...this.requests.values()].filter(r=>!r.settled).length,nextReady:!!next&&this.requests.get(this.key(next))?.ready===true,activeAudio:!!this.url,activeUrl:!!this.url};}
 prepareNext(text=''){this.nextText=text;if(this.state==='playing'||this.state==='loading')this.warm();}
 private key(s:Sentence){return JSON.stringify([this.voice.id,s.text]);}
 private request(s:Sentence){const key=this.key(s);let entry=this.requests.get(key);if(!entry){const controller=new AbortController();entry={controller,ready:false,settled:false,result:Promise.resolve({error:aborted()})};const owned=entry;entry.result=this.fetchAudio(s.text,this.voice,controller.signal).then(blob=>{owned.ready=true;owned.settled=true;return {blob};},error=>{owned.settled=true;return {error:error instanceof Error?error:new Error(String(error))};});this.requests.set(key,entry);}return entry.result;}
 private retainWindow(){
  const window=this.list.slice(this.index,this.index+3);if(window.length<3){const next=this.chunks(this.nextText)[0];if(next)window.push(next);}
  const keys=new Set(window.map(s=>this.key(s)));for(const [key,request] of this.requests)if(!keys.has(key)){request.controller.abort();this.requests.delete(key);}
  return window;
 }
 private warm(){for(const s of this.retainWindow())void this.request(s);}
 private publish(state:SpeechState,message?:string){this.state=state;this.change(state,this.list[this.index],message);}
 private event(target:EventTarget,name:string,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
  const clean=()=>{clearTimeout(timer);target.removeEventListener(name,done);target.removeEventListener('error',error);signal.removeEventListener('abort',cancel);};
  const done=()=>{clean();resolve();},error=()=>{clean();reject(new Error('Không nối được âm thanh TTS.'));},cancel=()=>{clean();reject(aborted());};
  const timer=setTimeout(error,10000);target.addEventListener(name,done,{once:true});target.addEventListener('error',error,{once:true});signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 });}
 private attach(){
  const source=this.source=new MediaSource(),signal=(this.lifetime=new AbortController()).signal;
  const opened=this.event(source,'sourceopen',signal);this.url=URL.createObjectURL(source);this.audio.src=this.url;this.audio.preload='auto';this.audio.load();this.audio.playbackRate=this.rate;
  this.opened=opened.then(()=>{if(signal.aborted)throw aborted();const buffer=this.buffer=source.addSourceBuffer('audio/mpeg');buffer.mode='sequence';source.duration=Infinity;});
  // Pump consumes this failure, including when stop happens before sourceopen.
  void this.opened.catch(()=>{});
  this.audio.ontimeupdate=()=>this.tick();this.audio.onwaiting=()=>this.tick(true);this.audio.onended=()=>this.tick(true);
  this.audio.onplaying=()=>{this.drained=false;if(this.state==='loading')this.publish('playing');};
  this.audio.onpause=()=>{if(this.audio.paused&&!this.audio.ended&&this.state==='playing')this.publish('paused');};
  this.audio.onerror=()=>{if(this.url)this.fail(new Error('Trình duyệt không phát được luồng TTS.'));};
 }
 start(text:string,voice:TikTokVoice,options:TtsOptions,position?:TtsPosition){
  const continuing=this.boundary&&!!this.url&&this.nextText===text&&this.voice.id===voice.id&&!position;
  if(!continuing)this.stop();else {this.generation++;this.pumping=false;this.failed=undefined;this.segments=[];}
  this.boundary=false;this.drained=false;this.nextText='';this.text=text;this.voice=voice;this.rate=options.rate;this.audio.playbackRate=this.rate;this.list=this.chunks(text);this.index=position?this.list.findIndex(s=>s.end>position.offset):0;
  if(this.index<0)this.index=this.list.length;
  if(position&&this.list[this.index]&&position.offset>this.list[this.index].start){const pieces=this.smaller(this.list[this.index]);if(pieces.some(s=>s.start===position.offset)){this.list.splice(this.index,1,...pieces);this.index=this.list.findIndex(s=>s.end>position.offset);}}
  this.appended=this.index;this.resumeTime=position&&this.list[this.index]?.start===position.offset&&Number.isFinite(position.audioTime)?Math.max(0,position.audioTime):0;
  if(!this.list[this.index]){this.stop();this.publish('error','Không có nội dung để đọc.');return;}
  this.publish('loading');if(!this.url)this.attach();void this.pump();
 }
 private async append(blob:Blob,index:number,generation:number){
  await this.opened;const bytes=await blob.arrayBuffer();if(generation!==this.generation)throw aborted();
  const buffer=this.buffer!,signal=this.lifetime!.signal;const start=buffer.buffered.length?buffer.buffered.end(buffer.buffered.length-1):0;
  const updated=this.event(buffer,'updateend',signal);try{buffer.appendBuffer(bytes);}catch(error){this.lifetime!.abort();void updated.catch(()=>{});throw error;}await updated;
  if(generation!==this.generation)throw aborted();const end=buffer.buffered.length?buffer.buffered.end(buffer.buffered.length-1):0;
  if(end<=start)throw new Error('Đoạn MP3 không có âm thanh hợp lệ.');
  if(this.source?.readyState==='open')this.source.duration=Infinity;
  const segment={index,start,end,sentence:this.list[index]};this.segments.push(segment);
  if(index===this.index&&this.resumeTime>0){this.audio.currentTime=start+Math.min(this.resumeTime,Math.max(0,end-start-.01));this.resumeTime=0;}
  const cutoff=Math.min(this.audio.currentTime-30,start);if(cutoff>0&&buffer.buffered.length&&buffer.buffered.start(0)<cutoff){const removed=this.event(buffer,'updateend',signal);buffer.remove(0,cutoff);await removed;}
 }
 private async playNative(){
  const generation=this.generation;
  try{await this.audio.play();if(generation===this.generation&&this.state==='loading')this.publish('playing');}
  catch(error){if(generation===this.generation&&this.state!=='paused'&&(error as Error).name!=='AbortError')this.fail(error as Error);}
 }
 private async pump(){
  if(this.pumping||!this.running()||this.boundary||!this.url)return;
  this.pumping=true;const generation=this.generation;
  try{
   while(generation===this.generation&&this.running()&&this.appended<Math.min(this.list.length,this.index+3)){
    this.retainWindow();
    const index=this.appended,sentence=this.list[index],result=await this.request(sentence);if(generation!==this.generation||!this.running())return;
    if('error' in result){
     if(Array.from(sentence.text).length>100&&/HTTP 50[0234]/.test(result.error.message)){this.requests.delete(this.key(sentence));this.list.splice(index,1,...this.smaller(sentence));this.warm();continue;}
     this.failed={index,error:result.error};this.tick();return;
    }
    await this.append(result.blob,index,generation);if(generation!==this.generation)return;this.appended++;this.warm();
    if(this.running()&&this.audio.paused)void this.playNative();
   }
   if(generation===this.generation&&this.appended===this.list.length&&!this.nextText&&this.source?.readyState==='open'&&!this.buffer?.updating)this.source.endOfStream();
  }catch(error){if(generation===this.generation&&(error as Error).name!=='AbortError')this.fail(error as Error);}
  finally{if(generation===this.generation)this.pumping=false;}
 }
 private running(){return this.state==='playing'||this.state==='loading';}
 private locate(){const time=this.audio.currentTime;const segment=this.segments.find(s=>time>=s.start-.002&&time<s.end-.002);if(segment&&segment.index!==this.index){this.index=segment.index;this.segments=this.segments.filter(s=>s.index>=this.index-1);if(this.state==='playing'||this.state==='loading')this.change(this.state,this.list[this.index]);}}
 private tick(starved=this.drained){
  this.drained=starved;
  if(this.state==='paused'||this.state==='error'||this.state==='idle'||this.boundary)return;this.locate();
  // MP3 encoder padding can leave the native clock just before buffered.end.
  // A genuine waiting/ended event confirms the decoded tail has drained.
  const last=this.segments.at(-1),atTail=!last||this.audio.currentTime>=last.end-.015||starved&&(this.audio.ended||this.audio.currentTime>=last.end-Math.max(.25,.25*this.rate));
  if(atTail&&this.failed){if(this.index!==this.failed.index)this.resumeTime=0;this.index=this.failed.index;this.segments=this.segments.filter(s=>s.index>=this.index);this.fail(this.failed.error);return;}
  if(last&&atTail&&this.appended===this.list.length){
   this.index=this.list.length;this.boundary=true;
   if(!this.nextText){try{if(this.source?.readyState==='open'&&!this.buffer?.updating)this.source.endOfStream();}catch{/* End cleanup below. */}this.stop();}
   this.publish('ended');this.ended();return;
  }
  if(this.audio.readyState<3&&this.state==='playing')this.publish('loading');
  void this.pump();
 }
 private fail(error:Error){if(!this.drained)this.audio.pause();this.publish('error',`TikTok TTS lỗi: ${error.message}`);}
 pause(){if(this.state!=='playing'&&this.state!=='loading')return;this.audio.pause();this.publish('paused');}
 resume(){
  if(this.state!=='paused'&&this.state!=='error')return;
  if(this.failed){const s=this.list[this.failed.index];if(s)this.requests.delete(this.key(s));this.failed=undefined;}
  if(this.lifetime?.signal.aborted||this.audio.error){const position=this.position();this.start(this.text,this.voice,{rate:this.rate,pitch:1,flex:0},position);return;}
  this.publish('loading');void this.pump();if(this.segments.some(s=>s.index===this.index))void this.playNative();
 }
 stop(preserveNext=false){
  if(preserveNext&&this.boundary&&this.nextText&&this.url)return;
  this.generation++;this.pumping=false;this.boundary=false;this.failed=undefined;this.lifetime?.abort();this.lifetime=undefined;
  for(const entry of this.requests.values())entry.controller.abort();this.requests.clear();
  this.audio.ontimeupdate=null;this.audio.onwaiting=null;this.audio.onended=null;this.audio.onerror=null;this.audio.onplaying=null;this.audio.onpause=null;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();if(this.url)URL.revokeObjectURL(this.url);
  this.url=undefined;this.source=undefined;this.buffer=undefined;this.opened=undefined;this.segments=[];this.nextText='';this.state='idle';
 }
}
