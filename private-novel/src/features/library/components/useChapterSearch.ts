import {useEffect,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../../../core/db';
import type {NameEntry} from '../../../core/domain';
import {normalizeLibrarySearch,searchChapterTitles,type ChapterMatch,type SearchChapter} from '../services/library-search';

const emptyMatches:Record<string,ChapterMatch>=Object.create(null);

export function useChapterSearch(bookIds:string[],query:string,namesByBook:Map<string,NameEntry[]>|undefined,contextSignature:string){
  const scope=JSON.stringify([...bookIds].sort());
  const needle=normalizeLibrarySearch(query);
  const enabled=Boolean(needle);
  const metadata=useLiveQuery(async()=>{
    if(!enabled)return undefined;
    const chapters:SearchChapter[]=[];
    try{
      const ids=JSON.parse(scope) as string[];
      const hidden=new Map((await db.books.bulkGet(ids)).filter(Boolean).map(b=>[b!.id,new Set(b!.hiddenChapterIds??[])]));
      if(ids.length)await db.chapters.where('bookId').anyOf(ids).each(({id,bookId,order,title,displayTitle})=>{if(hidden.get(bookId)?.has(id))return;chapters.push({id,bookId,order,title,displayTitle});});
      return {scope,chapters,error:false};
    }catch{return {scope,chapters:[],error:true};}
  },[scope,enabled]);
  const requestKey=JSON.stringify([scope,needle,contextSignature]);
  const [result,setResult]=useState<{key:string;metadata:typeof metadata;matches:Record<string,ChapterMatch>;error:boolean}>();
  useEffect(()=>{
    if(!enabled||!metadata||metadata.scope!==scope)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      if(metadata.error){setResult({key:requestKey,metadata,matches:emptyMatches,error:true});return;}
      void searchChapterTitles(metadata.chapters,needle,namesByBook||new Map(),controller.signal)
        .then(matches=>{if(!controller.signal.aborted)setResult({key:requestKey,metadata,matches,error:false});})
        .catch(()=>{if(!controller.signal.aborted)setResult({key:requestKey,metadata,matches:emptyMatches,error:true});});
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[metadata,scope,needle,enabled,namesByBook,requestKey]);
  const current=enabled&&result?.key===requestKey&&result.metadata===metadata?result:undefined;
  return {matches:current?.matches||emptyMatches,pending:enabled&&!current,error:current?.error||false};
}
