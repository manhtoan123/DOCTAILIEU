import {useId,useMemo,useState} from 'react';
import {NavigationLink} from '../../../shared/components/NavigationLink';
import type {Book,Progress} from '../../../core/domain';
import {groupBooksByAlbumPath,type AlbumNode} from '../services/album-tree';
import {normalizeLibrarySearch} from '../services/library-search';
import {readerRoutePath} from '../../reader/services/reader-route';
import {ConvertedTitle} from '../../names-convert/components/ConvertedTitle';
interface Props {
 albums:AlbumNode[];heading:string;onSelect:(name:string)=>void;
 books:Book[];titles:Record<string,string>;progress:Progress[];
 search:string;onSearch:(value:string)=>void;onRead:(id:string)=>void;opening:boolean;
 showSearch?:boolean;selected?:string[];onToggle?:(path:string)=>void;
}
export function AlbumShelf({albums,heading,onSelect,books,titles,progress,search,onSearch,onRead,opening,showSearch=true,selected=[],onToggle}:Props){
 const id=useId(),[expanded,setExpanded]=useState<string[]>([]);
 const [view,setView]=useState<'detail'|'grid'|'list'>(()=>{try{const saved=localStorage.getItem('album-view');return saved==='grid'||saved==='list'?saved:'detail';}catch{return 'detail';}});
 const changeView=(next:typeof view)=>{setView(next);try{localStorage.setItem('album-view',next);}catch{}};
 const previewCount=view==='grid'?1:3;
 const [albumTitles,setAlbumTitles]=useState<Record<string,{source:string;value:string}>>({});
 const albumIdentity=JSON.stringify(albums.map(album=>[album.path,album.name]));
 const titleCallbacks=useMemo(()=>Object.fromEntries(albums.map(album=>[album.path,(result:{value:string})=>setAlbumTitles(old=>old[album.path]?.source===album.name&&old[album.path]?.value===result.value?old:{...old,[album.path]:{source:album.name,value:result.value}})])),[albumIdentity]);
 const booksByAlbum=useMemo(()=>groupBooksByAlbumPath(books),[books]);
 const needle=normalizeLibrarySearch(search),reading=new Map(progress.filter(p=>p.reading).map(p=>[p.bookId,p]));
 const title=(book:Book)=>titles[book.id]||book.displayTitle||book.title;
 const matches=(book:Book)=>normalizeLibrarySearch(`${title(book)} ${book.title} ${book.author} ${book.album??''}`).includes(needle);
 const groups=albums.map(album=>{
  const all=booksByAlbum.get(album.path)??[],translated=albumTitles[album.path];
  const albumMatch=normalizeLibrarySearch(`${album.name} ${album.path} ${translated?.source===album.name?translated.value:''}`).includes(needle);
  const items=all.filter(book=>!needle||albumMatch||matches(book)).sort((a,b)=>{
   if(needle){const match=Number(matches(b))-Number(matches(a));if(match)return match;}
   return Number(reading.has(b.id))-Number(reading.has(a.id))||(reading.get(b.id)?.updatedAt??0)-(reading.get(a.id)?.updatedAt??0)||b.createdAt-a.createdAt||a.id.localeCompare(b.id);
  });return {album,items,albumMatch};
 }).filter(group=>!needle||group.albumMatch||group.items.length);
 return <section className={`album-shelf-section album-preview-shelf album-view-${view}`} aria-label="Danh sách Album">
  {albums.map(album=><ConvertedTitle key={album.path} text={album.name} bookId="" render={false} onReady={titleCallbacks[album.path]}/>)}
  <div className="section-heading album-view-heading"><h2>{heading} ({albums.length})</h2><div className="album-view-switch" role="group" aria-label="Cách xem Album">{([['detail','Chi tiết'],['grid','Lưới gọn'],['list','Danh sách']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={view===value} onClick={()=>changeView(value)}>{label}</button>)}</div></div>
  {showSearch&&<input className="album-search" aria-label="Tìm trong Album" type="search" value={search} onChange={event=>onSearch(event.target.value)} placeholder="Tìm Album, tác giả hoặc truyện…"/>}
  {needle&&<p className="muted" role="status">{groups.length} Album phù hợp</p>}
  <div className="album-card-grid">{groups.map(({album,items},index)=>{
   const open=expanded.includes(album.path),visible=items.slice(0,open?12:previewCount),listId=`${id}-${index}`;
   return <article key={album.path} className={`album-preview-card ${selected.includes(album.path)?'library-item-selected':''}`}>
    <header className="album-preview-header">
     {onToggle&&<label className="library-select"><input type="checkbox" aria-label={`Chọn Album ${album.path}`} checked={selected.includes(album.path)} disabled={opening} onChange={()=>onToggle(album.path)}/></label>}
     <NavigationLink href={`/phong-toi?album=${encodeURIComponent(album.path)}`} onNavigate={()=>onSelect(album.path)} className="album-preview-title" aria-labelledby={`${listId}-title`} aria-describedby={`${listId}-count`}><span aria-hidden="true">📁</span><span><strong id={`${listId}-title`}><ConvertedTitle text={album.name} bookId="" showOriginal/></strong><small id={`${listId}-count`}>{album.bookCount} truyện{album.children.length>0&&` · ${album.children.length} Album con`}</small></span><span className="album-preview-arrow" aria-hidden="true">›</span></NavigationLink>
    </header>
    <ul id={listId} className="album-story-preview">{visible.map(book=><li key={book.id}>
     <NavigationLink disabled={opening} href={readerRoutePath({kind:'read',bookId:book.id})} onNavigate={()=>onRead(book.id)} title={title(book)} className="album-preview-story"><span className="album-preview-book-title">{title(book)}</span>{book.album&&book.album!==album.path&&<small>{book.album.slice(album.path.length+1)}</small>}{reading.has(book.id)?<span className="album-resume">Đọc tiếp →</span>:book.chapterCount>0&&<small>{book.chapterCount} chương</small>}</NavigationLink>
    </li>)}</ul>
    {!items.length&&<p className="muted album-empty">Album chưa có truyện.</p>}
    {items.length>previewCount&&<footer className="album-preview-footer"><button type="button" aria-expanded={open} aria-controls={listId} onClick={()=>setExpanded(old=>open?old.filter(path=>path!==album.path):[...old,album.path])}>{open?'Thu gọn':`Xem thêm (${Math.min(items.length,12)-previewCount})`}</button>{open&&items.length>12&&<small className="muted">12/{items.length} truyện</small>}</footer>}
   </article>;
  })}</div>
  {!groups.length&&<p className="notice">Không tìm thấy Album hoặc truyện phù hợp.</p>}
 </section>;
}
