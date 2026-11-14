import {cleanImportedTitle} from '../services/import-advertising';
import {useEffect,useState} from 'react';
import {openEpubPackage,readEpubChapterParts} from '../services/epub-package';
import {readEpubEntry,resolveEpubPath} from '../services/epub-zip';
export default function DocumentPreview({file}:{file:File}){
 const [index,setIndex]=useState(0),[titles,setTitles]=useState<string[]>([]),[html,setHtml]=useState(''),[error,setError]=useState(''),[splitCount,setSplitCount]=useState(1);
 useEffect(()=>{const controller=new AbortController(),urls:string[]=[];let alive=true;setHtml('');setError('');setSplitCount(1);void(async()=>{
 const pkg=await openEpubPackage(file,controller.signal);if(alive)setTitles(pkg.spine.map(section=>cleanImportedTitle(section.title)));const path=pkg.spine[Math.min(index,pkg.spine.length-1)].path,parts=await readEpubChapterParts(pkg,path,controller.signal,true),layout=parts[0],doc=new DOMParser().parseFromString(layout.body,'application/xhtml+xml');if(alive)setSplitCount(parts.length);
 for(const img of Array.from(doc.getElementsByTagName('img'))){const name=resolveEpubPath(path,img.getAttribute('data-epub-src')||''),entry=pkg.entries.get(name);if(!entry)throw Error('Thiếu ảnh xem trước.');const bytes=await readEpubEntry(file,entry,8*1048576,controller.signal),url=URL.createObjectURL(new Blob([new Uint8Array(bytes)]));urls.push(url);img.setAttribute('src',url);}
 if(alive)setHtml('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src blob:; style-src &#39;unsafe-inline&#39;"><style>body{font:18px/1.6 sans-serif}img{max-width:100%;height:auto}</style>'+new XMLSerializer().serializeToString(doc.documentElement));
 })().catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;controller.abort();urls.forEach(URL.revokeObjectURL);};},[file,index]);
 return <section aria-label="Xem trước tài liệu"><label>Chương xem trước<select value={index} onChange={e=>setIndex(Number(e.target.value))}>{titles.map((title,i)=><option key={i} value={i}>{i+1} / {titles.length} · {title}</option>)}</select></label>{error?<p role="alert">{error}</p>:<iframe title="Chữ và ảnh tài liệu" sandbox="allow-same-origin" srcDoc={html} style={{width:'100%',height:360,border:'1px solid #888',background:'#fff'}}/>}{splitCount>1&&<p>Chương dài này sẽ được chia thành {splitCount} phần khi nhập.</p>}<p>Kiểm tra thứ tự chữ và ảnh rồi chọn Nhập truyện.</p></section>;
}
