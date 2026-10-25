import {ttsAudioCache,ttsAudioCacheKey} from './tts-audio-cache';
import {capcutVietnameseVoices} from '../../../shared/constants/capcut-voices';
import {ContinuousTtsPlayer} from './tts-continuous';
import {TtsMediaKeepAlive} from './tts-media-keepalive';
import {ttsGateway,capcutSessionFailure} from './tts-gateway';
export type SpeechState='idle'|'loading'|'playing'|'paused'|'ended'|'error';
export interface Sentence {text:string;start:number;end:number}
/** Keep natural pauses/whole words within the gateway cap, with exact UTF16 offsets. */
function boundedTtsChunks(text:string,start:number,limit:number):Sentence[]{
  const points=Array.from(text),chunks:Sentence[]=[];let at=0;
  while(at<points.length){
    let end=Math.min(at+limit,points.length);
    if(end<points.length){
      let space=0,clause=0;
      for(let i=at+1;i<=end;i++){
        if(/\s/u.test(points[i-1]))space=i;
        if(/[,;:，、；：]/u.test(points[i-1])&&i-at>=limit/2&&!(/[\p{N}]/u.test(points[i-2]??'')&&/[\p{N}]/u.test(points[i]??'')))clause=i;
      }
      if(clause)end=clause;
      else if(!/\s/u.test(points[end])&&space)end=space;
      // A token longer than the cap still needs a hard cut; avoid detaching marks.
      while(end>at+1&&(/[\p{M}]/u.test(points[end]??'')||points[end]==='\u200d'||points[end-1]==='\u200d'))end--;
    }
    const chunk=points.slice(at,end).join('');chunks.push({text:chunk,start,end:start+chunk.length});start+=chunk.length;at=end;
  }
  return chunks;
}
export function smallerTtsChunks(sentence:Sentence):Sentence[]{
  return boundedTtsChunks(sentence.text,sentence.start,100);
}
export function sentences(text:string,flex=false):Sentence[]{
  const out:Sentence[]=[];
  const re=/[^.!?。！？\n]+[.!?。！？\n]*|[.!?。！？\n]+/gu;
  for(const match of text.matchAll(re)){
    if(!/[\p{L}\p{N}]/u.test(match[0]))continue;
    for(const chunk of boundedTtsChunks(match[0],match.index!,200))if(/[\p{L}\p{N}]/u.test(chunk.text))out.push(chunk);
  }
  if(!flex||out.length<=1)return out;
  const grouped:Sentence[]=[];let current:Sentence|undefined;
  for(const next of out){
    if(!current){current={...next};continue;}
    const gap=text.slice(current.end,next.start);
    const hasDoubleNewline=/\n\s*\n/.test(gap);
    const combined=text.slice(current.start,next.end);
    const combinedLen=Array.from(combined).length;
    const currentLen=Array.from(current.text).length;
    if(combinedLen<=160&&currentLen<80&&(!hasDoubleNewline||currentLen<30)){
      current.end=next.end;current.text=combined;
    }else{
      grouped.push(current);current={...next};
    }
  }
  if(current)grouped.push(current);
  return grouped;
}
/** No audio blobs: Web Speech owns audio playback. Resume restarts current sentence for portability. */
export class BrowserPlayer {
  private generation=0;private list:Sentence[]=[];private index=0;private state:SpeechState='idle';private voice?:SpeechSynthesisVoice;private rate=1;
  constructor(private change:(state:SpeechState,sentence?:Sentence,message?:string)=>void,private ended:()=>void){}
  start(text:string,voice:SpeechSynthesisVoice|undefined,rate:number){this.stop();if(!('speechSynthesis'in window)){this.change('error',undefined,'Trình duyệt không hỗ trợ giọng đọc.');return;}this.list=sentences(text);this.index=0;this.voice=voice;this.rate=rate;if(!this.list.length){this.change('error',undefined,'Không có nội dung để đọc.');return;}this.play(this.generation);}
  private play(generation:number){if(generation!==this.generation)return;const sentence=this.list[this.index];if(!sentence){this.state='ended';this.change('ended');this.ended();return;}this.state='playing';this.change('playing',sentence);const u=new SpeechSynthesisUtterance(sentence.text);u.lang='vi-VN';u.voice=this.voice||null;u.rate=this.rate;u.onend=()=>{if(generation===this.generation){this.index++;this.play(generation);}};u.onerror=(e)=>{if(generation===this.generation&&e.error!=='canceled'&&e.error!=='interrupted'){this.state='error';this.change('error',sentence,`Giọng đọc báo lỗi: ${e.error}`);}};speechSynthesis.speak(u);}
  pause(){if(this.state!=='playing')return;this.generation++;speechSynthesis.cancel();this.state='paused';this.change('paused',this.list[this.index]);}
  resume(){if(this.state!=='paused')return;this.play(++this.generation);}
  stop(){this.generation++;if('speechSynthesis'in window)speechSynthesis.cancel();this.state='idle';this.change('idle');}
}

