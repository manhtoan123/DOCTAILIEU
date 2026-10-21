import {db} from '../../../core/db';
import {dictionaryEntry} from '../../names-convert/services/dictionary-reader';
import {hashBlob} from '../../import-export/services/backup';
import {ttsHash} from '../../tts/services/tts-cursor';
import type {SharedRecord} from './shared-state-schema';
export const SHARED_COMMON_PREFIX='shared-common-name:';
export async function sharedCommonNames(){return (await db.settings.where('key').startsWith(SHARED_COMMON_PREFIX).toArray()).map(r=>r.value as SharedRecord);}
/** Patch an installed verified base in one CAS. Missing base remains lazy. */
export async function applyPendingCommonNames(){
 const records=await sharedCommonNames();if(!records.length)return;
 const original=await db.dictionaries.get('names');if(!original)return;
 const digest=await ttsHash(JSON.stringify(records));const applied=(await db.settings.get('shared-common-applied'))?.value as {digest:string;sha256:string;baseSha256?:string}|undefined;if(applied?.digest===digest&&applied.sha256===original.sha256)return;
 const baseSha256=applied?.sha256===original.sha256?applied.baseSha256??original.sha256:original.sha256;
 const edits=new Map(records.map(r=>[r.key,r.value as string|null])),written=new Set<string>();
 const lines=(await original.blob.text()).split(/\r?\n/).flatMap(line=>{const key=dictionaryEntry('names',line)?.[0];if(!key||!edits.has(key))return [line];const value=edits.get(key);if(value===null||written.has(key))return [];written.add(key);return [`${key}=${value}`];});
 for(const [key,value] of edits)if(value!==null&&!written.has(key))lines.push(`${key}=${value}`);
 const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});if(blob.size>80*1048576)throw Error('Names chung vượt giới hạn.');const sha256=await hashBlob(blob);
 await db.transaction('rw',[db.settings,db.dictionaries],async()=>{const current=await db.dictionaries.get('names');if(current?.sha256!==original.sha256||current.updatedAt!==original.updatedAt||JSON.stringify(await sharedCommonNames())!==JSON.stringify(records))return;await db.dictionaries.put({...original,blob,sha256,updatedAt:Date.now()});await db.settings.put({key:'shared-common-applied',value:{digest,sha256,baseSha256}});});
}
