/** Disposable, device-only derived audio. Never imports or edits reading cursors. */
interface AudioRow {key:string;blob:Blob;bytes:number;digest:string;created:number;accessed:number;duration?:number}
interface Options {name?:string;maxBytes?:number;maxEntries?:number;ttlMs?:number;now?:()=>number;factory?:IDBFactory|null}
const MAX_AUDIO=1024*1024;
async function digest(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function ttsAudioCacheKey(scope:string,text:string){return digest(new TextEncoder().encode(JSON.stringify(['tts-audio-v1',scope,text])).buffer);}
function mp3(b:Uint8Array){return b.length>=10&&b[0]===73&&b[1]===68&&b[2]===51||b.length>=4&&b[0]===255&&(b[1]&224)===224&&(b[1]&24)!==8&&(b[1]&6)!==0&&(b[2]&240)!==0&&(b[2]&240)!==240&&(b[2]&12)!==12;}
export class TtsAudioCache {
 private connection?:Promise<IDBDatabase|undefined>;
 private now:()=>number;private maxBytes:number;private maxEntries:number;private ttl:number;
 constructor(private options:Options={}){this.now=options.now??Date.now;this.maxBytes=options.maxBytes??32*1024*1024;this.maxEntries=options.maxEntries??256;this.ttl=options.ttlMs??86400000;}
 private open(){return this.connection??=new Promise<IDBDatabase|undefined>(resolve=>{
  let factory:IDBFactory|null|undefined;try{factory=this.options.factory===undefined?globalThis.indexedDB:this.options.factory;}catch{resolve(undefined);return;}if(!factory){resolve(undefined);return;}
  let finished=false;const finish=(db?:IDBDatabase)=>{if(finished){db?.close();return;}finished=true;clearTimeout(timer);resolve(db);};const timer=setTimeout(()=>finish(),200);
  try{const request=factory.open(this.options.name??'thu-phong-audio-v1',1);request.onupgradeneeded=()=>{request.result.createObjectStore('audio',{keyPath:'key'}).createIndex('accessed','accessed');};request.onerror=()=>finish();request.onblocked=()=>finish();request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();this.connection=undefined;};finish(request.result);};}catch{finish();}
 });}
 private async run<R>(mode:IDBTransactionMode,action:(store:IDBObjectStore,done:(result:R)=>void)=>void,signal?:AbortSignal):Promise<R|undefined>{
  if(signal?.aborted)return;const db=await this.open();if(!db||signal?.aborted)return;
  return new Promise(resolve=>{let tx:IDBTransaction|undefined,result:R|undefined,finished=false;
   const finish=(value?:R)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);resolve(value);};
   const cancel=()=>{try{tx?.abort();}catch{}finish();};const timer=setTimeout(cancel,300);
   signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){cancel();return;}
   try{tx=db.transaction('audio',mode);tx.oncomplete=()=>finish(result);tx.onerror=()=>finish();tx.onabort=()=>finish();action(tx.objectStore('audio'),value=>{result=value;});}catch{cancel();}
  });
 }
 async get(key:string,signal?:AbortSignal):Promise<{blob:Blob;duration?:number}|undefined>{
  const row=await this.run<AudioRow>('readonly',(s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);},signal);if(!row||signal?.aborted)return;
  const now=this.now();let valid=false;
  try{valid=row.key===key&&row.blob instanceof Blob&&row.blob.type==='audio/mpeg'&&row.bytes===row.blob.size&&row.bytes>0&&row.bytes<=MAX_AUDIO&&Number.isFinite(row.created)&&row.created<=now+60000&&now-row.created<this.ttl&&Number.isFinite(row.accessed)&&/^[a-f0-9]{64}$/.test(row.digest);if(valid){const b=await row.blob.arrayBuffer();valid=mp3(new Uint8Array(b))&&await digest(b)===row.digest;}}catch{valid=false;}
  if(signal?.aborted)return;
  if(!valid){await this.remove(key,row.digest,row.created);return;}
  void this.run('readwrite',(s,done)=>{const r=s.get(key);r.onsuccess=()=>{const current=r.result as AudioRow|undefined;if(current?.digest===row.digest&&current.created===row.created)s.put({...current,accessed:now});done(true);};},signal);
  return {blob:row.blob,...(typeof row.duration==='number'&&Number.isFinite(row.duration)&&row.duration>0?{duration:row.duration}:{})};
 }
 private remove(key:string,expected:string,created:number){return this.run('readwrite',(s,done)=>{const r=s.get(key);r.onsuccess=()=>{const row=r.result as AudioRow|undefined;if(row?.digest===expected&&row.created===created)s.delete(key);done(true);};});}
 async put(key:string,blob:Blob,signal?:AbortSignal){
  if(signal?.aborted||blob.type!=='audio/mpeg'||!blob.size||blob.size>Math.min(MAX_AUDIO,this.maxBytes))return;
  const b=await blob.arrayBuffer();if(signal?.aborted||!mp3(new Uint8Array(b)))return;const hash=await digest(b);if(signal?.aborted)return;
  const now=this.now();return this.run('readwrite',(s,done)=>{
   s.put({key,blob,bytes:blob.size,digest:hash,created:now,accessed:now} satisfies AudioRow);
   const rows:{key:IDBValidKey;bytes:number}[]=[];let total=0;const request=s.index('accessed').openCursor();
   request.onsuccess=()=>{const cursor=request.result;if(cursor){const row=cursor.value as AudioRow;if(!Number.isFinite(row.created)||!Number.isFinite(row.bytes)||row.bytes<0||now-row.created>=this.ttl){cursor.delete();}else{rows.push({key:cursor.primaryKey,bytes:row.bytes});total+=row.bytes;}if(rows.length>1024){s.clear();done(false);return;}cursor.continue();return;}
    while(rows.length>this.maxEntries||total>this.maxBytes){const first=rows.shift();if(!first)break;s.delete(first.key);total-=first.bytes;}done(true);
   };
  },signal);
 }
 async duration(key:string,duration:number){
  if(!Number.isFinite(duration)||duration<=0||duration>86400)return;
  return this.run('readwrite',(s,done)=>{const r=s.get(key);r.onsuccess=()=>{const row=r.result as AudioRow|undefined;if(row)s.put({...row,duration});done(true);};});
 }
 async invalidate(key:string,blob:Blob){const expected=await digest(await blob.arrayBuffer());return this.run('readwrite',(store,done)=>{const request=store.get(key);request.onsuccess=()=>{if(request.result?.digest===expected)store.delete(key);done(true);};});}
 async clear(){await this.run('readwrite',(s,done)=>{s.clear();done(true);});}
}
export const ttsAudioCache=new TtsAudioCache();
