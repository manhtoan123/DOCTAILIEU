import Fuse from 'fuse.js/basic';

export function normalizeLibrarySearch(text:string):string{
  return text.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').trim();
}

export interface FuzzyLibraryBook {
  bookId:string;
  title:string;
  convertedTitle:string;
  author:string;
  album:string;
}
export interface FuzzyLibraryHit {bookId:string;score:number}
export type FuzzyLibraryRow=readonly [bookId:string,title:string,convertedTitle:string,author:string,album:string];

const FUZZY_FIELDS=[
  {name:'title',penalty:0},
  {name:'convertedTitle',penalty:0.02},
  {name:'author',penalty:0.07},
  {name:'album',penalty:0.12},
] as const;

const FUZZY_CHUNK_SIZE=512;

export async function searchFuzzyLibraryBooks(books:FuzzyLibraryBook[],query:string,signal?:AbortSignal):Promise<FuzzyLibraryHit[]>{
  const needle=normalizeLibrarySearch(query),length=[...needle].length;
  if(length<3||length>64)return [];
  const hits:{bookId:string;score:number;position:number}[]=[];
  for(let start=0;start<books.length;start+=FUZZY_CHUNK_SIZE){
    signal?.throwIfAborted();
    const end=Math.min(books.length,start+FUZZY_CHUNK_SIZE);
    for(let position=start;position<end;position++){
      const book=books[position];let best=Infinity;
      for(const field of FUZZY_FIELDS){
        const value=normalizeLibrarySearch(book[field.name]);
        if(!value||[...value].length>2048)continue;
        const match=Fuse.match(needle,value,{threshold:0.25,ignoreLocation:true});
        if(match.isMatch)best=Math.min(best,match.score+field.penalty);
      }
      if(best<=0.37)hits.push({bookId:book.bookId,score:best,position});
    }
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  signal?.throwIfAborted();
  return hits.sort((left,right)=>left.score-right.score||left.position-right.position).map(({bookId,score})=>({bookId,score}));
}
