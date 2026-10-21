import {db} from '../../../core/db';
import Dexie from 'dexie';

export function originalRevisionKey(origin:string,sourceId:string){return `cloud-original-uploaded:${origin}:revision:${sourceId}`;}
export function matchesOriginalRevision(value:unknown,bookId:string,revision:string|undefined){
  const receipt=value as {bookId?:string;revision?:string}|undefined;
  return !!revision&&receipt?.bookId===bookId&&receipt.revision===revision;
}
export async function pendingOriginalSources(bookIds:ReadonlySet<string>,origin:string):Promise<Map<string,string[]>>{
  return db.transaction('r',[db.sources,db.settings],async()=>{
    const references:{sourceId:string;bookId:string;revision:string}[]=[],indexed=new Set<string>(),pending=new Map<string,string[]>();
    const add=(bookId:string,sourceId:string)=>{const group=pending.get(bookId)||[];group.push(sourceId);pending.set(bookId,group);};
    const onlyBook=bookIds.size===1?[...bookIds][0]:undefined;
    const revisions=onlyBook?db.sources.where('[bookId+syncRevision]').between([onlyBook,Dexie.minKey],[onlyBook,Dexie.maxKey]):db.sources.orderBy('[bookId+syncRevision]');
    await revisions.eachKey((key,cursor)=>{
      const [bookId,revision]=key as [string,string],sourceId=cursor.primaryKey as string;indexed.add(sourceId);
      if(bookIds.has(bookId)&&!revision.startsWith('missing:'))references.push({sourceId,bookId,revision});
    });
    for(let offset=0;offset<references.length;offset+=250){
      const batch=references.slice(offset,offset+250),receipts=await db.settings.bulkGet(batch.map(ref=>originalRevisionKey(origin,ref.sourceId)));
      batch.forEach((ref,index)=>{if(!matchesOriginalRevision(receipts[index]?.value,ref.bookId,ref.revision))add(ref.bookId,ref.sourceId);});
    }
    const all=onlyBook?db.sources.where('bookId').equals(onlyBook):db.sources.orderBy('bookId');
    await all.eachKey((key,cursor)=>{if(bookIds.has(key as string)&&!indexed.has(cursor.primaryKey as string))add(key as string,cursor.primaryKey as string);});
    return pending;
  });
}
export async function pendingOriginalBooks(bookIds:ReadonlySet<string>,origin:string){return new Set((await pendingOriginalSources(bookIds,origin)).keys());}
