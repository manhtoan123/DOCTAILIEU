export type SpeechState='idle'|'loading'|'playing'|'paused'|'ended'|'error';
export interface Sentence {text:string;start:number;end:number}
export function sentences(text:string):Sentence[]{const out:Sentence[]=[];const re=/[^.!?。！？\n]+[.!?。！？\n]*|[.!?。！？\n]+/gu;for(const m of text.matchAll(re)){if(!m[0].trim())continue;for(let i=0;i<m[0].length;i+=240)out.push({text:m[0].slice(i,i+240),start:m.index!+i,end:m.index!+Math.min(i+240,m[0].length)});}return out;}
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
  {id:'tiktok-female-1',name:'Nữ 1',provider:'tiktok' as const,serverId:'tiktok:1',available:true},
  {id:'tiktok-male-1',name:'Nam 1',provider:'tiktok' as const,serverId:'tiktok:2',available:true},
  {id:'tiktok-female-2',name:'Nữ 2',provider:'tiktok' as const,serverId:'tiktok:3',available:true}
];
export const tiktokVoices:TikTokVoice[]=[
  ...voiceOptions.filter((voice):voice is TikTokVoice=>voice.provider==='tiktok')
];
const tiktokEndpoint=()=>import.meta.env.VITE_TIKTOK_TTS_BASE_URL||'/io/s1213/tiktoktts';
export interface TtsOptions {rate:number;pitch:number;flex:number}
function tiktokUrl(text:string,voice?:TikTokVoice,options?:TtsOptions){const url=new URL(tiktokEndpoint(),location.href);url.searchParams.set('text',text);if(voice)url.searchParams.set('voice',voice.serverId);if(options){url.searchParams.set('rate',String(options.rate));url.searchParams.set('pitch',String(options.pitch));url.searchParams.set('flex',String(options.flex));}return url.toString();}
async function fetchTikTokAudio(text:string,voice:TikTokVoice,signal:AbortSignal,options:TtsOptions){
  const urls=[tiktokUrl(text,voice,options),tiktokUrl(text,undefined,options)];let last:Error|undefined;
  for(const url of urls){try{const response=await fetch(url,{signal,credentials:'same-origin'});if(!response.ok)throw new Error(`TikTok TTS HTTP ${response.status}`);if(!response.headers.get('Content-Type')?.toLowerCase().startsWith('audio/'))throw new Error('Gateway chưa trả dữ liệu âm thanh. Kiểm tra cấu hình TTS.');const blob=await response.blob();if(!blob.size)throw new Error('TikTok TTS trả audio rỗng.');return blob;}catch(error){if((error as Error).name==='AbortError')throw error;last=error instanceof Error?error:new Error(String(error));}}
  throw last||new Error('Không gọi được TikTok TTS.');
}
/** TikTok audio adapter. The endpoint must be an approved gateway, not a copied userscript or hidden third-party key. */
export class TikTokPlayer {
  private generation=0;private list:Sentence[]=[];private index=0;private state:SpeechState='idle';private voice=tiktokVoices[0];private options:TtsOptions={rate:1,pitch:1,flex:0};private audio?:HTMLAudioElement;private url?:string;private controller?:AbortController;
  constructor(private change:(state:SpeechState,sentence?:Sentence,message?:string)=>void,private ended:()=>void){}
  start(text:string,voice:TikTokVoice,options:TtsOptions){this.stop();this.list=sentences(text);this.index=0;this.voice=voice;this.options=options;if(!this.list.length){this.change('error',undefined,'Không có nội dung để đọc.');return;}void this.play(++this.generation);}
  private async play(generation:number){if(generation!==this.generation)return;const sentence=this.list[this.index];if(!sentence){this.state='ended';this.change('ended');this.ended();return;}this.state='playing';this.change('playing',sentence);this.controller=new AbortController();try{this.state='playing';this.change('loading',sentence);const blob=await fetchTikTokAudio(sentence.text,this.voice,this.controller.signal,this.options);if(generation!==this.generation)return;this.url=URL.createObjectURL(blob);this.audio=new Audio(this.url);this.audio.playbackRate=this.options.rate;this.audio.onended=()=>{if(generation!==this.generation)return;this.cleanupAudio();this.index++;void this.play(generation);};this.audio.onerror=()=>{if(generation===this.generation){this.state='error';this.change('error',sentence,'TikTok TTS không phát được audio.');}};await this.audio.play();if(generation===this.generation){this.state='playing';this.change('playing',sentence);}}catch(error){if(generation===this.generation&&(error as Error).name!=='AbortError'){this.state='error';this.change('error',sentence,`TikTok TTS lỗi: ${(error as Error).message}`);}}}
  pause(){if(this.state!=='playing'||!this.audio)return;this.audio.pause();this.state='paused';this.change('paused',this.list[this.index]);}
  resume(){if(this.state!=='paused'||!this.audio)return;const generation=this.generation;const audio=this.audio;void audio.play().then(()=>{if(generation!==this.generation||audio!==this.audio)return;this.state='playing';this.change('playing',this.list[this.index]);}).catch(()=>{if(generation!==this.generation||audio!==this.audio)return;this.state='error';this.change('error',this.list[this.index],'Không tiếp tục được TikTok TTS.');});}
  private cleanupAudio(){this.audio?.pause();this.audio=undefined;if(this.url){URL.revokeObjectURL(this.url);this.url=undefined;}}
  stop(){this.generation++;this.controller?.abort();this.cleanupAudio();this.state='idle';this.change('idle');}
}
