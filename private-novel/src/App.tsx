import NameDiscoverySettings from './features/ai/components/NameDiscoverySettings';
import PolishSettings from './features/ai/components/PolishSettings';
import {NavigationLink} from './shared/components/NavigationLink';
import {EffectiveNamesContext} from './features/names-convert/components/EffectiveNamesContext';
import {readEffectiveNamesByBook} from './features/names-convert/services/scoped-names';
import {bookIdForNumber,ensureBookNumber} from './features/reader/services/numeric-reader-route';
import {chapterIdForNumber} from './features/reader/services/chapter-route-number';
import {useSharedImage} from './shared/components/SharedImage';
import {AlbumShelf} from './features/library/components/AlbumShelf';
import {LibraryBookCard} from './features/library/components/LibraryBookCard';
import {VirtualizedBookGrid} from './features/library/components/VirtualizedBookGrid';
import {setLibraryBackground,storeSharedImage} from './features/sync-cloud/services/shared-images';
import {defaults,type ReaderSettings} from './core/domain';
import {applyUiTheme,cachedUiTheme,normalizeUiTheme,type UiTheme} from './shared/ui-theme';
import {UiThemePicker} from './shared/components/UiThemePicker';
import {setReaderTheme} from './features/reader/services/reader-theme';
import {startSharedStateSync} from './features/sync-cloud/services/shared-state-sync';
import SharedSyncPanel from './features/sync-cloud/components/SharedSyncPanel';
import {ConvertedTitle,type TitlePresentation} from './features/names-convert/components/ConvertedTitle';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db,deleteBook} from './core/db';
import {removeBookWithLocalData} from './features/library/services/book-removal';
import {uid,type Book,type NameEntry} from './core/domain';
import {CONVERT_NAMES_KEY} from './features/names-convert/services/convert-names';
import {setLanguageStatus} from './features/names-convert/services/language-client';
import {convertBackend,useConvertBackend} from './features/names-convert/services/convert-server-client';
import ImportDialog from './features/import-export/components/ImportDialog';
import DictionaryPanel from './features/names-convert/components/DictionaryPanel';
import {PromptStockPanel} from './features/ai/components/PromptStockPanel';
import {AiFallbackOrderSettings} from './features/ai/components/AiFallbackOrderSettings';
import {AiLogPage} from './features/ai/components/AiLogPage';
import {initializeAiLogOutbox} from './features/ai/services/ai-log-client';

