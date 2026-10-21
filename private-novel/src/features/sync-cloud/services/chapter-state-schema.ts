export interface ChapterStateValue {version:1;baseSha256:string;hiddenIds:string[]}
export function validateHiddenChapterIds(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>10000||value.some(id=>typeof id!=='string'||!id.trim()||id.length>200||/[\u0000-\u001f\u007f]/.test(id))||new Set(value).size!==value.length)throw Error('Danh sách chương đã xóa không hợp lệ.');
 return [...value].sort();
}
export function validateChapterState(value:unknown):ChapterStateValue{
 const v=value as ChapterStateValue;if(!v||v.version!==1||typeof v.baseSha256!=='string'||!/^[a-f0-9]{64}$/.test(v.baseSha256))throw Error('Trạng thái chương không hợp lệ.');
 return {version:1,baseSha256:v.baseSha256,hiddenIds:validateHiddenChapterIds(v.hiddenIds)};
}
export const CHAPTER_STATE_PREFIX='shared-chapter-state:';
export const CHAPTER_STATE_PENDING='pending-chapter-state:';
