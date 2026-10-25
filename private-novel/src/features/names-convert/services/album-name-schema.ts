/** Match Album tree semantics, including legacy paths with empty segments. */
export function nameAlbumRoot(album?:string):string|undefined{
 if(!album)return;const parts=album.split('/');return parts.every(Boolean)?parts[0]:album;
}
export const ALBUM_NAMES_PREFIX='shared-album-name:';
export function albumNameKey(album:string,key:string){return JSON.stringify([album,key]);}
export function parseAlbumNameKey(input:string):[string,string]{
 let pair:unknown;try{pair=JSON.parse(input);}catch{throw Error('Khóa Name Album không hợp lệ.');}
 if(!Array.isArray(pair)||pair.length!==2||pair.some(v=>typeof v!=='string'))throw Error('Khóa Name Album không hợp lệ.');
 const [album,key]=pair as [string,string];
 if(!album||album.length>120||nameAlbumRoot(album)!==album||/[\u0000-\u001f\u007f]/.test(album)||!key||key!==key.trim()||key.length>256||key.startsWith('#')||/[\u0000-\u001f\u007f=]/.test(key)||albumNameKey(album,key)!==input)throw Error('Khóa Name Album không hợp lệ.');
 try{encodeURIComponent(input);}catch{throw Error('Khóa Name Album không hợp lệ.');}return [album,key];
}
export const albumNameSetting=(key:string)=>ALBUM_NAMES_PREFIX+encodeURIComponent(key);