import BookNamesSettings from './features/names-convert/components/BookNamesSettings';
import {startPromptSync} from './features/ai/prompt/prompt-sync';
import {LibraryManagement} from './features/library/components/LibraryManagement';
import {createAlbum} from './features/library/services/album-registry';
import {readStoredAlbumRegistry} from './features/library/services/album-registry';
import BackupPanel from './features/import-export/components/BackupPanel';
import Reader from './features/reader/components/Reader';
import {StoryDetail} from './features/library/components/StoryDetail';
import CloudPanel from './features/sync-cloud/components/CloudPanel';
import {syncLocalBooks,listCloudBooks,listDeletedCloudBooks,downloadCloudBook,deleteCloudBook,isPublicCloudLibrary,type CloudBook} from './features/sync-cloud/services/cloud-client';
import {initializeCloudDevice,connectCloudDeviceFromLocation} from './features/sync-cloud/services/cloud-device';
import {Modal,errorText} from './shared/components/common';
import {hasChinese} from './features/library/services/title-resolver';
import {normalizeLibrarySearch} from './features/library/services/library-search';
import {useChapterSearch} from './features/library/components/useChapterSearch';
import {albumContains,buildAlbumTree,type AlbumNode} from './features/library/services/album-tree';
import {parseReaderRoute,readerRoutePath,type ReaderRoute} from './features/reader/services/reader-route';
const sample=`Chương 1: Một chỗ ngồi bên cửa sổ\n\nBuổi sáng, nắng ghé qua khung cửa gỗ. Trên bàn có một cuốn sách chưa đọc hết và tách trà vừa pha.\n\nBạn mở trang sách, chỉnh cỡ chữ vừa mắt, rồi để câu chuyện dẫn mình đi. Không có thông báo, không có vội vàng. Chỉ có những trang chữ và một chút thời gian dành riêng cho mình.\n\nChương 2: Lối mòn trong vườn\n\nSau cơn mưa, khu vườn trở nên yên tĩnh. Tiếng lá xào xạc như một lời nhắc: đôi khi điều cần làm chỉ là chậm lại.\n\nBạn có thể thử nút Nghe truyện, đổi nền Sepia, hoặc quay về tủ sách để nhập TXT của mình.\n\nChương 3: Trang sách tiếp theo\n\nThư phòng ghi nhớ nơi bạn dừng lại. Khi trở về, câu chuyện vẫn chờ ở đó.\n\nĐây là văn bản mẫu tự viết để kiểm tra trình đọc và giọng nói.\n`;
export default function App(){
  const appearance=useLiveQuery(()=>db.settings.get('reader'),[],null);const libraryBackground=useSharedImage((appearance?.value as ReaderSettings|undefined)?.libraryBackground);
  const [initialUiTheme]=useState(cachedUiTheme),[themeSaving,setThemeSaving]=useState(false);
  const uiTheme=appearance===null?initialUiTheme:normalizeUiTheme((appearance?.value as ReaderSettings|undefined)?.theme??defaults.theme);
  useLayoutEffect(()=>{if(appearance!==null)applyUiTheme(uiTheme);},[appearance,uiTheme]);
  async function chooseUiTheme(theme:UiTheme){if(themeSaving)return;setThemeSaving(true);try{await setReaderTheme(theme);}catch(error){notify(errorText(error));}finally{setThemeSaving(false);}}
  useEffect(()=>startPromptSync(),[]);
  useEffect(()=>{initializeAiLogOutbox();},[]);
  const books=useLiveQuery(()=>db.books.where('status').equals('ready').reverse().sortBy('updatedAt'),[]);const staged=useLiveQuery(()=>db.books.where('status').equals('staging').toArray(),[]);
  const[tab,setTab]=useState<'library'|'appearance'|'dictionary'|'names'|'prompts'|'ai'|'ai-log'|'sync'|'backup'|'cloud'|'about'>('library');const[active,setActive]=useState('');const[importing,setImporting]=useState(false);const[search,setSearch]=useState('');const[toast,setToast]=useState('');const[languageStatus,setStatus]=useState('');const[edit,setEdit]=useState<Book>();
  const [route,setRoute]=useState<ReaderRoute>(()=>parseReaderRoute(location.pathname,location.search));const routeRef=useRef(route);const routeGeneration=useRef(0);const appliedRoute=useRef<ReaderRoute|null>(null);const [readerNavigation,setReaderNavigation]=useState(0);
  const readingRoute=route.kind==='read'||route.kind==='numeric-read';
  const backend=useConvertBackend();
  useEffect(()=>startSharedStateSync(()=>convertBackend()==='local'&&!['read','numeric-read'].includes(routeRef.current.kind)),[]);
  const navigate=useCallback((next:ReaderRoute)=>{routeRef.current=next;routeGeneration.current++;history.pushState(null,'',readerRoutePath(next));setRoute(next);if(next.kind==='read'||next.kind==='numeric-read')setOpening(true);},[]);
  useEffect(()=>{const pop=()=>{const next=parseReaderRoute(location.pathname,location.search);routeRef.current=next;routeGeneration.current++;setRoute(next);setOpening(next.kind==='read'||next.kind==='numeric-read');};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const [cloudStatus,setCloudStatus]=useState('');
  const [cloudSyncError,setCloudSyncError]=useState('');
  const [selectedAlbum,setSelectedAlbum]=useState<string|null>(()=>location.pathname==='/phong-toi'?new URLSearchParams(location.search).get('album'):null);
  const [darkRoom,setDarkRoom]=useState(()=>parseReaderRoute(location.pathname,location.search).kind==='library'&&location.pathname==='/phong-toi');
  const roomRef=useRef(darkRoom);
  const libraryDestination:ReaderRoute=darkRoom?{kind:'library',room:'dark',...(selectedAlbum?{album:selectedAlbum}:{})}:{kind:'library'};
  useEffect(()=>{
    if(route.kind!=='library')return;
    const next=route.room==='dark';
    setSelectedAlbum(next?route.album??null:null);roomRef.current=next;
    setDarkRoom(next);
  },[route]);
  const [libraryView,setLibraryView]=useState<'grid'|'list'|'compact'>(()=>{try{const value=localStorage.getItem('library-view');return value==='list'||value==='compact'?value:'grid';}catch{return 'grid';}});
  useEffect(()=>{try{localStorage.setItem('library-view',libraryView);}catch{}},[libraryView]);
  const [titleIndex,setTitleIndex]=useState<Record<string,TitlePresentation>>({});
  const recordTitle=useCallback((result:TitlePresentation)=>setTitleIndex(old=>old[result.bookId]?.signature===result.signature&&old[result.bookId]?.text===result.text&&old[result.bookId]?.value===result.value?old:{...old,[result.bookId]:result}),[]);
  const titleContext=useLiveQuery(async()=>{
    if(readingRoute||backend!=='local')return undefined;
    const [namesByBook,global,files]=await Promise.all([readEffectiveNamesByBook(),db.settings.get(CONVERT_NAMES_KEY),db.dictionaries.toArray()]);
    return {namesByBook,global:global?.value,dictionaries:files.map(d=>[d.kind,d.sha256,d.updatedAt])};
  },[readingRoute,backend]);
  const [publicMode,setPublicMode]=useState(false);
  const [cloudBooks,setCloudBooks]=useState<CloudBook[]>([]),[cloudLoaded,setCloudLoaded]=useState(false),[cloudError,setCloudError]=useState(''),[opening,setOpening]=useState(()=>{const initial=parseReaderRoute(location.pathname,location.search);return initial.kind==='read'||initial.kind==='numeric-read';});
  const catalogGeneration=useRef(0);
  const refreshCloud=useCallback(async()=>{const generation=++catalogGeneration.current;try{await listDeletedCloudBooks();const catalog=await listCloudBooks();if(generation===catalogGeneration.current){setCloudBooks(catalog);setPublicMode(isPublicCloudLibrary());setCloudLoaded(true);setCloudError('');}}catch(error){if(generation===catalogGeneration.current)setCloudError(errorText(error));}},[]);
  const[lastSetting,setLastSetting]=useState<'appearance'|'dictionary'|'names'|'prompts'|'ai'|'ai-log'|'sync'|'backup'|'cloud'|'about'>('dictionary');
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
  const demoOpening=useRef(false);
  async function demo(){
    if(demoOpening.current)return;
    demoOpening.current=true;
    try{
      const id=uid(),textParts=sample.split(/(?=Chương \d+:)/).filter(Boolean);
      await db.transaction('rw',[db.books,db.chapters],async()=>{
        await db.books.add({id,title:'Một khoảng bình yên',author:'Thư Phòng · truyện mẫu',status:'ready',chapterCount:textParts.length,charCount:sample.length,createdAt:Date.now(),updatedAt:Date.now()});
        await db.chapters.bulkAdd(textParts.map((text,order)=>({id:uid(),bookId:id,order,title:text.split('\n')[0],text,revision:1,sourceId:''})));
      });
      openReader(id);
    }catch(error){notify(errorText(error));}
    finally{demoOpening.current=false;}
  }
  const deletedOnCloud=useLiveQuery(()=>db.transaction('r',db.settings,async()=>{
    const deletedPrefix=`cloud-deleted:${location.origin}:`,protectedPrefix=`cloud-delete-review:${location.origin}:`;
    const deleted=await db.settings.where('key').startsWith(deletedPrefix).toArray(),protectedRows=await db.settings.where('key').startsWith(protectedPrefix).toArray();
    const protectedIds=new Set(protectedRows.map(row=>row.key.slice(protectedPrefix.length)));
    return new Set(deleted.map(row=>row.key.slice(deletedPrefix.length)).filter(id=>!protectedIds.has(id)));
  }),[]);
  const localIds=new Set(books?.map(book=>book.id));
  const shelf=[...(books||[]),...cloudBooks.filter(book=>!localIds.has(book.id)).map(book=>({...book,author:book.author??'',createdAt:book.updatedAt,status:'ready' as const,chapterCount:0,charCount:0}))];
  const detailDestination:ReaderRoute=!darkRoom&&detail&&shelf.find(book=>book.id===detail)?.album
    ?{kind:'library',room:'dark'}:libraryDestination;
  const albumRegistry=useLiveQuery(async()=>{try{return await readStoredAlbumRegistry();}catch{return undefined;}},[]);
  const albumProgress=useLiveQuery(async()=>tab==='library'&&darkRoom?await db.progress.toArray():[],[tab,darkRoom]);
  const shelfTitles:Record<string,string>={};
  for(const book of shelf){const entry=titleIndex[book.id],signature=titleContext?JSON.stringify({names:titleContext.namesByBook.get(book.id)||[],global:titleContext.global,dictionaries:titleContext.dictionaries}):'';shelfTitles[book.id]=book.displayTitle||(entry?.text===book.title&&entry.signature===signature?entry.value:book.title);}
  const albums=[...new Set([...shelf.map(book=>book.album).filter((album):album is string=>!!album),...(albumRegistry?.albums.map(album=>album.name)??[])])].sort((a,b)=>a.localeCompare(b,'vi'));
  const albumTree=buildAlbumTree(albums,shelf);
  const currentAlbum=selectedAlbum?albumTree.nodes.get(selectedAlbum):undefined;
  const childAlbums=selectedAlbum?currentAlbum?.children||[]:albumTree.roots;
  const albumTrail:AlbumNode[]=[];
  for(let node=currentAlbum;node;node=node.parent?albumTree.nodes.get(node.parent):undefined)albumTrail.unshift(node);
  const directBooks=selectedAlbum?shelf.filter(b=>b.album===selectedAlbum):darkRoom?[]:shelf.filter(b=>!b.album);
  const currentBooks=search.trim()?(selectedAlbum?shelf.filter(book=>albumContains(selectedAlbum,book.album)):darkRoom?shelf.filter(book=>!!book.album):directBooks):directBooks;
  const searchChapters=!readingRoute&&tab==='library'&&!detail&&(!darkRoom||!!selectedAlbum);
  const chapterSearch=useChapterSearch(searchChapters?currentBooks.filter(book=>localIds.has(book.id)).map(book=>book.id):[],searchChapters?search:'',titleContext?.namesByBook,JSON.stringify(titleContext?{names:[...titleContext.namesByBook],global:titleContext.global,dictionaries:titleContext.dictionaries}:null));
  const filtered=currentBooks.filter(b=>{
    const entry=titleIndex[b.id],signature=titleContext?JSON.stringify({names:titleContext.namesByBook.get(b.id)||[],global:titleContext.global,dictionaries:titleContext.dictionaries}):'';
    const converted=b.displayTitle||(entry?.text===b.title&&entry.signature===signature?entry.value:'');
    return normalizeLibrarySearch(`${b.title} ${converted} ${b.author} ${b.album||''}`).includes(normalizeLibrarySearch(search))||Boolean(chapterSearch.matches[b.id]);
  });
  const emptyView=darkRoom&&!selectedAlbum?!childAlbums.length:!filtered.length;
  const catalogLoading=books===undefined||(!cloudLoaded&&!cloudError);
  const showRoomEntry=!darkRoom&&!selectedAlbum&&!search.trim()&&!directBooks.length&&albums.length>0;
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
        let purged=0;
        for(const b of toPurge){
          try{
            await removeBookWithLocalData(b.id,async()=>{
              if(await db.settings.get(`cloud-delete-review:${location.origin}:${b.id}`))throw Error('delete_review_pending');
            });purged++;
          }catch(error){if(!(error instanceof Error&&error.message==='delete_review_pending'))notify(errorText(error));}
        }
        if(purged)notify(`Đã dọn sạch ${purged} truyện đã xóa khỏi kho.`);
      })();
    }
  },[deletedOnCloud,books,notify]);

  const [selectedBooks,setSelectedBooks]=useState<string[]>([]),[selectedAlbums,setSelectedAlbums]=useState<string[]>([]);
  const [librarySelecting,setLibrarySelecting]=useState(false);
  const [managingLibrary,setManagingLibrary]=useState<{action:'rename'|'delete';bookIds:string[];albumPaths:string[]}>();
  const clearSelection=()=>{setSelectedBooks([]);setSelectedAlbums([]);};
  useEffect(()=>{clearSelection();setManagingLibrary(undefined);},[darkRoom,selectedAlbum,tab,detail,search]);
  useEffect(()=>{setLibrarySelecting(false);},[darkRoom,selectedAlbum,tab,detail]);
  function toggleLibrarySelection(){clearSelection();setLibrarySelecting(value=>!value);}
  const toggleSelected=(kind:'book'|'album',id:string)=>{const set=kind==='book'?setSelectedBooks:setSelectedAlbums;set(old=>old.includes(id)?old.filter(value=>value!==id):[...old,id]);};
  const selectedCount=selectedBooks.length+selectedAlbums.length;
  const [newAlbumName,setNewAlbumName]=useState(''),[creatingAlbum,setCreatingAlbum]=useState(false);
  function selectAlbum(name:string|null){setSelectedAlbum(name);setSearch('');setNewAlbumName('');setCreatingAlbum(false);navigate({kind:'library',room:'dark',...(name?{album:name}:{})});}
  function enterRoom(dark:boolean){setSelectedAlbum(null);setSearch('');navigate(dark?{kind:'library',room:'dark'}:{kind:'library'});}
  const darkRoomLink=<NavigationLink className="text-button" href="/phong-toi" aria-label="Mở Phòng tối" onNavigate={()=>enterRoom(true)}>Phòng tối</NavigationLink>;
  async function addAlbum(){if(!newAlbumName.trim())return;try{const album=await createAlbum(selectedAlbum?`${selectedAlbum}/${newAlbumName.trim()}`:newAlbumName);selectAlbum(album.name);}catch(e){notify(errorText(e));}}

  async function removeShelf(book:Book){
    const shared=cloudLoaded||cloudBooks.some(row=>row.id===book.id)||!!await db.settings.get(`cloud-uploaded:${location.origin}:${book.id}`);
    try{if(shared)await deleteCloudBook(book.id);await removeBookWithLocalData(book.id);setCloudBooks(current=>current.filter(row=>row.id!==book.id));notify(shared?'Đã xóa truyện khỏi kho chung và thiết bị này.':'Đã xóa bản trên thiết bị.');void refreshCloud();}catch(error){notify(errorText(error));}
  }

  const directReaderPending=opening&&readingRoute&&!active;
  return <EffectiveNamesContext.Provider value={readingRoute?(active?undefined:null):titleContext?.namesByBook??null}>{directReaderPending?<main className="reader-route-loading" role="status" aria-live="polite">Đang mở chương…</main>:active?<Reader key={`${active}:${entryChapter||'resume'}:${readerNavigation}`} bookId={active} initialChapterId={entryChapter} backHref={readerRoutePath(detail?{kind:'book',bookId:active}:libraryDestination)} backLabel={detail?'← Thông tin truyện':darkRoom?'← Phòng tối':'← Tủ sách'} onChapterChange={ownedChapterChanged} onBack={()=>navigate(detail?{kind:'book',bookId:active}:libraryDestination)} onBookInfo={()=>navigate({kind:'book',bookId:active})} onAiSettings={()=>navigate({kind:'settings',group:'ai',bookId:active})} notify={notify}/>:<div className={`shell ${libraryBackground?'has-library-background':''}`} style={libraryBackground?{backgroundImage:`url("${libraryBackground}")`}:undefined}>
    <header className="sidebar"><NavigationLink className="brand" href="/" onNavigate={()=>enterRoom(false)}><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 9c7-3 12-2 15 1 3-3 8-4 15-1v23c-7-3-12-2-15 1-3-3-8-4-15-1z"/><path d="M20 10v23"/></svg><span>Thư phòng</span></NavigationLink>
    <nav aria-label="Điều hướng chính"><button className={tab==='library'?'active':''} aria-current={tab==='library'&&!darkRoom?'page':undefined} onClick={()=>enterRoom(false)}><span>▤</span>Tủ sách</button><button className={tab!=='library'?'active':''} aria-current={tab!=='library'?'page':undefined} onClick={()=>{navigate({kind:'settings',group:lastSetting});}}><span>⚙</span>Cài đặt</button></nav>
    </header>
    <main className="workspace">
    {tab!=='library'&&<header className="settings-heading"><h1>Cài đặt</h1><select aria-label="Nhóm cài đặt" value={tab} onChange={event=>{const group=event.target.value as typeof lastSetting;navigate({kind:'settings',group});}}><option value="appearance">Giao diện</option><option value="dictionary">Từ điển</option><option value="names">Name riêng</option><option value="ai">Dịch AI &amp; Prompt</option><option value="ai-log">Nhật ký</option><option value="sync">Đồng bộ chỉnh sửa</option>{!publicMode&&<><option value="cloud">Kho & thiết bị</option><option value="backup">Sao lưu & khôi phục</option></>}<option value="about">Thông tin</option></select></header>}
    {tab==='library'&&detail&&<StoryDetail key={detail} bookId={detail} backHref={readerRoutePath(detailDestination)} backLabel={detailDestination.room==='dark'?'← Phòng tối':'← Tủ sách'} onBack={()=>navigate(detailDestination)} onRead={chapterId=>openReader(detail,chapterId)}/>}
    {tab==='library'&&!detail&&<>
      {selectedAlbum&&<nav className="album-breadcrumbs" aria-label="Đường dẫn Album">
        <NavigationLink href="/phong-toi" onNavigate={()=>selectAlbum(null)}>Phòng tối</NavigationLink>
        {albumTrail.filter(node=>node.path!==selectedAlbum).map(node=><span key={node.path}><span aria-hidden="true">/</span><NavigationLink aria-label={`Về Album ${node.path}`} href={readerRoutePath({kind:'library',room:'dark',album:node.path})} onNavigate={()=>selectAlbum(node.path)}><ConvertedTitle text={node.name} bookId=""/></NavigationLink></span>)}
      </nav>}
      <header className="library-title">
        <div className="album-title-group"><h1>{selectedAlbum?<ConvertedTitle text={currentAlbum?.name||selectedAlbum} bookId="" showOriginal/>:darkRoom?'Phòng tối':'Tủ sách'}</h1></div>
        <div className="library-actions">
          {darkRoom&&<button aria-expanded={creatingAlbum} onClick={()=>setCreatingAlbum(old=>!old)}>{selectedAlbum?'Tạo Album con / Series':'Tạo Album'}</button>}
          {darkRoom&&<button disabled={opening} aria-pressed={librarySelecting} onClick={toggleLibrarySelection}>{librarySelecting?'Xong':'Quản lý'}</button>}
          <button className="primary" onClick={()=>setImporting(true)}>Thêm truyện</button>
        </div>
      </header>
      {darkRoom&&creatingAlbum&&<div className="album-create">
        <input aria-label={selectedAlbum?'Tên Album con mới':'Tên Album mới'} value={newAlbumName} onChange={e=>setNewAlbumName(e.target.value)} maxLength={120}/>
        <button onClick={()=>void addAlbum()}>Tạo</button>
      </div>}
      {darkRoom&&librarySelecting&&selectedCount>0&&<div className="library-selection-actions" role="group" aria-label="Thao tác đã chọn"><span>{selectedCount} đã chọn</span><button disabled={opening||selectedCount!==1} onClick={()=>setManagingLibrary({action:'rename',bookIds:[...selectedBooks],albumPaths:[...selectedAlbums]})}>Sửa tên</button><button className="btn-danger" disabled={opening} onClick={()=>setManagingLibrary({action:'delete',bookIds:[...selectedBooks],albumPaths:[...selectedAlbums]})}>Xóa</button></div>}
      <section className="library-section">
        {shelf.map(b=>!b.displayTitle&&<ConvertedTitle key={b.id} text={b.title} bookId={b.id} onReady={recordTitle} render={false}/>)}
        {cloudStatus&&<p className="muted" role="status">{cloudStatus}</p>}
        {(cloudError||cloudSyncError)&&<p className="notice" role="status">{cloudError||cloudSyncError} <button onClick={()=>void syncCloud().then(()=>refreshCloud())}>Thử lại kho</button></p>}

        {darkRoom&&childAlbums.length > 0 && (
          <AlbumShelf
            key={selectedAlbum??'root'} books={shelf} titles={shelfTitles} progress={albumProgress??[]} showSearch={!selectedAlbum}
            search={search} onSearch={setSearch} opening={opening} onRead={id=>void openShelf(id)}
            albums={childAlbums}
            heading={selectedAlbum?'Album con / Series':'Album tác giả'}
            onSelect={selectAlbum}
            selected={selectedAlbums}
            onToggle={librarySelecting?path=>toggleSelected('album',path):undefined}
          />
        )}

        <div className="library-toolbar" hidden={darkRoom&&!selectedAlbum&&childAlbums.length>0}>
          <input
            className="search"
            type="search"
            aria-label={selectedAlbum ? `Tìm truyện trong ${selectedAlbum}` : 'Tìm truyện'}
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Tìm truyện, tác giả hoặc chương…"
          />
          <div className="segmented library-view" role="group" aria-label="Cách xem tủ sách">
            <button className={libraryView==='grid'?'active':''} aria-pressed={libraryView==='grid'} onClick={()=>setLibraryView('grid')}>Lưới</button>
            <button className={libraryView==='list'?'active':''} aria-pressed={libraryView==='list'} onClick={()=>setLibraryView('list')}>Danh sách</button>
            <button className={libraryView==='compact'?'active':''} aria-pressed={libraryView==='compact'} onClick={()=>setLibraryView('compact')}>Thu gọn</button>
          </div>
        </div>
        {search.trim()&&(!darkRoom||!!selectedAlbum)&&<p className="muted" role="status">{chapterSearch.pending?'Đang tìm tên chương…':chapterSearch.error?'Không thể tìm theo tên chương.':`${filtered.length} kết quả`}{currentBooks.some(book=>!localIds.has(book.id))&&' Chỉ tìm tên chương trong truyện đã tải.'}</p>}

        {selectedAlbum&&childAlbums.length>0&&directBooks.length>0&&!search.trim()&&<div className="section-heading"><h2>Truyện ngoài Series ({directBooks.length})</h2></div>}

        {showRoomEntry ? (
          <div className="library-empty"><p>Chưa có truyện ngoài Album</p>{darkRoomLink}</div>
        ) : emptyView&&catalogLoading ? (
          <p className="library-empty" role="status">Đang tải tủ sách…</p>
        ) : emptyView&&!cloudLoaded&&cloudError ? null : darkRoom&&!selectedAlbum ? (
          !childAlbums.length&&<p className="library-empty">Chưa có Album</p>
        ) : !selectedAlbum&&!shelf.length&&cloudLoaded&&!cloudError ? (
          <div className="library-empty">
            <p>Chưa có truyện</p>
            <button onClick={()=>void demo()}>Đọc truyện mẫu →</button>
          </div>
        ) : selectedAlbum && childAlbums.length>0&&!search.trim()&&!directBooks.length ? (
          null
        ) : !currentBooks.length && !search.trim() ? (
          <p className="library-empty">Chưa có truyện</p>
        ) : !filtered.length ? (
          <p className="notice">{chapterSearch.pending?'Đang tìm truyện và tên chương…':'Không có truyện hoặc tên chương khớp từ khóa tìm kiếm.'}</p>
        ) : (
          <VirtualizedBookGrid items={filtered} view={libraryView} renderItem={(book,index,virtualized)=>(
              <LibraryBookCard
                key={book.id}
                book={book}
                index={index}
                virtualIndex={virtualized?index:undefined}
                virtualTotal={virtualized?filtered.length:undefined}
                compact={libraryView==='compact'}
                displayTitle={book.displayTitle || (titleIndex[book.id]?.text === book.title ? titleIndex[book.id].value : book.title)}
                isLocal={localIds.has(book.id)}
                deletedOnCloud={deletedOnCloud?.has(book.id) ?? false}
                opening={opening}
                selected={selectedBooks.includes(book.id)}
                hideActions={darkRoom}
                onToggle={darkRoom&&selectedAlbum&&librarySelecting?()=>toggleSelected('book',book.id):undefined}
                onOpenDetails={() => void openShelf(book.id, true)}
                onRead={() => void openShelf(book.id)}
                chapterMatch={chapterSearch.matches[book.id]}
                onReadChapter={chapterId=>openReader(book.id,chapterId)}
                onEdit={() => setEdit({...book})}
                onRemove={() => void removeShelf(book)}
              />
          )}/>
        )}
      </section>
      {!darkRoom&&!showRoomEntry&&<footer className="room-footer">{darkRoomLink}</footer>}
    </>}
    {tab==='appearance'&&<section className="appearance-page"><h2>Giao diện</h2><div className="appearance-theme-panel"><h3>Màu giao diện</h3><UiThemePicker value={uiTheme} onChange={theme=>void chooseUiTheme(theme)} disabled={themeSaving}/></div><h3>Ảnh nền tủ truyện</h3><div className="shelf-background-tools"><label className="image-picker">Ảnh nền<input aria-label="Chọn ảnh nền tủ truyện" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void setLibraryBackground(file).catch(error=>notify(errorText(error)));e.target.value='';}}/></label>{(appearance?.value as ReaderSettings|undefined)?.libraryBackground&&<button onClick={()=>void setLibraryBackground().catch(error=>notify(errorText(error)))}>Bỏ ảnh nền</button>}</div></section>}
    {tab==='names'&&<BookNamesSettings books={books} bookId={route.kind==='settings'&&route.group==='names'?route.bookId:undefined} onSelect={bookId=>navigate({kind:'settings',group:'names',bookId})}/>}{tab==='sync'&&<SharedSyncPanel/>}{tab==='dictionary'&&<DictionaryPanel/>}{(tab==='ai'||tab==='prompts')&&<><PolishSettings/><NameDiscoverySettings/><AiFallbackOrderSettings notify={notify}/><PromptStockPanel key={route.kind==='settings'?route.bookId||'global':'global'} initialBookId={route.kind==='settings'?route.bookId:undefined} books={books||[]} notify={notify}/></>}
    {tab==='ai-log'&&<AiLogPage/>}{tab==='backup'&&<BackupPanel/>}{tab==='cloud'&&<CloudPanel status={cloudSyncError||cloudStatus} onSync={syncCloud} onRead={id=>openReader(id)}/>}{tab==='about'&&<section><h2>Thông tin</h2><div className="panel"><p>Truyện lưu trên thiết bị và tự đồng bộ khi có kho chung. Người có đường dẫn kho chung có thể đọc truyện đã đồng bộ.</p><p>Sau khi ứng dụng đã mở online và lưu app shell, giao diện cùng truyện trên thiết bị có thể mở khi mất mạng. AI, đồng bộ và tạo audio mới cần internet.</p><button onClick={async()=>{const ok=await navigator.storage?.persist();notify(ok?'Trình duyệt đã cho phép lưu trữ bền vững. Vẫn cần sao lưu.':'Trình duyệt chưa cấp lưu trữ bền vững. Hãy sao lưu thường xuyên.');}}>Xin lưu trữ bền vững</button><button onClick={async()=>{await navigator.clipboard.writeText(location.origin);notify('Đã sao chép địa chỉ ứng dụng.');}}>Sao chép địa chỉ</button></div>
    {!!staged?.length&&<div className="panel"><h2>Bản nhập chưa hoàn tất ({staged.length})</h2><p>Những tác vụ này bị gián đoạn trước khi nhập xong. Có thể xóa phần tạm và nhập lại từ file gốc.</p>{staged.map(b=><div className="restore-row" key={b.id}><span>{b.title}</span><button onClick={()=>void deleteBook(b.id)}>Xóa bản tạm</button></div>)}</div>}
    </section>}
    </main>
  </div>}
  {managingLibrary&&darkRoom&&tab==='library'&&!detail&&<LibraryManagement books={books||[]} cloudBooks={cloudBooks} {...managingLibrary} shared={cloudLoaded} onClose={()=>setManagingLibrary(undefined)} onChanged={()=>{clearSelection();void refreshCloud();}}/>}
  {importing&&<ImportDialog initialAlbum={selectedAlbum||''} onClose={()=>setImporting(false)} onDone={id=>{setImporting(false);setDetail('');openReader(id);notify('Đã thêm truyện vào thư viện.');}}/>}
  {edit&&<Modal title="Thông tin truyện" onClose={()=>setEdit(undefined)}><label>Tên truyện<input value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/></label><label>Ảnh bìa<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void storeSharedImage(file).then(cover=>setEdit(current=>current?{...current,cover}:current)).catch(error=>notify(errorText(error)));}}/></label>{edit.cover&&<button onClick={()=>setEdit({...edit,cover:undefined})}>Bỏ ảnh bìa</button>}<label>Tác giả<input value={edit.author} onChange={e=>setEdit({...edit,author:e.target.value})}/></label><footer><button className="primary" disabled={!edit.title.trim()} onClick={async()=>{await db.books.update(edit.id,{title:edit.title.trim(),author:edit.author,cover:edit.cover,updatedAt:Date.now()});setEdit(undefined);}}>Lưu</button></footer></Modal>}
  {languageStatus&&<div className="worker-status" role="status">◌ {languageStatus}</div>}
  {toast&&<div className="toast" role="status"><span>{toast}</span><button onClick={()=>setToast('')} aria-label="Đóng thông báo">×</button></div>}
  </EffectiveNamesContext.Provider>;
}
