import {EffectiveNamesContext} from './features/names-convert/components/EffectiveNamesContext';
import {readEffectiveNamesByBook} from './features/names-convert/services/scoped-names';
import {bookIdForNumber,ensureBookNumber} from './features/reader/services/numeric-reader-route';
import {chapterIdForNumber} from './features/reader/services/chapter-route-number';
import {useSharedImage} from './shared/components/SharedImage';
import {AlbumShelf} from './features/library/components/AlbumShelf';
import {LibraryBookCard} from './features/library/components/LibraryBookCard';
import {setLibraryBackground,storeSharedImage} from './features/sync-cloud/services/shared-images';
import type {ReaderSettings} from './core/domain';
import {startSharedStateSync} from './features/sync-cloud/services/shared-state-sync';
import SharedSyncPanel from './features/sync-cloud/components/SharedSyncPanel';
import {ConvertedTitle,type TitlePresentation} from './features/names-convert/components/ConvertedTitle';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db,deleteBook} from './core/db';
import {removeBookWithLocalData} from './features/library/services/book-removal';
import {uid,type Book,type NameEntry} from './core/domain';
import {CONVERT_NAMES_KEY} from './features/names-convert/services/convert-names';
import {setLanguageStatus} from './features/names-convert/services/language-client';
import ImportDialog from './features/import-export/components/ImportDialog';
import DictionaryPanel from './features/names-convert/components/DictionaryPanel';
import {PromptStockPanel} from './features/ai/components/PromptStockPanel';

