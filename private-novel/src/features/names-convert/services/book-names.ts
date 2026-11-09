import {nameTombKey} from '../../sync-cloud/services/shared-name-intents';
import {db} from '../../../core/db';
import {uid} from '../../../core/domain';
import {parseNameEntry,nameKeyResolver} from './name-format';

/** Merge only explicitly entered keys; omitted names remain untouched. */
export async function saveBookNames(bookId:string,text:string){
  if(text.length>2*1048576)throw new Error('Name List tối đa 2 MB.');
  const entries=text.split(/\r?\n/).map(parseNameEntry).filter((entry):entry is [string,string]=>!!entry);
  if(entries.some(([key,value])=>key.length>256||value.length>4096))throw new Error('Tên hoặc nghĩa quá dài.');
  await db.transaction('rw',[db.books,db.names,db.settings],async()=>{
    if((await db.books.get(bookId))?.status!=='ready')throw new Error('Truyện không còn trong thư viện.');
    const resolveKey=nameKeyResolver(await db.names.where('bookId').equals(bookId).toArray());
    for(const[source,value]of entries){
      const key=resolveKey(source);
      const old=await db.names.where('[bookId+key]').equals([bookId,key]).first();
      await db.names.put({id:old?.id||uid(),bookId,key,value});await db.settings.delete(nameTombKey(bookId,key));
    }
  });
  return entries.length;
}