export type TtsProvider='bing'|'google-cloud'|'google-translate'|'tiktok';
export interface VoiceOption {id:string;name:string;provider:TtsProvider;serverId:string;available:boolean}
export interface TikTokVoice extends VoiceOption {provider:'tiktok'}
export const voiceOptions:VoiceOption[]=[
  ...['Hoài My','Nam Minh','Andrew','Ava','Brian','Emma','Seraphina','Florian','Vivienne','Remy'].map((name,i)=>({id:`bing-${i}`,name,provider:'bing' as const,serverId:`BingTTS:${i}`,available:false})),
  ...['Nữ 1','Nữ 2','Nữ 3','Nam 1','Nam 2','Nam 3'].map((name,i)=>({id:`google-cloud-${i}`,name,provider:'google-cloud' as const,serverId:`GoogleCloudTTS:${i}`,available:false})),
  {id:'google-translate-0',name:'Chị Google',provider:'google-translate',serverId:'GoogleTranslateTTS:0',available:false},
  ...(import.meta.env.VITE_TTS_GATEWAY==='capcut-v2'
    ?capcutVietnameseVoices.map(voice=>({id:voice.id,name:voice.name,provider:'tiktok' as const,serverId:voice.serverId,available:true}))
    :[
  {id:'tiktok-female-1',name:'Nữ 1',provider:'tiktok' as const,serverId:'BV074_streaming',available:true},
  {id:'tiktok-male-1',name:'Nam 1',provider:'tiktok' as const,serverId:'BV075_streaming',available:true},
  {id:'tiktok-female-2',name:'Nữ 2',provider:'tiktok' as const,serverId:'tiktok:3',available:false}
    ])
];
export const tiktokVoices:TikTokVoice[]=[
  ...voiceOptions.filter((voice):voice is TikTokVoice=>voice.provider==='tiktok')
];
const TIKTOK_ENDPOINT=ttsGateway(import.meta.env.VITE_TTS_GATEWAY);
const MAX_RESPONSE_BYTES=2*1024*1024;
const REQUEST_TIMEOUT_MS=30000;
class TtsRequestError extends Error {
  constructor(message:string,readonly retryAfterMs=0){super(message);}
}
class TtsSessionError extends Error {constructor(message:string,readonly waiting=false){super(message);}}
function canResumeTts(error:Error){
  if(error instanceof TtsSessionError)return error.waiting;
  if(error.name==='AbortError'||error.name==='NotAllowedError')return false;
  const status=/HTTP (\d{3})/.exec(error.message)?.[1];
  if(status)return status==='408'||status==='429'||Number(status)>=500;
  return !/chưa được hỗ trợ|quá lớn/.test(error.message);
}
export interface TtsOptions {rate:number;pitch:number;flex:number}
export interface TtsPosition {offset:number;audioTime:number;grouping?:'natural'|'sentence'}
export interface TtsTiming {kind:'start'|'chunk'|'chapter';offset:number;waitMs:number;gatewayMs:number;prefetched:boolean;mediaMs?:number}
export interface TtsResources {requests:number;pending:number;nextReady:boolean;activeAudio:boolean;activeUrl:boolean}
interface AudioRequest {controller:AbortController;result:Promise<{blob:Blob;error?:never}|{error:Error;blob?:never}>;ready:boolean;settled:boolean;durationMs:number;started:boolean;start:()=>void;cacheKey?:string;audioSeconds?:number;fromCache?:boolean}
let mediaOwner:TikTokPlayer|undefined;
async function fetchTikTokAudio(text:string,voice:TikTokVoice,signal:AbortSignal){
  if(!tiktokVoices.some(v=>v.available&&v.id===voice.id&&v.serverId===voice.serverId))throw new Error('Giọng TikTok này chưa được hỗ trợ.');
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let rejectCancellation!:(reason:Error)=>void;
  const cancellation=new Promise<never>((_resolve,reject)=>{rejectCancellation=reject;});
  const abort=()=>{controller.abort();rejectCancellation(new DOMException('Đã dừng TikTok TTS.','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  timer=setTimeout(()=>{controller.abort();rejectCancellation(new Error('TikTok TTS quá thời gian chờ (30 giây).'));},REQUEST_TIMEOUT_MS);
  const retryDelay=()=>new Promise<void>((resolve,reject)=>{const canceled=()=>{clearTimeout(delay);reject(new DOMException('Đã dừng TikTok TTS.','AbortError'));};const delay=setTimeout(()=>{controller.signal.removeEventListener('abort',canceled);resolve();},600);controller.signal.addEventListener('abort',canceled,{once:true});if(controller.signal.aborted)canceled();});
  const request=async()=>{
    let response!:Response;
    for(let attempt=0;attempt<2;attempt++){
      try{response=await fetch(TIKTOK_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice:voice.serverId}),signal:controller.signal,credentials:'omit'});}
      catch(error){
        // Cancellation and the shared 30s deadline are never retried; a plain
        // network failure may be transient, so retry once with the same sentence.
        if(controller.signal.aborted||attempt===1||(error as Error)?.name==='AbortError')throw error;
        await retryDelay();continue;
      }
      if(TIKTOK_ENDPOINT==='/api/tts'&&[401,403,422,503].includes(response.status)){
        // Parse only a bounded, recognized server code, never display arbitrary
        // upstream errors. Missing/expired sessions need user reconnection.
        const reader=response.body?.getReader();let raw='',size=0;
        try{if(reader)for(;;){const part=await Promise.race([reader.read(),cancellation]);if(part.done)break;size+=part.value.length;if(size>4096)break;raw+=new TextDecoder().decode(part.value);}}
        finally{void reader?.cancel().catch(()=>{});reader?.releaseLock();}
        let code:unknown;try{code=(JSON.parse(raw) as {error?:unknown}).error;}catch{/* not a session response */}
        const message=capcutSessionFailure(code);if(message)throw new TtsSessionError(message,code==='capcut_session_expired');
      }
      if(attempt===1||![500,502,503,504].includes(response.status))break;
      void response.body?.cancel().catch(()=>{});
      await retryDelay();
    }
    if(!response.ok){const hint=response.headers.get('Retry-After'),seconds=hint&&/^\d+$/.test(hint)?Number(hint)*1000:hint?Date.parse(hint)-Date.now():0;throw new TtsRequestError(`TikTok TTS HTTP ${response.status}`,Number.isFinite(seconds)?Math.max(0,Math.min(seconds,86400000)):0);}
    if(!response.headers.get('Content-Type')?.toLowerCase().includes('application/json'))throw new Error('Gateway chưa trả JSON âm thanh TikTok.');
    const declared=response.headers.get('Content-Length');
    if(declared&&Number(declared)>MAX_RESPONSE_BYTES)throw new Error('Phản hồi TikTok TTS quá lớn.');
    if(!response.body)throw new Error('TikTok TTS trả phản hồi rỗng.');
    const reader=response.body.getReader();const cancelBody=()=>{void reader.cancel().catch(()=>{});};
    controller.signal.addEventListener('abort',cancelBody,{once:true});
    if(controller.signal.aborted)cancelBody();
    const chunks:Uint8Array[]=[];let size=0;
    try{
      while(true){const {value,done}=await reader.read();if(controller.signal.aborted)throw new DOMException('Đã dừng TikTok TTS.','AbortError');if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw new Error('Phản hồi TikTok TTS quá lớn.');chunks.push(value);}
    }finally{controller.signal.removeEventListener('abort',cancelBody);await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let payload:unknown;
    try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('TikTok TTS trả JSON không hợp lệ.');}
    if(!payload||typeof payload!=='object')throw new Error('TikTok TTS trả JSON không hợp lệ.');
    const result=payload as {success?:unknown;data?:unknown};
    if(result.success!==true)throw new Error('Gateway TikTok TTS không tạo được âm thanh.');
    if(typeof result.data!=='string'||!result.data.length||result.data.length%4!==0||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.data))throw new Error('TikTok TTS trả base64 không hợp lệ.');
    const decoded=atob(result.data);
    if(btoa(decoded)!==result.data)throw new Error('TikTok TTS trả base64 không hợp lệ.');
    const audio=Uint8Array.from(decoded,c=>c.charCodeAt(0));
    // Container/header screening; decoding failures are reported by HTMLAudioElement.
    const id3=audio.length>=10&&audio[0]===0x49&&audio[1]===0x44&&audio[2]===0x33;
    const frame=audio.length>=4&&audio[0]===0xff&&(audio[1]&0xe0)===0xe0&&(audio[1]&0x18)!==0x08&&(audio[1]&6)!==0&&(audio[2]&0xf0)!==0&&(audio[2]&0xf0)!==0xf0&&(audio[2]&0x0c)!==0x0c;
    if(!id3&&!frame)throw new Error('TikTok TTS trả dữ liệu không phải MP3.');
    return new Blob([audio],{type:'audio/mpeg'});
  };
  try{return await Promise.race([request(),cancellation]);}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
}
/** TikTok audio adapter. The endpoint must be an approved gateway, not a copied userscript or hidden third-party key. */
export class TikTokPlayer {
  private badCache=new Set<string>();private draining=false;private generation=0;private playback=0;private list:Sentence[]=[];private index=0;private state:SpeechState='idle';private voice=tiktokVoices[0];private options:TtsOptions={rate:1,pitch:1,flex:0};private audio?:HTMLAudioElement;private element?:HTMLAudioElement;private url?:string;
  // At most three active requests; a bounded adaptive lookahead may retain more
  // completed chunks. Derived audio cache is device-only and never edits cursors.
  private requests=new Map<string,AudioRequest>();
  private nextText='';private nextFirst?:Sentence;private transitionAt?:number;private timings:TtsTiming[]=[];private resumeAttempt=0;private deferredEnd=false;
  private continuous?:ContinuousTtsPlayer;
  private retryTimer?:ReturnType<typeof setTimeout>;
  private recoveryAttempt=0;private gatewayMs=7000;private secondsPerChar=.065;
  private clearRetry(){clearTimeout(this.retryTimer);this.retryTimer=undefined;}
  private recover(error:Error,sentence:Sentence,generation:number){
    if(generation!==this.generation)return;
    this.clearRetry();this.cancelRequests();this.cleanupAudio();
    if(this.state==='paused'){this.change('paused',sentence);return;}
    if(!canResumeTts(error)){this.keepAlive.pause();this.state='error';this.mediaState('none');this.change('error',sentence,`TikTok TTS lỗi: ${error.message}`);return;}
    const waiting=error instanceof TtsSessionError&&error.waiting;
    const delay=waiting?60000:Math.max(Math.min(30000,2000*2**Math.min(this.recoveryAttempt++,4)),error instanceof TtsRequestError?error.retryAfterMs:0);
    this.state='loading';this.mediaState('paused');
    this.change('loading',sentence,waiting?'Phiên CapCut cần kết nối lại. Đang giữ vị trí; tự tiếp tục khi phiên được khôi phục.':`Kết nối giọng đọc gián đoạn: ${error.message}. Tự thử lại sau ${Math.ceil(delay/1000)} giây; giữ vị trí nghe.`);
    const retry=()=>{
      this.retryTimer=undefined;if(generation!==this.generation||this.state!=='loading')return;
      if(typeof navigator!=='undefined'&&navigator.onLine===false){this.retryTimer=setTimeout(retry,1000);return;}
      void this.play(generation);
    };
    this.retryTimer=setTimeout(retry,delay);
  }
  private keepAlive=new TtsMediaKeepAlive();
  // MSE remains an explicit test-only experiment after the Android regression.
  constructor(private change:(state:SpeechState,sentence?:Sentence,message?:string)=>void,private ended:()=>void,private mediaStop?:()=>void,private continuousEnabled=false){}
  setMediaKeepAlive(enabled:boolean){this.keepAlive.setEnabled(!this.continuous&&enabled,this.state==='playing'||this.state==='loading');}
  private legacyResumeUntil=0;
  chunking():'natural'|'sentence'{return (this.list[this.index]?.start??Infinity)<this.legacyResumeUntil?'sentence':this.options.flex>0?'natural':'sentence';}
  private resumeTime=0;
  private pendingSeek=false;
  position():TtsPosition{if(this.continuous)return this.continuous.position();return {offset:this.list[this.index]?.start??(this.list.at(-1)?.end??0),audioTime:!this.pendingSeek&&Number.isFinite(this.audio?.currentTime)?this.audio!.currentTime:this.resumeTime};}
  diagnostics(){return this.timings.map(t=>({...t}));}
  resources():TtsResources{if(this.continuous)return this.continuous.resources();const next=this.list[this.index+1]??this.nextFirst;return {requests:this.requests.size,pending:[...this.requests.values()].filter(r=>r.started&&!r.settled).length,nextReady:!!next&&this.requests.get(this.requestKey(next))?.ready===true,activeAudio:!!this.audio,activeUrl:!!this.url};}
  prepareNext(text=''){if(this.continuous){this.continuous.prepareNext(text);return;}this.nextText=text;this.nextFirst=sentences(text,this.options.flex>0)[0];if(this.state==='playing'||this.state==='loading')this.prefetch(this.generation);}
  setMediaTitle(title:string,artist:string){if(mediaOwner===this&&typeof MediaMetadata!=='undefined')try{navigator.mediaSession.metadata=new MediaMetadata({title,artist});}catch{/* Optional lock-screen labels. */}}
  start(text:string,voice:TikTokVoice,options:TtsOptions,position?:TtsPosition){
    const element=this.continuousEnabled&&typeof MediaSource!=='undefined'&&typeof HTMLMediaElement!=='undefined'?(this.element??(this.element=new Audio())):undefined;
    if(element&&ContinuousTtsPlayer.supported(element)){
      this.keepAlive.setEnabled(false);this.claimMedia();
      this.continuous??=new ContinuousTtsPlayer(element,fetchTikTokAudio,sentences,smallerTtsChunks,(state,sentence,message)=>{this.state=state;if(state==='playing'||state==='paused')this.mediaState(state);else if(state==='error')this.mediaState('paused');else if(state==='ended'&&!this.continuous?.resources().activeAudio)this.mediaState('none');this.change(state,sentence,message);},()=>this.ended());
      this.continuous.start(text,voice,options,position);if(this.nextText&&this.nextText!==text)this.continuous.prepareNext(this.nextText);this.nextText='';return;
    }
    const continuing=this.transitionAt!==undefined&&this.nextText===text&&!position&&this.voice.id===voice.id;
    const transitionAt=continuing?this.transitionAt:undefined;
    this.stop(continuing);this.transitionAt=undefined;this.nextText='';this.nextFirst=undefined;if(!continuing)this.timings=[];
    this.voice=voice;this.options=options;this.legacyResumeUntil=0;
    this.list=sentences(text,options.flex>0);this.index=position?this.list.findIndex(s=>s.end>position.offset):0;if(this.index<0)this.index=this.list.length;this.resumeTime=position&&Number.isFinite(position.audioTime)?Math.max(0,position.audioTime):0;
    // A saved time belongs to the exact old sentence, not its newly grouped audio.
    if(position&&position.grouping!=='natural'&&options.flex>0){const grouped=this.list[this.index],strict=sentences(text),container=strict.find(s=>s.end>position.offset),pieces=container?(container.start===position.offset?[container]:smallerTtsChunks(container)):[],old=pieces.find(s=>s.start===position.offset);if(grouped&&old&&grouped.text!==old.text){this.legacyResumeUntil=grouped.end;const tail=[...pieces.filter(s=>s.start>=old.end&&s.end<=grouped.end),...strict.filter(s=>s.start>=(container?.end??old.end)&&s.end<=grouped.end)];this.list.splice(this.index,1,old,...tail);}}
    const resumed=this.list[this.index];if(position&&resumed&&position.offset>resumed.start){const pieces=smallerTtsChunks(resumed);if(pieces.some(piece=>piece.start===position.offset)){this.list.splice(this.index,1,...pieces);this.index=this.list.findIndex(piece=>piece.end>position.offset);}}
    if(position&&this.list[this.index]?.start!==position.offset)this.resumeTime=0;
    if(!this.list.length){this.cancelRequests();this.change('error',undefined,'Không có nội dung để đọc.');return;}
    this.claimMedia();this.keepAlive.start();void this.play(++this.generation,transitionAt??performance.now(),continuing?'chapter':'start');
  }
  private requestKey(sentence:Sentence){return JSON.stringify([this.voice.id,this.voice.serverId,sentence.text]);}
  private request(sentence:Sentence){
    const key=this.requestKey(sentence),existing=this.requests.get(key);if(existing)return existing.result;
    const controller=new AbortController(),generation=this.generation;
    let resolve!:(result:{blob:Blob;error?:never}|{error:Error;blob?:never})=>void;
    const entry:AudioRequest={controller,ready:false,settled:false,started:false,durationMs:0,start:()=>{},result:new Promise(done=>{resolve=done;})};
    const finish=(result:{blob:Blob;error?:never}|{error:Error;blob?:never})=>{if(entry.settled)return;entry.settled=true;entry.ready=!!result.blob;controller.signal.removeEventListener('abort',cancel);resolve(result);this.pumpRequests();if(generation===this.generation&&this.state==='playing')this.prefetch(generation);};
    const cancel=()=>finish({error:new DOMException('Đã dừng.','AbortError')});controller.signal.addEventListener('abort',cancel,{once:true});
    entry.start=()=>{entry.started=true;void(async()=>{
      if(TIKTOK_ENDPOINT==='/api/tts'){
        try{const resource=capcutVietnameseVoices.find(v=>v.serverId===this.voice.serverId)?.resource??'';entry.cacheKey=await ttsAudioCacheKey(TIKTOK_ENDPOINT+':'+this.voice.serverId+':'+resource,sentence.text);const saved=this.badCache.has(entry.cacheKey)?undefined:await ttsAudioCache.get(entry.cacheKey,controller.signal);if(saved){entry.fromCache=true;entry.audioSeconds=saved.duration;return saved.blob;}}catch{/* Storage is optional. */}
      }
      if(controller.signal.aborted)throw new DOMException('Đã dừng.','AbortError');
      const started=performance.now(),blob=await fetchTikTokAudio(sentence.text,this.voice,controller.signal);entry.durationMs=performance.now()-started;
      if(controller.signal.aborted)throw new DOMException('Đã dừng.','AbortError');
      this.gatewayMs=this.gatewayMs*.65+entry.durationMs*.35;
      if(entry.cacheKey)void ttsAudioCache.put(entry.cacheKey,blob,controller.signal).catch(()=>{});
      return blob;
    })().then(blob=>finish({blob}),error=>finish({error:error instanceof Error?error:new Error(String(error))}));};
    this.requests.set(key,entry);this.pumpRequests();return entry.result;
  }
  private discardAudio(sentence:Sentence,blob:Blob){const key=this.requests.get(this.requestKey(sentence))?.cacheKey;if(!key)return;this.badCache.add(key);while(this.badCache.size>128)this.badCache.delete(this.badCache.values().next().value!);void ttsAudioCache.invalidate(key,blob).catch(()=>{});}
  private pumpRequests(){
    if(this.draining)return;
    let pending=[...this.requests.values()].filter(r=>r.started&&!r.settled).length;
    for(const entry of this.requests.values())if(pending<3&&!entry.started&&!entry.settled&&!entry.controller.signal.aborted){pending++;entry.start();}
  }
  private bufferWindow(){
    if(TIKTOK_ENDPOINT!=='/api/tts'){const window=this.list.slice(this.index,this.index+3);if(window.length<3&&this.nextFirst)window.push(this.nextFirst);return window;}
    const target=Math.min(45,Math.max(12,this.gatewayMs/1000*2+3)),rate=Math.max(.5,this.options.rate);
    let covered=this.audio&&Number.isFinite(this.audio.duration)?Math.max(0,this.audio.duration-this.audio.currentTime)/rate:0;
    const window:Sentence[]=[];
    for(let at=this.index;at<this.list.length&&window.length<12;at++){
      const sentence=this.list[at];if(at>this.index&&covered>=target)break;window.push(sentence);
      if(at>this.index)covered+=(this.requests.get(this.requestKey(sentence))?.audioSeconds??Array.from(sentence.text).length*this.secondsPerChar)/rate;
    }
    if(window.length<12&&this.list.length-this.index===window.length&&this.nextFirst&&covered<target)window.push(this.nextFirst);
    return window;
  }
  private retainWindow(){
    const window=this.bufferWindow(),keys=new Set(window.map(sentence=>this.requestKey(sentence)));
    this.draining=true;try{for(const [key,request] of this.requests)if(!keys.has(key)){this.requests.delete(key);request.controller.abort();}}finally{this.draining=false;}
    this.pumpRequests();return window;
  }
  private prefetch(generation:number){
    if(generation!==this.generation)return;
    if(this.state==='loading'&&this.index===0&&!this.requests.get(this.requestKey(this.list[0]))?.ready)return;
    for(const sentence of this.retainWindow())if(sentence!==this.list[this.index])void this.request(sentence);
  }
  private cancelRequests(){this.draining=true;try{for(const request of this.requests.values())request.controller.abort();this.requests.clear();}finally{this.draining=false;}}
  private async play(generation:number,started=performance.now(),kind:TtsTiming['kind']='chunk'){
    if(generation!==this.generation)return;
    const sentence=this.list[this.index];
    if(!sentence){this.transitionAt=started;this.stop(!!this.nextFirst);this.state='ended';this.change('ended');this.ended();return;}
    const playback=++this.playback;
    this.retainWindow();this.state='loading';this.change('loading',sentence);
    let playbackAudio:HTMLAudioElement|undefined;
    try{
      // The first fetch gets the gateway to itself. Lookahead starts as soon as
      // that chunk plays; subsequent transitions keep the next-two window warm.
      const prefetched=this.requests.get(this.requestKey(sentence))?.ready===true;
      const current=this.request(sentence);this.prefetch(generation);
      const result=await current;
      if(generation!==this.generation)return;
      if('error' in result){
        if(this.resumeTime===0&&Array.from(sentence.text).length>100&&/HTTP 50[0234]/.test(result.error!.message)){
          this.list.splice(this.index,1,...smallerTtsChunks(sentence));this.resumeTime=0;void this.play(generation,started,kind);return;
        }
        throw result.error;
      }
      const blob=result.blob;
      const mediaStarted=performance.now();
      const previousUrl=this.url;this.url=URL.createObjectURL(blob);const audio=this.element??(this.element=new Audio());playbackAudio=audio;this.audio=audio;audio.preload='auto';audio.onloadedmetadata=null;audio.src=this.url;audio.playbackRate=this.options.rate;
      if(previousUrl)URL.revokeObjectURL(previousUrl);
      // Until a saved seek succeeds, time=0 on a fresh element is not a checkpoint.
      // Pause/pagehide/error during metadata loading must retain the saved time.
      this.pendingSeek=this.resumeTime>0;
      const seek=()=>{
        if(generation!==this.generation||playback!==this.playback||audio!==this.audio)return;
        try{audio.currentTime=this.resumeTime;if(Math.abs(audio.currentTime-this.resumeTime)<0.01){this.pendingSeek=false;}}catch{/* Retry after metadata arrives. */}
      };
      const metadata=()=>{if(generation!==this.generation||playback!==this.playback||audio!==this.audio)return;if(Number.isFinite(audio.duration)&&audio.duration>0){const entry=this.requests.get(this.requestKey(sentence));if(entry){entry.audioSeconds=audio.duration;if(entry.cacheKey)void ttsAudioCache.duration(entry.cacheKey,audio.duration).catch(()=>{});}this.secondsPerChar=this.secondsPerChar*.7+audio.duration/Math.max(1,Array.from(sentence.text).length)*.3;}seek();if(!this.pendingSeek)audio.onloadedmetadata=null;this.prefetch(generation);};
      audio.onloadedmetadata=metadata;audio.ontimeupdate=()=>{if(generation===this.generation&&audio===this.audio&&this.state==='playing')this.prefetch(generation);};seek();if(audio.readyState>=1)metadata();
      let failed=false;
      const advance=()=>{audio.onended=null;audio.onerror=null;audio.onloadedmetadata=null;audio.ontimeupdate=null;this.audio=undefined;this.resumeTime=0;this.pendingSeek=false;this.deferredEnd=false;this.recoveryAttempt=0;this.index++;void this.play(generation,performance.now());};
      audio.onended=()=>{if(generation!==this.generation||playback!==this.playback||audio!==this.audio)return;if(this.state==='paused'){this.deferredEnd=true;return;}advance();};
      audio.onerror=()=>{if(generation!==this.generation||playback!==this.playback||audio!==this.audio)return;failed=true;this.discardAudio(sentence,blob);this.recover(new Error('Không phát được audio'),sentence,generation);};
      await audio.play();
      if(generation===this.generation&&playback===this.playback&&audio===this.audio&&!failed&&this.state==='loading'){
        this.timings.push({kind,offset:sentence.start,waitMs:Math.round(performance.now()-started),gatewayMs:Math.round(this.requests.get(this.requestKey(sentence))?.durationMs??0),prefetched,mediaMs:Math.round(performance.now()-mediaStarted)});if(this.timings.length>120)this.timings.shift();
        this.state='playing';this.mediaState('playing');this.change('playing',sentence,this.recoveryAttempt?'Đã kết nối lại TikTok TTS, tiếp tục nghe.':undefined);this.prefetch(generation);
      }
    }catch(error){if(generation===this.generation&&playback===this.playback&&(!playbackAudio||playbackAudio===this.audio)&&(error as Error).name!=='AbortError'){const entry=this.requests.get(this.requestKey(sentence));if(playbackAudio&&entry?.cacheKey&&(error as Error).name!=='NotAllowedError'){this.badCache.add(entry.cacheKey);const result=await entry.result;if(result.blob)this.discardAudio(sentence,result.blob);}this.recover(error instanceof Error?error:new Error(String(error)),sentence,generation);}}
  }
  pause(){this.clearRetry();if(this.continuous){this.continuous.pause();return;}if(this.state!=='playing'&&this.state!=='loading')return;this.keepAlive.pause();this.resumeAttempt++;if(this.state==='loading'){this.generation++;this.cancelRequests();this.cleanupAudio();}else this.audio?.pause();this.state='paused';this.mediaState('paused');this.change('paused',this.list[this.index]);}
  resume(){
    if(this.continuous){this.continuous.resume();return;}
    // A failed request/audio keeps its current chunk and media time. Retry the
    // same session instead of rebuilding it from an optional persisted cursor.
    if(this.state!=='paused'&&this.state!=='error')return;
    this.keepAlive.start();

    if(this.audio&&(this.deferredEnd||this.audio.ended)){this.cleanupAudio();this.resumeTime=0;this.deferredEnd=false;this.index++;void this.play(++this.generation);return;}
    if(!this.audio){void this.play(++this.generation);return;}
    const generation=this.generation,attempt=++this.resumeAttempt;const audio=this.audio;this.state='loading';this.change('loading',this.list[this.index]);
    void audio.play().then(()=>{if(generation!==this.generation||attempt!==this.resumeAttempt||audio!==this.audio||this.state!=='loading')return;this.state='playing';this.mediaState('playing');this.change('playing',this.list[this.index]);}).catch(error=>{if(generation!==this.generation||attempt!==this.resumeAttempt||audio!==this.audio)return;this.recover(error instanceof Error?error:new Error(String(error)),this.list[this.index],generation);});
  }
  private cleanupAudio(){if(this.audio&&!this.pendingSeek&&Number.isFinite(this.audio.currentTime))this.resumeTime=this.audio.currentTime;this.pendingSeek=false;const audio=this.audio??this.element;if(audio){audio.onended=null;audio.onerror=null;audio.onloadedmetadata=null;audio.ontimeupdate=null;audio.pause();audio.removeAttribute('src');audio.load();this.audio=undefined;}if(this.url){URL.revokeObjectURL(this.url);this.url=undefined;}}
  private claimMedia(){
    if(typeof navigator==='undefined'||!navigator.mediaSession)return;mediaOwner=this;
    try{navigator.mediaSession.setActionHandler('play',()=>this.resume());navigator.mediaSession.setActionHandler('pause',()=>this.pause());navigator.mediaSession.setActionHandler('stop',()=>this.mediaStop?this.mediaStop():this.stop());}catch{/* Media Session is optional. */}
  }
  private mediaState(state:MediaSessionPlaybackState){if(mediaOwner===this)try{navigator.mediaSession.playbackState=state;}catch{/* Optional browser controls. */}}
  private releaseMedia(){if(mediaOwner!==this)return;this.mediaState('none');mediaOwner=undefined;try{navigator.mediaSession.metadata=null;for(const action of ['play','pause','stop'] as const)navigator.mediaSession.setActionHandler(action,null);}catch{/* Optional browser controls. */}}
  stop(preserveNext=false){
    this.clearRetry();this.recoveryAttempt=0;
    this.keepAlive.stop();
    if(this.continuous){this.continuous.stop(preserveNext);if(!this.continuous.resources().activeAudio){this.state='idle';this.releaseMedia();this.change('idle');}return;}

    this.generation++;this.playback++;this.resumeAttempt++;this.deferredEnd=false;
    const first=preserveNext?this.nextFirst:undefined,key=first?this.requestKey(first):undefined;
    this.draining=true;try{for(const [requestKey,request] of this.requests)if(requestKey!==key){request.controller.abort();this.requests.delete(requestKey);}}finally{this.draining=false;}
    this.cleanupAudio();this.state='idle';this.mediaState('none');if(!preserveNext){this.nextText='';this.nextFirst=undefined;this.transitionAt=undefined;this.releaseMedia();}this.change('idle');
  }
}
