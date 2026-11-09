import {useEffect,useRef,useState} from 'react';
import {Modal,errorText} from '../../../shared/components/common';
import {convert} from '../../names-convert/services/language-client';
import type {Token} from '../../names-convert/services/language';
import '../styles/ai-name-source.css';
/** Convert the source excerpt, then select a word using its original range. */
export default function AiNameSource({source,sourceStart,names,editing=false,selectedRange,onSelect,onClose}:{source:string;sourceStart:number;names:{key:string;value:string}[];editing?:boolean;selectedRange?:{start:number;end:number};onSelect:(token:Token,tokens:Token[],element:HTMLElement)=>void;onClose:()=>void}){
 const box=useRef<HTMLDivElement>(null);
 const [tokens,setTokens]=useState<Token[]>(),[error,setError]=useState(''),[limit,setLimit]=useState(250);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;setTokens(undefined);setError('');setLimit(250);
  const controller=new AbortController();
  const work=convert(source,names,{standardizePunctuation:true,capitalize:true},controller.signal);
  void work.then(result=>{if(alive)setTokens(result.map(token=>({...token,sourceStart:token.sourceStart+sourceStart,sourceEnd:token.sourceEnd+sourceStart})));}).catch(e=>{if(alive)setError(errorText(e));});
  return()=>{alive=false;controller.abort();};
 },[source,sourceStart,names,retry]);
 useEffect(()=>{const el=box.current;if(tokens&&el&&limit<tokens.length&&el.scrollHeight<=el.clientHeight+120)setLimit(n=>Math.min(tokens.length,n+250));},[tokens,limit]);
 return <Modal title="Chọn cụm từ" onClose={onClose} keyboardEnabled={!editing} dismissOnBackdrop>
  <div ref={box} className="ai-name-words" aria-label="Chọn từ trong đoạn Convert" onScroll={e=>{const el=e.currentTarget;if(el.scrollHeight-el.scrollTop-el.clientHeight<120)setLimit(n=>Math.min(tokens?.length??n,n+250));}}>
   {!tokens&&!error&&<span role="status">Đang Convert…</span>}
   {tokens?.slice(0,limit).map((token,i)=>token.source.trim()&&token.source.length<=256&&!/[\r\n]/.test(token.source)?<button type="button" key={i} data-source={token.source} className={selectedRange&&token.sourceStart<selectedRange.end&&token.sourceEnd>selectedRange.start?'word-selected':undefined} onClick={e=>onSelect(token,tokens,e.currentTarget)}>{token.targetText}</button>:<span key={i}>{token.targetText}</span>)}
   {error&&<p role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></p>}
  </div>
 </Modal>;
}
