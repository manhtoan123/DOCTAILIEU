import {searchFuzzyLibraryBooks,type FuzzyLibraryRow} from './fuzzy-library-search';

type WorkerMessage=
  | {type:'search';id:number;rows:FuzzyLibraryRow[];query:string}
  | {type:'cancel';id:number};

let active:{id:number;controller:AbortController}|undefined;

self.addEventListener('message',(event:MessageEvent<WorkerMessage>)=>{
  const message=event.data;
  if(message.type==='cancel'){
    if(active?.id===message.id)active.controller.abort();
    return;
  }
  active?.controller.abort();
  const job={id:message.id,controller:new AbortController()};
  active=job;
  const books=message.rows.map(([bookId,title,convertedTitle,author,album])=>({bookId,title,convertedTitle,author,album}));
  void searchFuzzyLibraryBooks(books,message.query,job.controller.signal)
    .then(matches=>{if(active===job)self.postMessage({id:job.id,matches});})
    .catch(error=>{if(active===job&&!job.controller.signal.aborted)self.postMessage({id:job.id,error:error instanceof Error?error.message:'Không thể tìm gần đúng.'});})
    .finally(()=>{if(active===job)active=undefined;});
});
