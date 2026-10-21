const KEY='tts-media-keepalive-v1';
export function readMediaKeepAliveEnabled(){return true;}
export function writeMediaKeepAliveEnabled(enabled:boolean){try{localStorage.setItem(KEY,enabled?'1':'0');}catch{/* Device preference only. */}}
/** Same silent PCM format as the successful trial, generated locally: no HTTP request. */
export function createMediaKeepAliveBlob(){
 const rate=24000,bytes=rate*10*2,buffer=new ArrayBuffer(44+bytes),view=new DataView(buffer);
 const text=(at:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+bytes,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes,true);
 return new Blob([buffer],{type:'audio/wav'});
}
export class TtsMediaKeepAlive {
 private enabled=false;private wanted=false;private epoch=0;private audio?:HTMLAudioElement;private url?:string;
 setEnabled(enabled:boolean,active=false){this.enabled=enabled;if(!enabled)this.stop();else if(active)this.start();}
 start(){
  if(!this.enabled||this.wanted)return;this.wanted=true;const epoch=++this.epoch;
  try{
   const audio=this.audio??(this.audio=new Audio());
   if(!this.url){this.url=URL.createObjectURL(createMediaKeepAliveBlob());audio.src=this.url;audio.loop=true;audio.preload='auto';audio.volume=.01;}
   audio.onerror=()=>{if(epoch===this.epoch){this.wanted=false;this.epoch++;audio.pause();}};
   void audio.play().then(()=>{if(epoch!==this.epoch&&!this.wanted)audio.pause();}).catch(()=>{if(epoch===this.epoch){this.wanted=false;this.epoch++;audio.pause();}});
  }catch{this.wanted=false;}
 }
 pause(){this.wanted=false;this.epoch++;this.audio?.pause();}
 stop(){this.wanted=false;this.epoch++;if(this.audio){this.audio.onerror=null;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();}if(this.url)URL.revokeObjectURL(this.url);this.url=undefined;}
}
