import {dictionaryKinds,type DictKind} from '../../../core/domain';

export const PROFILE_TYPE='application/octet-stream';
export const MAX_PROFILE_FILES=32;
export const MAX_DICTIONARY_BYTES=80*1024*1024;
export const MAX_PROFILE_BYTES=128*1024*1024;
export const MAX_MANIFEST_BYTES=32*1024;
export const MAX_CONVERT_BODY=8*1024*1024;
export const MAX_CONVERT_TEXT=128_000;
export const MAX_CONVERT_OUTPUT=24*1024*1024;

export interface ProfileFile {kind:DictKind;name:string;sha256:string;bytes:number}
export interface ProfileStatus {
  state:'loading'|'empty'|'ready'|'error';
  profile:string|null;
  files:ProfileFile[];
}

export function isProfileId(value:unknown):value is string {
  return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
}

export function convertServerOrigin(value:unknown):string|undefined {
  if(typeof value!=='string')return undefined;
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&url.origin===value&&/^[a-z0-9.-]+$/.test(url.hostname)?value:undefined;
  } catch {return undefined;}
}

export function profileFiles(value:unknown):ProfileFile[] {
  if(!Array.isArray(value)||value.length>MAX_PROFILE_FILES)throw new Error('invalid_profile');
  let total=0;
  return value.map((item:Partial<ProfileFile>|null)=>{
    if(!item||!dictionaryKinds.includes(item.kind!)||typeof item.name!=='string'||
      !item.name.trim()||item.name.length>255||/[\u0000-\u001f\u007f/\\]/.test(item.name)||
      !isProfileId(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes!<1||item.bytes!>MAX_DICTIONARY_BYTES)
      throw new Error('invalid_profile');
    total+=item.bytes!;
    if(total>MAX_PROFILE_BYTES)throw new Error('invalid_profile');
    return {kind:item.kind!,name:item.name,sha256:item.sha256,bytes:item.bytes!};
  });
}
