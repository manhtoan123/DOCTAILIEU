export type SettingsGroup='appearance'|'dictionary'|'names'|'prompts'|'ai'|'sync'|'backup'|'cloud'|'about';
export type ReaderRoute={kind:'library';room?:'dark'}|{kind:'book';bookId:string}|{kind:'read';bookId:string;chapterId?:string}|{kind:'settings';group:SettingsGroup;bookId?:string};
const groups=new Set<SettingsGroup>(['appearance','dictionary','names','prompts','ai','sync','backup','cloud','about']);
export function parseReaderRoute(pathname:string):ReaderRoute{
  try{
    const parts=pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if(parts.some(part=>!part.trim()||part.includes('/')||part.includes('\\')||/[\u0000-\u001f]/u.test(part)))return {kind:'library'};
    if(parts[0]==='phong-toi'&&parts.length===1)return {kind:'library',room:'dark'};
    if(parts[0]==='book'&&parts.length===2)return {kind:'book',bookId:parts[1]};
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
  return `/${route.kind}/${encodeURIComponent(route.bookId)}${route.kind==='read'&&route.chapterId?`/${encodeURIComponent(route.chapterId)}`:''}`;
}

