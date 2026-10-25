import {db} from '../../../core/db';
import {saveScopedBookNames,deleteScopedBookName} from '../../names-convert/services/scoped-names';
import {expandConvertSelection,saveConvertNames} from '../../names-convert/services/convert-names';
import type {Token} from '../../names-convert/services/language';

export interface ReaderWordEdit {sourceStart:number;sourceEnd:number;value:string}

/** Guard and merge run in one transaction, including the nested Name writer. */
export async function saveReaderName(bookId:string,chapterId:string,revision:number,key:string,value:string,scope:'book'|'global',expectedAlbum?:string|null):Promise<void> {
  if(/[\r\n=]/.test(key)||/[\r\n]/.test(value))throw new Error('Tên và nghĩa phải nằm trên một dòng; khóa không chứa dấu =.');
  key=key.trim();value=value.trim();
  if(!key||key.startsWith('#')||key.length>256||!value||value.length>2048)throw new Error('Khóa Name cần 1–256 ký tự, không bắt đầu bằng #; nghĩa cần 1–2.048 ký tự.');
  if(scope!=='book'&&scope!=='global')throw new Error('Phạm vi Name không hợp lệ.');
  if(!Number.isSafeInteger(revision))throw new Error('Phiên bản chương không hợp lệ.');
  await db.transaction('rw',[db.books,db.chapters,db.settings,...(scope==='book'?[db.names]:[])],async()=>{
    const book=await db.books.get(bookId);
    if(book?.status!=='ready'||book.hiddenChapterIds?.includes(chapterId))throw new Error('Truyện không còn trong thư viện.');
    const chapter=await db.chapters.get(chapterId);
    if(!chapter||chapter.bookId!==bookId||chapter.revision!==revision)throw new Error('Chương đã thay đổi; hãy mở lại trước khi lưu Name.');
    if(scope==='book')await saveScopedBookNames(bookId,`${key}=${value}`,expectedAlbum);
    else await saveConvertNames(`${key}=${value}`);
  });
}

/** Deletes only the current book's exact Name after rechecking the chapter in the same transaction. */
export async function deleteReaderName(bookId:string,chapterId:string,revision:number,key:string,expectedAlbum?:string|null,expected?:{id:string;value:string}){if(!key.trim()||key!==key.trim()||key.startsWith('#')||/[\r\n=]/.test(key)||key.length>256||!Number.isSafeInteger(revision))throw Error('Name không hợp lệ.');await db.transaction('rw',[db.books,db.chapters,db.names,db.settings],async()=>{const book=await db.books.get(bookId),chapter=await db.chapters.get(chapterId);if(book?.status!=='ready'||book.hiddenChapterIds?.includes(chapterId)||chapter?.bookId!==bookId||chapter.revision!==revision)throw Error('Chương đã thay đổi; mở lại trước khi xóa Name.');await deleteScopedBookName(bookId,key,expected,expectedAlbum);});}

function boundary(source:string,offset:number) {
  return Number.isSafeInteger(offset)&&offset>=0&&offset<=source.length&&!(offset>0&&offset<source.length&&/[\uD800-\uDBFF]/.test(source[offset-1])&&/[\uDC00-\uDFFF]/.test(source[offset]));
}
function range(source:string,start:number,end:number) {
  if(!boundary(source,start)||!boundary(source,end)||start>=end)throw new Error('Vùng chọn không hợp lệ hoặc cắt đôi ký tự Unicode.');
}
function sourceTokens(source:string,tokens:Token[]) {
  let previousStart=-1,covered=0;
  for(const token of tokens) {
    if(!boundary(source,token.sourceStart)||!boundary(source,token.sourceEnd)||token.sourceStart>token.sourceEnd||token.sourceStart<previousStart||token.source!==source.slice(token.sourceStart,token.sourceEnd))throw new Error('Token không khớp nguồn chương.');
    previousStart=token.sourceStart;
    if(token.sourceStart===token.sourceEnd)continue;
    if(token.sourceStart<covered)throw new Error('Token nguồn chồng lấn.');
    covered=token.sourceEnd;
  }
  return tokens.filter(token=>token.sourceStart<token.sourceEnd);
}

