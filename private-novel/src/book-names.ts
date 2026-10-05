import {db} from './db';
import {parseEntry,uid} from './domain';

/** Merge only explicitly entered keys; omitted names remain untouched. */
export async function saveBookNames(bookId:string,text:string){
  if(text.length>2*1048576)throw new Error('Name List tối đa 2 MB.');
  const entries=text.split(/\r?\n/).map(parseEntry).filter((entry):entry is [string,string]=>!!entry);
  if(entries.some(([key,value])=>key.length>256||value.length>4096))throw new Error('Tên hoặc nghĩa quá dài.');
  await db.transaction('rw',[db.books,db.names],async()=>{
    if((await db.books.get(bookId))?.status!=='ready')throw new Error('Truyện không còn trong thư viện.');
    for(const[key,value]of entries){
      const old=await db.names.where('[bookId+key]').equals([bookId,key]).first();
      await db.names.put({id:old?.id||uid(),bookId,key,value});
    }
  });
  return entries.length;
}
