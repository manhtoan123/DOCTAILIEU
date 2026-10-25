export type SettingsGroup='appearance'|'dictionary'|'names'|'prompts'|'ai'|'sync'|'backup'|'cloud'|'about';
export type ReaderRoute={kind:'library';room?:'dark'}|{kind:'book';bookId:string}|{kind:'read';bookId:string;chapterId?:string;bookCode?:number;chapterNumber?:number}|{kind:'numeric-read';bookCode:number;chapterNumber?:number}|{kind:'settings';group:SettingsGroup;bookId?:string};
const groups=new Set<SettingsGroup>(['appearance','dictionary','names','prompts','ai','sync','backup','cloud','about']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Lossless UUID encoding, not a truncated ID or a database alias. */
function shortId(id:string):string|undefined{
  if(!uuid.test(id))return;
  const bytes=id.replace(/-/g,'').match(/../g)!.map(pair=>String.fromCharCode(parseInt(pair,16))).join('');
  return btoa(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fullId(id:string):string|undefined{
  if(!/^[A-Za-z0-9_-]{22}$/.test(id))return;
  const bytes=atob(id.replace(/-/g,'+').replace(/_/g,'/')+'==');
  const hex=Array.from(bytes,char=>char.charCodeAt(0).toString(16).padStart(2,'0')).join('');
  const value=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  // Reject non-canonical padding bits rather than accepting aliases for one ID.
  return shortId(value)===id?value:undefined;
}
export function parseReaderRoute(pathname:string):ReaderRoute{
  try{
    const parts=pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if(parts.some(part=>!part.trim()||part.includes('/')||part.includes('\\')||/[\u0000-\u001f]/u.test(part)))return {kind:'library'};
    if(parts[0]==='phong-toi'&&parts.length===1)return {kind:'library',room:'dark'};
    if(parts[0]==='book'&&parts.length===2)return {kind:'book',bookId:parts[1]};
    if(parts[0]==='r'&&(parts.length===2||parts.length===3)){
      if(/^[1-9]\d{4,11}$/.test(parts[1])&&Number(parts[1])>=10001){
        const value=parts[2];
        if(value===undefined||/^[1-9]\d{0,8}$/.test(value))return {kind:'numeric-read',bookCode:Number(parts[1]),...(value!==undefined?{chapterNumber:Number(value)}:{})};
        return {kind:'library'};
      }

      const bookId=fullId(parts[1]),chapterId=parts[2]?fullId(parts[2]):undefined;
      if(bookId&&(!parts[2]||chapterId))return {kind:'read',bookId,...(chapterId?{chapterId}:{})};
      return {kind:'library'};
    }
    if(parts[0]==='read'&&(parts.length===2||parts.length===3))return {kind:'read',bookId:parts[1],...(parts[2]?{chapterId:parts[2]}:{})};
    if(parts[0]==='settings'&&parts[1]==='ai'&&parts.length===3)return {kind:'settings',group:'ai',bookId:parts[2]};
    if(parts[0]==='settings'&&parts[1]==='names'&&parts.length===3)return {kind:'settings',group:'names',bookId:parts[2]};
    if(parts[0]==='settings'&&parts.length<=2)return {kind:'settings',group:parts[1]==='prompts'?'ai':groups.has(parts[1] as SettingsGroup)?parts[1] as SettingsGroup:'dictionary'};
  }catch{/* Malformed URL encoding must never prevent the library from opening. */}
  return {kind:'library'};
}
export function readerRoutePath(route:ReaderRoute):string{
  if(route.kind==='library')return route.room==='dark'?'/phong-toi':'/';
  if(route.kind==='settings')return `/settings/${route.group==='prompts'?'ai':route.group}${(route.group==='names'||route.group==='ai')&&route.bookId?`/${encodeURIComponent(route.bookId)}`:''}`;
  if(route.kind==='numeric-read')return `/r/${route.bookCode}${route.chapterNumber!==undefined?`/${route.chapterNumber}`:''}`;
  if(route.kind==='read'){
    if(route.bookCode&&(!route.chapterId||route.chapterNumber!==undefined))return `/r/${route.bookCode}${route.chapterNumber!==undefined?`/${route.chapterNumber}`:''}`;
    const book=shortId(route.bookId),chapter=route.chapterId?shortId(route.chapterId):undefined;
    if(book&&(!route.chapterId||chapter))return `/r/${book}${chapter?`/${chapter}`:''}`;
  }
  return `/${route.kind}/${encodeURIComponent(route.bookId)}${route.kind==='read'&&route.chapterId?`/${encodeURIComponent(route.chapterId)}`:''}`;
}

