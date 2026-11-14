import {useEffect,useMemo,useRef,useState} from 'react';
import {attachEpubOriginal,buildEpubFrame,epubFrameContent,loadEpubArchive} from '../../import-export/services/epub-render';
import type {EpubAppearance,EpubWordRange} from '../../import-export/services/epub-render';
import type {NameImage} from '../../names-convert/services/name-images';
import type {EpubLayout} from '../../import-export/services/epub-layout-schema';
interface Props {bookId:string;sourceKey?:string;layout:EpubLayout;nodes:string[];sentence?:{start:number;end:number};highlightColor?:string;selectedRange?:{start:number;end:number};words?:EpubWordRange[];nameImages?:NameImage[];appearance?:EpubAppearance;onReady?:(renderKey:string)=>void;onNavigate?:(key:' '|'PageUp'|'PageDown'|'Home'|'End',shift:boolean)=>void;onWordSelect?:(start:number,end:number,anchor:{left:number;top:number;right:number;bottom:number})=>void}
const EMPTY_WORDS:EpubWordRange[]=[],EMPTY_NAME_IMAGES:NameImage[]=[];
export default function EpubFrame({bookId,sourceKey='',layout,nodes,sentence,highlightColor,selectedRange,words=EMPTY_WORDS,nameImages=EMPTY_NAME_IMAGES,appearance,onWordSelect,onNavigate,onReady}:Props){
 const frame=useRef<HTMLIFrameElement>(null),[{html,frameKey},setFrameDocument]=useState({html:'',frameKey:''}),[height,setHeight]=useState(500),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const token=useRef(''),ready=useRef(false),sequence=useRef(0),pending=useRef<{id:number;key:string}|undefined>(undefined);
 const layoutSignature=useMemo(()=>JSON.stringify(layout),[layout]),contentSignature=useMemo(()=>JSON.stringify([nodes,words,nameImages]),[nodes,words,nameImages]);
 const interaction=useRef({appearance,onWordSelect,onNavigate,onReady,sentence,highlightColor,selectedRange,words,layout,nodes,nameImages,bookId,sourceKey});
 interaction.current={appearance,onWordSelect,onNavigate,onReady,sentence,highlightColor,selectedRange,words,layout,nodes,nameImages,bookId,sourceKey};
 const pushContent=useRef(()=>{});
 pushContent.current=()=>{
  if(!ready.current||!frame.current?.contentWindow)return;
  const current=interaction.current;
  try{const rows=epubFrameContent(current.layout,current.nodes,current.words,current.nameImages),id=++sequence.current;pending.current={id,key:JSON.stringify([current.bookId,current.sourceKey,current.layout,current.nodes])};frame.current.contentWindow.postMessage({epub:token.current,content:{version:1,id,rows},appearance:current.appearance,range:current.sentence??null,highlightColor:current.highlightColor,selectedRange:current.selectedRange},'*');}
  catch(e){setError(e instanceof Error?e.message:'Không cập nhật được EPUB.');}
 };
 useEffect(()=>{
  setFrameDocument({html:'',frameKey:''});setError('');ready.current=false;pending.current=undefined;
  const controller=new AbortController(),nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));token.current=nonce;
  let dispose=()=>{},resources:{id:string;mime:string;bytes:ArrayBuffer}[]=[],sent=false;
  const message=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow||event.data?.epub!==nonce)return;
   const current=interaction.current;
   if(event.data.ready&&!sent){sent=true;ready.current=true;frame.current!.contentWindow!.postMessage({epub:nonce,resources,appearance:current.appearance,range:current.sentence??null,highlightColor:current.highlightColor,selectedRange:current.selectedRange},'*',resources.map(asset=>asset.bytes));resources=[];pushContent.current();}
   if(event.data.contentReady===pending.current?.id&&pending.current)current.onReady?.(pending.current.key);
   if(event.data.contentError===pending.current?.id&&pending.current)setError('Không cập nhật được nội dung tại chỗ. Hãy thử mở lại EPUB.');
   if([' ','PageUp','PageDown','Home','End'].includes(event.data.navigation?.key)&&typeof event.data.navigation.shift==='boolean')current.onNavigate?.(event.data.navigation.key,event.data.navigation.shift);
   if(event.data.word){const word=event.data.word;if((()=>{const ranges=current.words.filter(range=>range.sourceStart>=word.start&&range.sourceEnd<=word.end);return ranges.length>0&&ranges[0].sourceStart===word.start&&ranges[ranges.length-1].sourceEnd===word.end&&ranges.every((range,index)=>!index||range.sourceStart===ranges[index-1].sourceEnd);})()&&[word.left,word.top,word.right,word.bottom].every(value=>Number.isFinite(value)&&Math.abs(value)<=2000000)){const rect=frame.current!.getBoundingClientRect();current.onWordSelect?.(word.start,word.end,{left:rect.left+word.left,top:rect.top+word.top,right:rect.left+word.right,bottom:rect.top+word.bottom});}}
   if(Number.isFinite(event.data.height)&&event.data.height>0&&event.data.height<=2000000)setHeight(Math.ceil(event.data.height));
  };
  window.addEventListener('message',message);
  const initial=interaction.current;
  void loadEpubArchive(bookId,controller.signal).then(pkg=>buildEpubFrame(pkg,initial.layout,initial.nodes,nonce,controller.signal,initial.words,initial.nameImages)).then(result=>{if(controller.signal.aborted){result.dispose();return;}dispose=result.dispose;resources=result.resources;setFrameDocument({html:result.html,frameKey:nonce});}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Không mở được EPUB.');});
  return()=>{controller.abort();ready.current=false;dispose();window.removeEventListener('message',message);};
 },[bookId,sourceKey,layoutSignature,retry]);
 useEffect(()=>{pushContent.current();},[contentSignature]);
 useEffect(()=>{frame.current?.contentWindow?.postMessage({epub:token.current,range:sentence??null,highlightColor,appearance,selectedRange},'*');},[sentence,html,highlightColor,selectedRange,JSON.stringify(appearance)]);
 return error?<div><p role="alert">{error}</p><button onClick={()=>setRetry(n=>n+1)}>Thử mở lại EPUB</button><label>Chọn lại tệp EPUB gốc nếu thiếu ảnh<input type="file" accept=".epub" onChange={e=>{const file=e.target.files?.[0];if(file)void attachEpubOriginal(bookId,file).then(()=>setRetry(n=>n+1)).catch(error=>setError(error instanceof Error?error.message:'Không lưu được EPUB.'));}}/></label></div>:html?<iframe key={frameKey} ref={frame} title="Nội dung EPUB giữ bố cục" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={html} onLoad={()=>frame.current?.contentWindow?.postMessage({epub:token.current,range:sentence??null,highlightColor,appearance,selectedRange},'*')} className="epub-frame" style={{height}}/>:<p role="status">Đang mở bố cục EPUB…</p>;
}
