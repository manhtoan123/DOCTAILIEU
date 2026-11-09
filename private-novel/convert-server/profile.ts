import {createHash} from 'node:crypto';
import {closeSync,fsyncSync,openAsBlob,openSync,renameSync} from 'node:fs';
import {open,rm,stat} from 'node:fs/promises';
import type {IncomingMessage} from 'node:http';
import {join} from 'node:path';
import {loadLanguageEngine,type EngineDictionary} from '../src/features/names-convert/services/load-language-engine';
import {MAX_MANIFEST_BYTES,MAX_PROFILE_BYTES,profileFiles} from '../src/features/names-convert/services/convert-server-protocol';

export const MAX_UPLOAD_BYTES=4+MAX_MANIFEST_BYTES+MAX_PROFILE_BYTES;
export class RequestError extends Error {
  constructor(readonly status:number,code:string){super(code);}
}
const sha256=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');

export async function readProfile(path:string,signal?:AbortSignal){
  const file=await openAsBlob(path);
  const header=new DataView(await file.slice(0,4).arrayBuffer());
  const manifestBytes=header.getUint32(0);
  if(manifestBytes<2||manifestBytes>MAX_MANIFEST_BYTES||file.size>MAX_UPLOAD_BYTES)throw new Error('invalid_profile');
  const encoded=await file.slice(4,4+manifestBytes).arrayBuffer();
  const files=profileFiles(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded)));
  const dataOffset=4+manifestBytes;
  if(file.size!==files.reduce((total,row)=>total+row.bytes,dataOffset))throw new Error('invalid_profile');

  async function* dictionaries():AsyncGenerator<EngineDictionary>{
    let offset=dataOffset;
    for(const row of files){
      signal?.throwIfAborted();
      const blob=file.slice(offset,offset+row.bytes);
      offset+=row.bytes;
      const hash=createHash('sha256');
      const reader=blob.stream().getReader();
      try {
        for(;;){
          signal?.throwIfAborted();
          const chunk=await reader.read();
          if(chunk.done)break;
          hash.update(chunk.value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      if(hash.digest('hex')!==row.sha256)throw new Error('bad_checksum');
      yield {kind:row.kind,name:row.name,blob};
    }
  }
  let entries=0,rules=0;
  const {engine}=await loadLanguageEngine(dictionaries(),{
    onProgress:()=>signal?.throwIfAborted(),
    onDictionary:report=>{if(!report.valid)throw new Error('invalid_dictionary');},
    onEntry:kind=>{
      if(++entries>2_000_000||kind==='rules'&&++rules>4_000)throw new Error('index_limit');
    },
  });
  return {id:sha256(JSON.stringify({version:1,files})),files,engine};
}

export class ProfileStore {
  readonly activePath:string;
  readonly stagingPath:string;
  current:Awaited<ReturnType<typeof readProfile>>|undefined;
  state:'loading'|'empty'|'ready'|'error'='loading';
  updating=false;

  constructor(readonly directory:string){
    this.activePath=join(directory,'profile.bin');
    this.stagingPath=join(directory,'profile.next');
  }

  async initialize(){
    try {
      await rm(this.stagingPath,{force:true});
      const existing=await stat(this.activePath).catch((error:NodeJS.ErrnoException)=>{
        if(error.code!=='ENOENT')throw error;
      });
      if(existing)this.current=await readProfile(this.activePath);
      this.state=this.current?.files.length?'ready':'empty';
    } catch {
      this.state='error';
    }
  }

  status(){
    return {state:this.state,profile:this.current?.id??null,files:this.current?.files??[]};
  }

  async replace(request:IncomingMessage,expected:string,signal:AbortSignal){
    if(this.state==='loading')throw new RequestError(503,'loading');
    if(this.updating)throw new RequestError(409,'update_in_progress');
    if(expected!==(this.current?.id??'none'))throw new RequestError(409,'profile_changed');
    this.updating=true;
    try {
      const handle=await open(this.stagingPath,'wx',0o600);
      try {
        let total=0;
        for await(const chunk of request.iterator({destroyOnReturn:false}) as AsyncIterable<Buffer>){
          signal.throwIfAborted();
          total+=chunk.length;
          if(total>MAX_UPLOAD_BYTES)throw new RequestError(413,'request_too_large');
          let offset=0;
          while(offset<chunk.length){
            const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset,null);
            if(!bytesWritten)throw new Error('disk_write_failed');
            offset+=bytesWritten;
          }
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
      const candidate=await readProfile(this.stagingPath,signal).catch(()=>{
        throw new RequestError(422,'invalid_profile');
      });
      signal.throwIfAborted();
      // Same-directory rename publishes a whole validated profile. No await
      // between the cancellation check, rename and RAM state transition.
      renameSync(this.stagingPath,this.activePath);
      this.current=candidate;
      this.state=candidate.files.length?'ready':'empty';
      // Linux persists the directory entry as well as the staged file contents.
      if(process.platform!=='win32'){
        try {
          const directory=openSync(this.directory,'r');
          try {fsyncSync(directory);} finally {closeSync(directory);}
        } catch {
          this.state='error';
          throw new RequestError(503,'commit_unconfirmed');
        }
      }
      return this.status();
    } finally {
      try {await rm(this.stagingPath,{force:true});} finally {this.updating=false;}
    }
  }
}