import BookNamesSettings from './features/names-convert/components/BookNamesSettings';
import {startPromptSync} from './features/ai/prompt/prompt-sync';
import {deleteAlbumAndBooks} from './features/library/services/album-removal';
import {createAlbum} from './features/library/services/album-registry';
import {readStoredAlbumRegistry} from './features/library/services/album-registry';
import BackupPanel from './features/import-export/components/BackupPanel';
import Reader from './features/reader/components/Reader';
import {StoryDetail} from './features/library/components/StoryDetail';
import CloudPanel from './features/sync-cloud/components/CloudPanel';
import {syncLocalBooks,listCloudBooks,listDeletedCloudBooks,downloadCloudBook,deleteCloudBook,isPublicCloudLibrary,type CloudBook} from './features/sync-cloud/services/cloud-client';
import {initializeCloudDevice,connectCloudDeviceFromLocation} from './features/sync-cloud/services/cloud-device';
import {Empty,Modal,errorText} from './shared/components/common';
import {hasChinese} from './features/library/services/title-resolver';
import {normalizeLibrarySearch} from './features/library/services/library-search';
import {useChapterSearch} from './features/library/components/useChapterSearch';
import {albumContains,buildAlbumTree,type AlbumNode} from './features/library/services/album-tree';
import {parseReaderRoute,readerRoutePath,type ReaderRoute} from './features/reader/services/reader-route';
const sample=`Chương 1: Một chỗ ngồi bên cửa sổ\n\nBuổi sáng, nắng ghé qua khung cửa gỗ. Trên bàn có một cuốn sách chưa đọc hết và tách trà vừa pha.\n\nBạn mở trang sách, chỉnh cỡ chữ vừa mắt, rồi để câu chuyện dẫn mình đi. Không có thông báo, không có vội vàng. Chỉ có những trang chữ và một chút thời gian dành riêng cho mình.\n\nChương 2: Lối mòn trong vườn\n\nSau cơn mưa, khu vườn trở nên yên tĩnh. Tiếng lá xào xạc như một lời nhắc: đôi khi điều cần làm chỉ là chậm lại.\n\nBạn có thể thử nút Nghe truyện, đổi nền Sepia, hoặc quay về tủ sách để nhập TXT của mình.\n\nChương 3: Trang sách tiếp theo\n\nThư phòng ghi nhớ nơi bạn dừng lại. Khi trở về, câu chuyện vẫn chờ ở đó.\n\nĐây là văn bản mẫu tự viết để kiểm tra trình đọc và giọng nói.\n`;
export default function App(){
  const appearance=useLiveQuery(()=>db.settings.get('reader'),[]);const libraryBackground=useSharedImage((appearance?.value as ReaderSettings|undefined)?.libraryBackground);
  useEffect(()=>startPromptSync(),[]);
  useEffect(()=>startSharedStateSync(),[]);
  const books=useLiveQuery(()=>db.books.where('status').equals('ready').reverse().sortBy('updatedAt'),[]);const staged=useLiveQuery(()=>db.books.where('status').equals('staging').toArray(),[]);
  const[tab,setTab]=useState<'library'|'appearance'|'dictionary'|'names'|'prompts'|'ai'|'sync'|'backup'|'cloud'|'about'>('library');const[active,setActive]=useState('');const[importing,setImporting]=useState(false);const[search,setSearch]=useState('');const[toast,setToast]=useState('');const[languageStatus,setStatus]=useState('');const[edit,setEdit]=useState<Book>();
  const [route,setRoute]=useState<ReaderRoute>(()=>parseReaderRoute(location.pathname));const routeRef=useRef(route);const routeGeneration=useRef(0);const appliedRoute=useRef<ReaderRoute|null>(null);const [readerNavigation,setReaderNavigation]=useState(0);
  const navigate=useCallback((next:ReaderRoute)=>{routeRef.current=next;routeGeneration.current++;history.pushState(null,'',readerRoutePath(next));setRoute(next);},[]);
  useEffect(()=>{const pop=()=>{const next=parseReaderRoute(location.pathname);routeRef.current=next;routeGeneration.current++;setRoute(next);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const [cloudStatus,setCloudStatus]=useState('');
  const [cloudSyncError,setCloudSyncError]=useState('');
  const [selectedAlbum,setSelectedAlbum]=useState<string|null>(null);
  const [darkRoom,setDarkRoom]=useState(()=>parseReaderRoute(location.pathname).kind==='library'&&location.pathname==='/phong-toi');
  const roomRef=useRef(darkRoom);
  const libraryDestination:ReaderRoute=darkRoom?{kind:'library',room:'dark'}:{kind:'library'};
  useEffect(()=>{
    if(route.kind!=='library')return;
    const next=route.room==='dark';
    if(roomRef.current!==next){selectAlbum(null);roomRef.current=next;}
    setDarkRoom(next);
  },[route]);
  const [libraryView,setLibraryView]=useState<'grid'|'list'|'compact'>(()=>{try{const value=localStorage.getItem('library-view');return value==='list'||value==='compact'?value:'grid';}catch{return 'grid';}});
  useEffect(()=>{try{localStorage.setItem('library-view',libraryView);}catch{}},[libraryView]);
  const [titleIndex,setTitleIndex]=useState<Record<string,TitlePresentation>>({});
  const recordTitle=useCallback((result:TitlePresentation)=>setTitleIndex(old=>old[result.bookId]?.signature===result.signature&&old[result.bookId]?.text===result.text&&old[result.bookId]?.value===result.value?old:{...old,[result.bookId]:result}),[]);
  const titleContext=useLiveQuery(async()=>{
    const [namesByBook,global,files]=await Promise.all([readEffectiveNamesByBook(),db.settings.get(CONVERT_NAMES_KEY),db.dictionaries.toArray()]);
    return {namesByBook,global:global?.value,dictionaries:files.map(d=>[d.kind,d.sha256,d.updatedAt])};
  },[]);
  const [publicMode,setPublicMode]=useState(false);
  const [cloudBooks,setCloudBooks]=useState<CloudBook[]>([]),[cloudLoaded,setCloudLoaded]=useState(false),[cloudError,setCloudError]=useState(''),[opening,setOpening]=useState(false);
  const catalogGeneration=useRef(0);
  const refreshCloud=useCallback(async()=>{const generation=++catalogGeneration.current;try{await listDeletedCloudBooks();const catalog=await listCloudBooks();if(generation===catalogGeneration.current){setCloudBooks(catalog);setPublicMode(isPublicCloudLibrary());setCloudLoaded(true);setCloudError('');}}catch(error){if(generation===catalogGeneration.current)setCloudError(errorText(error));}},[]);
  const[lastSetting,setLastSetting]=useState<'appearance'|'dictionary'|'names'|'prompts'|'ai'|'sync'|'backup'|'cloud'|'about'>('dictionary');
  useEffect(()=>{if(publicMode&&(tab==='cloud'||tab==='backup')){setTab('dictionary');setLastSetting('dictionary');if(routeRef.current.kind==='settings'){const next:ReaderRoute={kind:'settings',group:'dictionary'};routeRef.current=next;history.replaceState(null,'',readerRoutePath(next));setRoute(next);}}},[publicMode,tab]);
  const [deviceReady,setDeviceReady]=useState(false);
  const syncFlight=useRef<Promise<void>|undefined>(undefined),syncRequested=useRef(false);
  const syncCloud=useCallback(()=>{
    syncRequested.current=true;
    if(syncFlight.current)return syncFlight.current;
    syncFlight.current=(async()=>{
      while(syncRequested.current){
        syncRequested.current=false;
        try{
          await listDeletedCloudBooks();let transferred=false;
          const count=await syncLocalBooks(message=>{transferred=true;setCloudStatus(message);});
          setCloudSyncError('');
          setCloudStatus(count?`Đã đưa ${count} truyện lên kho chung.`:transferred?'Đã lưu file gốc lên kho chung.':'');
          if(transferred)await refreshCloud();
        }catch(error){setCloudStatus('');setCloudSyncError(errorText(error));}
      }
    })().finally(()=>{syncFlight.current=undefined;});
    return syncFlight.current;
  },[refreshCloud]);
  const readyBookIds=books?.map(book=>book.id).sort().join('|');
  const sourceRevisions=useLiveQuery(async()=>JSON.stringify(await db.sources.orderBy('[bookId+syncRevision]').keys()),[]);
  useEffect(()=>{if(!deviceReady||!readyBookIds)return;const timer=setTimeout(()=>void syncCloud(),300);return()=>clearTimeout(timer);},[readyBookIds,sourceRevisions,syncCloud,deviceReady]);
  useEffect(()=>{if(!deviceReady)return;const retry=()=>{void syncCloud();};window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[syncCloud,deviceReady]);
  const notify=useCallback((message:string)=>setToast(message),[]);
  useEffect(()=>{
    let alive=true,generation=0;
    function settle(promise:Promise<boolean>){const current=++generation;setDeviceReady(false);void promise.then(connected=>{if(alive&&current===generation&&connected)notify('Đã kết nối thiết bị với kho cloud.');}).catch(error=>{if(alive&&current===generation)notify(errorText(error));}).finally(()=>{if(alive&&current===generation)setDeviceReady(true);});}
    const hashChange=()=>{if(location.hash.startsWith('#cloud-connect'))settle(connectCloudDeviceFromLocation());};
    settle(initializeCloudDevice());window.addEventListener('hashchange',hashChange);
    return()=>{alive=false;window.removeEventListener('hashchange',hashChange);};
  },[notify]);
  useEffect(()=>{
    if(!deviceReady)return;
    let alive=true;
    void refreshCloud();
    const refresh=()=>{if(!document.hidden)void refreshCloud();};
    const timer=setInterval(refresh,300000);window.addEventListener('focus',refresh);
    return()=>{alive=false;catalogGeneration.current++;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[deviceReady,refreshCloud]);
  const[detail,setDetail]=useState('');const[entryChapter,setEntryChapter]=useState<string>();const[readerOwnerGeneration,setReaderOwnerGeneration]=useState(0);const libraryScroll=useRef(0);
  function openDetail(id:string){libraryScroll.current=window.scrollY;navigate({kind:'book',bookId:id});}
  function openReader(id:string,chapterId?:string){navigate({kind:'read',bookId:id,chapterId});}
  const chapterChanged=useCallback((owner:number,ownerBook:string,chapterId:string,chapterNumber?:number)=>{
    const current=routeRef.current;if(owner!==routeGeneration.current||current.kind!=='read'||current.bookId!==ownerBook)return;
    const next:ReaderRoute={...current,chapterId,chapterNumber},path=readerRoutePath(next);
    if(current.chapterId===chapterId){
      if(location.pathname!==path)history.replaceState(null,'',path+location.search+location.hash);
    }else history[current.chapterId?'pushState':'replaceState'](null,'',path);
    routeRef.current=next;
    const generation=routeGeneration.current;
    void ensureBookNumber(next.bookId).then(bookCode=>{
      if(!bookCode||routeGeneration.current!==generation||routeRef.current!==next)return;
      const numbered:ReaderRoute={...next,bookCode};routeRef.current=numbered;
      const canonical=readerRoutePath(numbered);
      if(location.pathname!==canonical)history.replaceState(null,'',canonical+location.search+location.hash);
    });
  },[]);
  const ownedChapterChanged=useCallback((chapterId:string,number?:number)=>chapterChanged(readerOwnerGeneration,active,chapterId,number),[chapterChanged,readerOwnerGeneration,active]);
  useEffect(()=>{if(active)return;const frame=requestAnimationFrame(()=>window.scrollTo({top:detail?0:libraryScroll.current,behavior:'instant'}));return()=>cancelAnimationFrame(frame);},[active,detail]);
  useEffect(()=>{setLanguageStatus(setStatus);},[]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),9000);return()=>clearTimeout(timer);},[toast]);
  async function demo(){try{const id=uid();const textParts=sample.split(/(?=Chương \d+:)/).filter(Boolean);await db.transaction('rw',[db.books,db.chapters],async()=>{await db.books.add({id,title:'Một khoảng bình yên',author:'Thư Phòng · truyện mẫu',status:'ready',chapterCount:textParts.length,charCount:sample.length,createdAt:Date.now(),updatedAt:Date.now()});await db.chapters.bulkAdd(textParts.map((text,order)=>({id:uid(),bookId:id,order,title:text.split('\n')[0],text,revision:1,sourceId:''})));});openReader(id);}catch(e){notify(errorText(e));}}
  const deletedOnCloud=useLiveQuery(async()=>new Set((await db.settings.where('key').startsWith(`cloud-deleted:${location.origin}:`).toArray()).map(row=>row.key.slice(`cloud-deleted:${location.origin}:`.length))),[]);
  const localIds=new Set(books?.map(book=>book.id));
  const shelf=[...(books||[]),...cloudBooks.filter(book=>!localIds.has(book.id)).map(book=>({...book,author:book.author??'',createdAt:book.updatedAt,status:'ready' as const,chapterCount:0,charCount:0}))];
  const albumRegistry=useLiveQuery(async()=>{try{return await readStoredAlbumRegistry();}catch{return undefined;}},[]);
  const albums=[...new Set([...shelf.map(book=>book.album).filter((album):album is string=>!!album),...(albumRegistry?.albums.map(album=>album.name)??[])])].sort((a,b)=>a.localeCompare(b,'vi'));
  const albumTree=buildAlbumTree(albums,shelf);
  const currentAlbum=selectedAlbum?albumTree.nodes.get(selectedAlbum):undefined;
  const childAlbums=selectedAlbum?currentAlbum?.children||[]:albumTree.roots;
  const albumTrail:AlbumNode[]=[];
  for(let node=currentAlbum;node;node=node.parent?albumTree.nodes.get(node.parent):undefined)albumTrail.unshift(node);
  const directBooks=selectedAlbum?shelf.filter(b=>b.album===selectedAlbum):darkRoom?[]:shelf.filter(b=>!b.album);
  const currentBooks=search.trim()?(selectedAlbum?shelf.filter(book=>albumContains(selectedAlbum,book.album)):darkRoom?shelf.filter(book=>!!book.album):directBooks):directBooks;
  const chapterSearch=useChapterSearch(tab==='library'&&!detail?currentBooks.filter(book=>localIds.has(book.id)).map(book=>book.id):[],tab==='library'&&!detail?search:'',titleContext?.namesByBook,JSON.stringify(titleContext?{names:[...titleContext.namesByBook],global:titleContext.global,dictionaries:titleContext.dictionaries}:null));
  const filtered=currentBooks.filter(b=>{
    const entry=titleIndex[b.id],signature=titleContext?JSON.stringify({names:titleContext.namesByBook.get(b.id)||[],global:titleContext.global,dictionaries:titleContext.dictionaries}):'';
    const converted=b.displayTitle||(entry?.text===b.title&&entry.signature===signature?entry.value:'');
    return normalizeLibrarySearch(`${b.title} ${converted} ${b.author} ${b.album||''}`).includes(normalizeLibrarySearch(search))||Boolean(chapterSearch.matches[b.id]);
  });
  async function openShelf(id:string,detailMode=false){
    if(opening)return;const generation=routeGeneration.current;setOpening(true);
    try{
      if(!localIds.has(id)){const book=cloudBooks.find(book=>book.id===id);if(!book)throw new Error('Truyện không còn trong danh sách kho.');await downloadCloudBook(book);}
      if(generation===routeGeneration.current){if(detailMode)openDetail(id);else openReader(id);}
    }catch(error){notify(errorText(error));}finally{setOpening(false);}
  }
  useEffect(()=>{
    if(routeRef.current!==route)return;
    const generation=++routeGeneration.current;let alive=true;
    if(route.kind==='library'||route.kind==='settings'){
      setOpening(false);setActive('');setDetail('');setTab(route.kind==='settings'?route.group:'library');
      if(route.kind==='settings')setLastSetting(route.group);
      return;
    }
    setOpening(true);
    void (async()=>{
      if(route.kind==='numeric-read'){
        const bookId=await bookIdForNumber(route.bookCode);
        if(!alive||generation!==routeGeneration.current||routeRef.current!==route)return;
        const resolved:ReaderRoute={kind:'read',bookId,bookCode:route.bookCode,chapterNumber:route.chapterNumber};
        routeRef.current=resolved;setRoute(resolved);return;
      }
      const local=await db.books.get(route.bookId);
      if(!local||local.status!=='ready'){
        if(!deviceReady||!cloudLoaded)return;
        const remote=cloudBooks.find(book=>book.id===route.bookId);
        if(!remote)throw new Error('Truyện không còn trong danh sách kho.');
        await downloadCloudBook(remote);
      }
      let selectedChapter=route.kind==='read'?route.chapterId:undefined;
      if(route.kind==='read'&&route.chapterNumber!==undefined){
        const book=await db.books.get(route.bookId),hidden=new Set(book?.hiddenChapterIds??[]);
        const chapters=(await db.chapters.where('bookId').equals(route.bookId).toArray()).filter(c=>!hidden.has(c.id));
        selectedChapter=chapterIdForNumber(chapters,route.chapterNumber);
        if(!selectedChapter)throw Error('Không tìm thấy vị trí chương trong mục lục.');
      }
      if(!alive||generation!==routeGeneration.current||routeRef.current!==route)return;
      setTab('library');
      if(route.kind==='book'){setActive('');setDetail(route.bookId);}
      else{setReaderOwnerGeneration(generation);setDetail(current=>current===route.bookId?current:'');if(appliedRoute.current!==route){appliedRoute.current=route;setReaderNavigation(n=>n+1);setEntryChapter(selectedChapter);}setActive(route.bookId);}
    })().catch(error=>{if(alive&&generation===routeGeneration.current){setActive('');setDetail('');notify(errorText(error));}}).finally(()=>{if(alive&&generation===routeGeneration.current)setOpening(false);});
    return()=>{alive=false;};
  },[route,deviceReady,cloudLoaded,cloudBooks,notify]);
  useEffect(()=>{
    if(!deletedOnCloud||deletedOnCloud.size===0)return;
    const toPurge=(books||[]).filter(b=>deletedOnCloud.has(b.id));
    if(toPurge.length>0){
      void (async()=>{
        for(const b of toPurge){
          await removeBookWithLocalData(b.id);
        }
        notify(`Đã dọn sạch ${toPurge.length} truyện đã xóa khỏi kho.`);
      })();
    }
  },[deletedOnCloud,books,notify]);

  const [clearing,setClearing]=useState(false);
  async function clearAlbumBooks(albumName:string){
    if(clearing||opening)return;setClearing(true);
    try{const count=await deleteAlbumAndBooks(albumName,cloudLoaded);setCloudBooks(old=>old.filter(b=>b.album!==albumName));setSelectedAlbum(null);notify(`Đã xóa Album và ${count} truyện.`);}
    catch(err){notify(errorText(err));}finally{setClearing(false);void refreshCloud();}
  }
  const [newAlbumName,setNewAlbumName]=useState(''),[creatingAlbum,setCreatingAlbum]=useState(false);
  function selectAlbum(name:string|null){setSelectedAlbum(name);setSearch('');setNewAlbumName('');setCreatingAlbum(false);}
  function enterRoom(dark:boolean){selectAlbum(null);navigate(dark?{kind:'library',room:'dark'}:{kind:'library'});}
  async function addAlbum(){if(!newAlbumName.trim())return;try{const album=await createAlbum(selectedAlbum?`${selectedAlbum}/${newAlbumName.trim()}`:newAlbumName);selectAlbum(album.name);}catch(e){notify(errorText(e));}}

  async function removeShelf(book:Book){
    const shared=cloudLoaded||cloudBooks.some(row=>row.id===book.id)||!!await db.settings.get(`cloud-uploaded:${location.origin}:${book.id}`);
    try{if(shared)await deleteCloudBook(book.id);await removeBookWithLocalData(book.id);setCloudBooks(current=>current.filter(row=>row.id!==book.id));notify(shared?'Đã xóa truyện khỏi kho chung và thiết bị này.':'Đã xóa bản trên thiết bị.');void refreshCloud();}catch(error){notify(errorText(error));}
  }

  return <EffectiveNamesContext.Provider value={titleContext?.namesByBook??null}>{active?<Reader key={`${active}:${entryChapter||'resume'}:${readerNavigation}`} bookId={active} initialChapterId={entryChapter} backLabel={detail?'← Thông tin truyện':darkRoom?'← Phòng tối':'← Tủ sách'} onChapterChange={ownedChapterChanged} onBack={()=>navigate(detail?{kind:'book',bookId:active}:libraryDestination)} onBookInfo={()=>navigate({kind:'book',bookId:active})} onAiSettings={()=>navigate({kind:'settings',group:'ai',bookId:active})} notify={notify}/>:<div className={`shell ${libraryBackground?'has-library-background':''}`} style={libraryBackground?{backgroundImage:`url("${libraryBackground}")`}:undefined}>
    <aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();enterRoom(false);}}><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 9c7-3 12-2 15 1 3-3 8-4 15-1v23c-7-3-12-2-15 1-3-3-8-4-15-1z"/><path d="M20 10v23"/></svg><span>{darkRoom?'phòng tối':'thư phòng'}<small>PRIVATE NOVEL READER</small></span></a>
    <nav aria-label="Điều hướng chính"><button className={tab==='library'?'active':''} aria-current={tab==='library'?'page':undefined} onClick={()=>enterRoom(false)}><span>▤</span>Tủ sách<small>{shelf.length}</small></button><button className={tab!=='library'?'active':''} aria-current={tab!=='library'?'page':undefined} onClick={()=>{navigate({kind:'settings',group:lastSetting});}}><span>⚙</span>Cài đặt</button></nav>
    </aside>
    <main className="workspace">
    {tab!=='library'&&<section className="settings-heading" aria-label="Cài đặt ứng dụng"><h1>Cài đặt</h1><label>Nhóm cài đặt<select aria-label="Nhóm cài đặt" value={tab} onChange={event=>{const group=event.target.value as typeof lastSetting;navigate({kind:'settings',group});}}><option value="appearance">Giao diện</option><option value="dictionary">Từ điển</option><option value="names">Name riêng</option><option value="ai">Dịch AI &amp; Prompt</option><option value="sync">Đồng bộ chỉnh sửa</option>{!publicMode&&<><option value="cloud">Kho & thiết bị</option><option value="backup">Sao lưu & khôi phục</option></>}<option value="about">Thông tin</option></select></label></section>}
    {tab==='library'&&detail&&<StoryDetail key={detail} bookId={detail} onBack={()=>navigate(libraryDestination)} onRead={chapterId=>openReader(detail,chapterId)}/>}
    {tab==='library'&&!detail&&<>
      {!selectedAlbum ? (
        <section className="library-title">
          <h1>{darkRoom?'PHÒNG TỐI':'Tủ sách'}</h1>
          <div className="library-actions">
            <button className="primary" onClick={()=>setImporting(true)}>＋ Thêm truyện TXT / EPUB</button>
          </div>
        </section>
      ) : (
        <section className="library-title album-header-bar">
          <div className="album-title-group">
            <button className="story-back" onClick={()=>selectAlbum(currentAlbum?.parent??null)}>{currentAlbum?.parent?'← Album cha':'← Phòng tối'}</button>
            <h1>📁 <ConvertedTitle text={currentAlbum?.name||selectedAlbum} bookId="" showOriginal/> <small>({currentAlbum?.bookCount??directBooks.length} truyện)</small></h1>
          </div>
          <div className="library-actions">
            {(!childAlbums.length&&<button className="btn-danger" disabled={clearing||opening} onClick={()=>void clearAlbumBooks(selectedAlbum)}>{clearing?'Đang xóa…':'Xóa Album và truyện'}</button>
            )}
            <button className="primary" onClick={()=>setImporting(true)}>＋ Thêm truyện vào Album này</button>
          </div>
        </section>
      )}
      <section className="library-section">
        {selectedAlbum&&<nav className="album-breadcrumbs" aria-label="Đường dẫn Album"><button className="text-button" onClick={()=>selectAlbum(null)}>Phòng tối</button>{albumTrail.map(node=><span key={node.path}><span aria-hidden="true"> / </span>{node.path===selectedAlbum?<span aria-current="page"><ConvertedTitle text={node.name} bookId=""/></span>:<button className="text-button" aria-label={`Về Album ${node.path}`} onClick={()=>selectAlbum(node.path)}><ConvertedTitle text={node.name} bookId=""/></button>}</span>)}</nav>}
        {shelf.map(b=>!b.displayTitle&&<ConvertedTitle key={b.id} text={b.title} bookId={b.id} onReady={recordTitle} render={false}/>)}
        {cloudStatus&&<p className="muted" role="status">{cloudStatus}</p>}
        {(cloudError||cloudSyncError)&&<p className="notice" role="status">{cloudError||cloudSyncError} <button onClick={()=>void syncCloud().then(()=>refreshCloud())}>Thử lại kho</button></p>}

        {darkRoom&&childAlbums.length > 0 && (
          <AlbumShelf
            albums={childAlbums}
            heading={selectedAlbum?'Album con / Series':'Album tác giả'}
            onSelect={selectAlbum}
          />
        )}

        {darkRoom&&<div className="album-create"><button onClick={()=>setCreatingAlbum(old=>!old)}>{selectedAlbum?'Tạo Album con / Series':'Tạo Album'}</button>{creatingAlbum&&<><input aria-label={selectedAlbum?'Tên Album con mới':'Tên Album mới'} value={newAlbumName} onChange={e=>setNewAlbumName(e.target.value)} maxLength={120}/><button onClick={()=>void addAlbum()}>Tạo</button></>}</div>}

        <div className="section-heading library-toolbar">
          <input
            className="search"
            aria-label={selectedAlbum ? `Tìm truyện trong ${selectedAlbum}` : 'Tìm truyện'}
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Tìm tên truyện, tác giả, tên chương Việt / Trung…"
          />
          <div className="segmented library-view" role="group" aria-label="Cách xem tủ sách">
            <button className={libraryView==='grid'?'active':''} aria-pressed={libraryView==='grid'} onClick={()=>setLibraryView('grid')}>Lưới</button>
            <button className={libraryView==='list'?'active':''} aria-pressed={libraryView==='list'} onClick={()=>setLibraryView('list')}>Danh sách</button>
            <button className={libraryView==='compact'?'active':''} aria-pressed={libraryView==='compact'} onClick={()=>setLibraryView('compact')}>Thu gọn</button>
          </div>
        </div>
        {search.trim()&&<p className="muted" role="status">{chapterSearch.pending?'Đang tìm tên chương…':chapterSearch.error?'Chưa tìm được tên chương trên thiết bị. Kết quả tên truyện vẫn hiển thị.':`${filtered.length} truyện phù hợp · Tìm cả tên chương Việt / Trung trên thiết bị.`}{currentBooks.some(book=>!localIds.has(book.id))&&' Mở truyện từ kho chung để tải mục lục và tìm tên chương.'}</p>}

        {selectedAlbum&&childAlbums.length>0&&directBooks.length>0&&!search.trim()&&<div className="section-heading"><h2>Truyện ngoài Series ({directBooks.length})</h2></div>}

        {darkRoom&&!selectedAlbum&&!search.trim() ? (
          !childAlbums.length&&<p className="muted">Chưa có Album. Tạo Album tác giả hoặc thêm truyện vào Album để bắt đầu.</p>
        ) : !shelf.length ? (
          <div className="empty-shelf">
            <Empty title="Trang đầu tiên đang chờ">Thêm TXT hoặc EPUB để bắt đầu. Bạn cũng có thể mở truyện mẫu để thử cỡ chữ và giọng đọc.</Empty>
            <div className="center-actions"><button onClick={()=>void demo()}>Đọc truyện mẫu →</button></div>
          </div>
        ) : selectedAlbum && childAlbums.length>0&&!search.trim()&&!directBooks.length ? (
          <p className="muted">Chọn Album con / Series để xem truyện.</p>
        ) : selectedAlbum && !currentBooks.length && !childAlbums.length ? (
          <div className="empty-shelf">
            <Empty title="Album chưa có truyện">Nhấn "＋ Thêm truyện vào Album này" để nhập TXT hoặc EPUB vào album này.</Empty>
          </div>
        ) : !selectedAlbum && !currentBooks.length&&!search.trim() ? (
          <p className="muted" style={{margin:'20px 0'}}>Các Album truyện nằm trong Phòng tối.</p>
        ) : !filtered.length ? (
          <p className="notice">{chapterSearch.pending?'Đang tìm truyện và tên chương…':'Không có truyện hoặc tên chương khớp từ khóa tìm kiếm.'}</p>
        ) : (
          <div className={`book-grid ${libraryView==='grid'?'cover-shelf':libraryView==='compact'?'compact-shelf':'list-shelf'}`}>
            {filtered.map((book, index) => (
              <LibraryBookCard
                key={book.id}
                book={book}
                index={index}
                compact={libraryView==='compact'}
                displayTitle={book.displayTitle || (titleIndex[book.id]?.text === book.title ? titleIndex[book.id].value : book.title)}
                isLocal={localIds.has(book.id)}
                deletedOnCloud={deletedOnCloud?.has(book.id) ?? false}
                opening={opening}
                onOpenDetails={() => void openShelf(book.id, true)}
                onRead={() => void openShelf(book.id)}
                chapterMatch={chapterSearch.matches[book.id]}
                onReadChapter={chapterId=>openReader(book.id,chapterId)}
                onEdit={() => setEdit({...book})}
                onRemove={() => void removeShelf(book)}
              />
            ))}
          </div>
        )}
      </section>
      <footer className="room-footer"><a href="/phong-toi" aria-label="Mở Phòng tối" onClick={event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();enterRoom(true);}}>THU PHONG là trang web cung cấp dịch vụ dịch tự động truyện chữ Trung.</a></footer>
    </>}
    {tab==='appearance'&&<section><h2>Giao diện tủ truyện</h2><div className="shelf-background-tools"><label className="image-picker">Ảnh nền<input aria-label="Chọn ảnh nền tủ truyện" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void setLibraryBackground(file).catch(error=>notify(errorText(error)));e.target.value='';}}/></label>{(appearance?.value as ReaderSettings|undefined)?.libraryBackground&&<button onClick={()=>void setLibraryBackground().catch(error=>notify(errorText(error)))}>Bỏ ảnh nền</button>}</div></section>}{tab==='names'&&<BookNamesSettings books={books} bookId={route.kind==='settings'&&route.group==='names'?route.bookId:undefined} onSelect={bookId=>navigate({kind:'settings',group:'names',bookId})}/>}{tab==='sync'&&<SharedSyncPanel/>}{tab==='dictionary'&&<DictionaryPanel/>}{(tab==='ai'||tab==='prompts')&&<PromptStockPanel key={route.kind==='settings'?route.bookId||'global':'global'} initialBookId={route.kind==='settings'?route.bookId:undefined} books={books||[]} notify={notify}/>}{tab==='backup'&&<BackupPanel/>}{tab==='cloud'&&<CloudPanel status={cloudSyncError||cloudStatus} onSync={syncCloud} onRead={id=>openReader(id)}/>}{tab==='about'&&<section><div className="section-heading"><div><span className="eyebrow">PRIVATE NOVEL READER · 0.1</span><h1>Một thư phòng của riêng bạn</h1></div></div><div className="panel"><h2>Đọc và Convert trên thiết bị</h2><p>Truyện được lưu local trước. Kho chung mở cho mọi người có URL: truyện đã nhập tự gửi bản chữ/chương/Name; bộ từ điển chỉ tải khi bạn chủ động chọn Convert. Các chỉnh sửa được đồng bộ giữa thiết bị; mất mạng vẫn lưu trên máy. File nguồn truyện được giữ nguyên. Nghe TikTok gửi câu đang đọc đến gateway đã cấu hình khi bạn bấm Nghe sách.</p><p>Dịch AI Gemini đã tích hợp; PWA mở lại hoàn toàn offline chưa hoàn tất. Chỉnh sửa Names, cấu hình, Album, nội dung chương và vị trí đọc tự đồng bộ; nếu hai thiết bị sửa cùng mục, bạn chọn bản cần giữ.</p><button onClick={async()=>{const ok=await navigator.storage?.persist();notify(ok?'Trình duyệt đã cho phép lưu trữ bền vững. Vẫn cần sao lưu.':'Trình duyệt chưa cấp lưu trữ bền vững. Hãy sao lưu thường xuyên.');}}>Xin lưu trữ bền vững</button><button onClick={async()=>{await navigator.clipboard.writeText(location.origin);notify('Đã sao chép địa chỉ ứng dụng.');}}>Sao chép địa chỉ</button></div>
    {!!staged?.length&&<div className="panel"><h2>Bản nhập chưa hoàn tất ({staged.length})</h2><p>Những tác vụ này bị gián đoạn trước khi nhập xong. Có thể xóa phần tạm và nhập lại từ file gốc.</p>{staged.map(b=><div className="restore-row" key={b.id}><span>{b.title}</span><button onClick={()=>void deleteBook(b.id)}>Xóa bản tạm</button></div>)}</div>}
    </section>}
    </main>
  </div>}
  {importing&&<ImportDialog initialAlbum={selectedAlbum||''} onClose={()=>setImporting(false)} onDone={id=>{setImporting(false);setDetail('');openReader(id);notify('Đã thêm truyện vào thư viện.');}}/>}
  {edit&&<Modal title="Thông tin truyện" onClose={()=>setEdit(undefined)}><label>Tên truyện<input value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/></label><label>Ảnh bìa<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void storeSharedImage(file).then(cover=>setEdit(current=>current?{...current,cover}:current)).catch(error=>notify(errorText(error)));}}/></label>{edit.cover&&<button onClick={()=>setEdit({...edit,cover:undefined})}>Bỏ ảnh bìa</button>}<label>Tác giả<input value={edit.author} onChange={e=>setEdit({...edit,author:e.target.value})}/></label><footer><button className="primary" disabled={!edit.title.trim()} onClick={async()=>{await db.books.update(edit.id,{title:edit.title.trim(),author:edit.author,cover:edit.cover,updatedAt:Date.now()});setEdit(undefined);}}>Lưu</button></footer></Modal>}
  {languageStatus&&<div className="worker-status" role="status">◌ {languageStatus}</div>}
  {toast&&<div className="toast" role="status"><span>{toast}</span><button onClick={()=>setToast('')} aria-label="Đóng thông báo">×</button></div>}
  </EffectiveNamesContext.Provider>;
}
