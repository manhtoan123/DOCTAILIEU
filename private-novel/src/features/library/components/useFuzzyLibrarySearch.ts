import {useEffect,useRef,useState} from 'react';
import {normalizeLibrarySearch,type FuzzyLibraryHit,type FuzzyLibraryRow} from '../services/fuzzy-library-search';

export function useFuzzyLibrarySearch(rows:FuzzyLibraryRow[],query:string,enabled:boolean){
  const needle=normalizeLibrarySearch(query),length=[...needle].length;
  const eligible=enabled&&length>=3&&length<=64;
  const [result,setResult]=useState<{rows:FuzzyLibraryRow[];needle:string;matches:FuzzyLibraryHit[]}>();
  const workerRef=useRef<Worker|undefined>(undefined);
  const requestRef=useRef(0);
  useEffect(()=>()=>{workerRef.current?.terminate();workerRef.current=undefined;},[]);
  useEffect(()=>{
    if(!eligible)return;
    let active=true;
    const id=++requestRef.current;
    let worker:Worker|undefined;
    const onMessage=(event:MessageEvent<{id:number;matches?:FuzzyLibraryHit[];error?:string}>)=>{
      if(!active||event.data.id!==id)return;
      if(event.data.error)setResult({rows,needle,matches:[]});
      else setResult({rows,needle,matches:event.data.matches||[]});
    };
    const onError=()=>{
      if(active)setResult({rows,needle,matches:[]});
      worker?.terminate();
      if(workerRef.current===worker)workerRef.current=undefined;
    };
    const timer=setTimeout(()=>{
      try{
        worker=workerRef.current??new Worker(new URL('../services/fuzzy-library-search.worker.ts',import.meta.url),{type:'module'});
        workerRef.current=worker;
        worker.addEventListener('message',onMessage);
        worker.addEventListener('error',onError,{once:true});
        worker.postMessage({type:'search',id,rows,query:needle});
      }catch{
        setResult({rows,needle,matches:[]});
      }
    },120);
    return()=>{
      active=false;clearTimeout(timer);
      if(worker){
        worker.removeEventListener('message',onMessage);
        worker.removeEventListener('error',onError);
        worker.postMessage({type:'cancel',id});
      }
    };
  },[rows,needle,eligible]);
  const current=eligible&&result?.rows===rows&&result.needle===needle?result:undefined;
  return {matches:current?.matches||[],pending:eligible&&!current};
}
