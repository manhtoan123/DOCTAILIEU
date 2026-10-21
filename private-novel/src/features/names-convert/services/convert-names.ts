import {convertTombKey} from '../../sync-cloud/services/shared-name-intents';
import {db} from '../../../core/db';

export type ConvertName={key:string;value:string};
export const CONVERT_NAMES_KEY='convert-name-list';
export const CONVERT_NAMES_LIMIT=64000;
const ENTRY_LIMIT=4096;

function validEntry(key:string,value:string,line:number) {
  if(!key||!value||/[\r\n=]/.test(key)||/[\r\n]/.test(value))throw new Error(`Name List: dòng ${line} cần dạng chữ Trung=tên Việt trên một dòng.`);
  if(key.length>256||value.length>2048)throw new Error(`Name List: dòng ${line} vượt giới hạn khóa 256 hoặc nghĩa 2.048 ký tự.`);
}
export function formatConvertNames(names:ConvertName[]) {return names.map(n=>`${n.key}=${n.value}`).join('\n');}
function checkSize(names:ConvertName[]) {
  if(names.length>ENTRY_LIMIT||formatConvertNames(names).length>CONVERT_NAMES_LIMIT)throw new Error('Name List vượt 4.096 mục hoặc 64.000 ký tự UTF-16; không lưu một phần.');
}
export function parseConvertNames(text:string):ConvertName[] {
  if(text.length>CONVERT_NAMES_LIMIT)throw new Error('Name List vượt 64.000 ký tự UTF-16; không lưu một phần.');
  const names=new Map<string,string>();
  for(const [index,line] of text.replace(/^\uFEFF/,'').split(/\r\n?|\n/).entries()) {
    const trimmed=line.trim();if(!trimmed||trimmed.startsWith('#'))continue;
    const at=trimmed.indexOf('=');
    if(at<1)throw new Error(`Name List: dòng ${index+1} cần dạng chữ Trung=tên Việt.`);
    const key=trimmed.slice(0,at).trim(),value=trimmed.slice(at+1).trim();validEntry(key,value,index+1);names.set(key,value);
  }
  const result=[...names].map(([key,value])=>({key,value}));checkSize(result);return result;
}
export function validateConvertNames(value:unknown):ConvertName[] {
  if(!Array.isArray(value))throw new Error('Name List đã lưu không hợp lệ; hãy xuất bản sao lưu trước khi sửa dữ liệu.');
  const names:ConvertName[]=[],keys=new Set<string>();
  for(const [index,entry] of value.entries()) {
    if(!entry||typeof entry!=='object'||typeof entry.key!=='string'||typeof entry.value!=='string')throw new Error('Name List đã lưu có mục không hợp lệ; giữ nguyên dữ liệu.');
    validEntry(entry.key,entry.value,index+1);
    if(entry.key!==entry.key.trim()||entry.value!==entry.value.trim()||keys.has(entry.key))throw new Error('Name List đã lưu có khóa trùng hoặc khoảng trắng không hợp lệ; giữ nguyên dữ liệu.');
    keys.add(entry.key);names.push({key:entry.key,value:entry.value});
  }
  checkSize(names);return names;
}
export async function readConvertNames():Promise<ConvertName[]> {
  const row=await db.settings.get(CONVERT_NAMES_KEY);
  return row?validateConvertNames(row.value):[];
}
/** Merge only: omissions and invalid input never delete existing entries. */
export async function saveConvertNames(text:string):Promise<number> {
  const edits=parseConvertNames(text);
  return db.transaction('rw',db.settings,async()=>{
    const names=new Map((await readConvertNames()).map(n=>[n.key,n.value]));
    for(const entry of edits){names.set(entry.key,entry.value);await db.settings.delete(convertTombKey(entry.key));}
    const merged=[...names].map(([key,value])=>({key,value}));checkSize(merged);
    await db.settings.put({key:CONVERT_NAMES_KEY,value:merged});return merged.length;
  });
}
export async function deleteConvertName(key:string):Promise<void> {
  if(!key.trim()||key!==key.trim()||/[\r\n=]/.test(key))throw new Error('Khóa Name cần hợp lệ để xóa.');
  await db.transaction('rw',db.settings,async()=>{
    const names=await readConvertNames();await db.settings.put({key:CONVERT_NAMES_KEY,value:names.filter(n=>n.key!==key)});await db.settings.put({key:convertTombKey(key),value:{kind:'convert-name',key,value:null}});
  });
}
/** Move one Unicode code point, keeping the engine's raw UTF-16 offsets. */
export function expandConvertSelection(text:string,start:number,end:number,direction:'left'|'right') {
  let nextStart=start,nextEnd=end;
  if(direction==='left'&&start>0){nextStart--;if(nextStart>0&&/[\uDC00-\uDFFF]/.test(text[nextStart])&&/[\uD800-\uDBFF]/.test(text[nextStart-1]))nextStart--;}
  if(direction==='right'&&end<text.length){nextEnd++;if(/[\uD800-\uDBFF]/.test(text[end])&&/[\uDC00-\uDFFF]/.test(text[nextEnd]||''))nextEnd++;}
  return {sourceStart:nextStart,sourceEnd:nextEnd,source:text.slice(nextStart,nextEnd)};
}