/** Expand by a full neighboring source token; decorations consume no source. */
export function expandReaderSelection(source:string,tokens:Token[],start:number,end:number,direction:'left'|'right') {
  range(source,start,end);
  const words=sourceTokens(source,tokens);
  // Invisible spacing is included with the next word; never swallow a paragraph break.
  const candidates=direction==='left'?words.slice().reverse().filter(token=>token.sourceStart<start):words.filter(token=>token.sourceEnd>end);
  let adjacent:Token|undefined;for(const token of candidates){if(/[\r\n]/.test(direction==='left'?source.slice(token.sourceStart,start):source.slice(end,token.sourceEnd)))break;if(token.source.trim()){adjacent=token;break;}}
  if(!adjacent&&words.length)return {sourceStart:start,sourceEnd:end,source:source.slice(start,end)};
  if(!adjacent){const next=expandConvertSelection(source,start,end,direction);if(/[\r\n]/.test(next.source.slice(0,start-next.sourceStart)+next.source.slice(end-next.sourceStart)))return {sourceStart:start,sourceEnd:end,source:source.slice(start,end)};return next;}
  const sourceStart=direction==='left'?adjacent.sourceStart:start;
  const sourceEnd=direction==='right'?adjacent.sourceEnd:end;
  return {sourceStart,sourceEnd,source:source.slice(sourceStart,sourceEnd)};
}

/** Ephemeral range edits; overlapping edits are rejected, never matched by phrase. */
export function applyReaderWordEdits(source:string,tokens:Token[],edits:ReaderWordEdit[]):Token[] {
  if(!edits.length)return tokens.slice();
  const words=sourceTokens(source,tokens),sorted=edits.slice().sort((a,b)=>a.sourceStart-b.sourceStart);
  let previousEnd=-1;
  for(const edit of sorted) {
    range(source,edit.sourceStart,edit.sourceEnd);
    if(edit.sourceStart<previousEnd)throw new Error('Các vùng sửa tạm chồng lấn.');
    if(!edit.value.trim()||/[\r\n]/.test(edit.value)||edit.value.length>2048)throw new Error('Nghĩa sửa tạm không hợp lệ.');
    const selected=words.filter(token=>token.sourceEnd>edit.sourceStart&&token.sourceStart<edit.sourceEnd);
    let covered=edit.sourceStart;
    for(const token of selected) {
      if(token.sourceStart!==covered||token.sourceEnd>edit.sourceEnd)throw new Error('Vùng sửa phải gồm các token nguồn nguyên vẹn.');
      covered=token.sourceEnd;
    }
    if(covered!==edit.sourceEnd)throw new Error('Vùng sửa phải gồm các token nguồn nguyên vẹn.');
    previousEnd=edit.sourceEnd;
  }
  const result:Token[]=[];
  let editIndex=0,inserted=false;
  for(const token of tokens) {
    while(editIndex<sorted.length&&token.sourceStart>=sorted[editIndex].sourceEnd){editIndex++;inserted=false;}
    const edit=sorted[editIndex];
    if(!edit||token.sourceEnd<=edit.sourceStart){result.push(token);continue;}
    // Decorations at either outer edge belong outside the replacement.
    if(token.sourceStart===token.sourceEnd&&token.sourceStart===edit.sourceStart){result.push(token);continue;}
    if(!inserted){
      // The reference converter attaches presentation whitespace to the next
      // source token. Keep that prefix when replacing a later occurrence so a
      // range edit cannot join two sentences or paragraphs together.
      const presentationPrefix=token.targetText.match(/^\s+/u)?.[0]??'';
      result.push({sourceStart:edit.sourceStart,sourceEnd:edit.sourceEnd,source:source.slice(edit.sourceStart,edit.sourceEnd),targetText:presentationPrefix+edit.value,type:'original',meanings:[edit.value],hanviet:''});inserted=true;
    }
  }
  return result;
}

/** Keep independent temporary edits visible when dictionary changes invalidate one range. */
export function applyCompatibleReaderWordEdits(source:string,tokens:Token[],edits:ReaderWordEdit[]) {
  let result=tokens.slice(),previousEnd=-1;
  const accepted:ReaderWordEdit[]=[],rejected:ReaderWordEdit[]=[];
  for(const edit of edits.slice().sort((a,b)=>a.sourceStart-b.sourceStart)) {
    if(edit.sourceStart<previousEnd){rejected.push(edit);continue;}
    try{result=applyReaderWordEdits(source,result,[edit]);previousEnd=edit.sourceEnd;accepted.push(edit);}
    catch{rejected.push(edit);}
  }
  return {tokens:result,accepted,rejected};
}
