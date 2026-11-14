import {convertTombKey} from '../../sync-cloud/services/shared-name-intents';
import {db} from '../../../core/db';
import {canonicalNameKey,formatNameList,nameKeyResolver} from './name-format';

export type ConvertName={key:string;value:string};
export const CONVERT_NAMES_KEY='convert-name-list';
const AI_COMMON_KEYS='convert-name-list:ai-keys';
export const CONVERT_NAMES_LIMIT=64000;
const ENTRY_LIMIT=4096;

function validEntry(key:string,value:string,line:number) {
  if(!key||/[\r\n=]/.test(key)||/[\r\n]/.test(value))throw new Error(`Name List: dòng ${line} cần dạng chữ Trung=tên Việt trên một dòng.`);
  if(key.length>256||value.length>2048)throw new Error(`Name List: dòng ${line} vượt giới hạn khóa 256 hoặc nghĩa 2.048 ký tự.`);
}
export function formatConvertNames(names:ConvertName[]) {return formatNameList(names);}
function checkSize(names:ConvertName[]) {
  // Read existing stores against their original limit, without migrating keys or
  // rejecting old data solely because display now includes a marker per row.
  if(names.length>ENTRY_LIMIT||names.map(n=>`${n.key}=${n.value}`).join('\n').length>CONVERT_NAMES_LIMIT)throw new Error('Name List vượt 4.096 mục hoặc 64.000 ký tự UTF-16; không lưu một phần.');
}
export function parseConvertNames(text:string):ConvertName[] {
  if(text.length>CONVERT_NAMES_LIMIT)throw new Error('Name List vượt 64.000 ký tự UTF-16; không lưu một phần.');
  const names=new Map<string,string>();
  for(const [index,line] of text.replace(/^\uFEFF/,'').split(/\r\n?|\n/).entries()) {
    const trimmed=line.trim();if(!trimmed||trimmed.startsWith('#'))continue;
    const at=trimmed.indexOf('=');
    if(at<1)throw new Error(`Name List: dòng ${index+1} cần dạng chữ Trung=tên Việt.`);
    const key=canonicalNameKey(trimmed.slice(0,at)),value=trimmed.slice(at+1).trim();validEntry(key,value,index+1);names.set(key,value);
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
async function readAiCommonKeys():Promise<Set<string>> {
  const value=(await db.settings.get(AI_COMMON_KEYS))?.value;
  return new Set(Array.isArray(value)?value.filter((key):key is string=>typeof key==='string'):[]);
}
export async function readAiCommonNames():Promise<ConvertName[]> {
  return db.transaction('r',db.settings,async()=>{
    const keys=await readAiCommonKeys();
    return keys.size?(await readConvertNames()).filter(row=>keys.has(row.key)&&row.value):[];
  });
}
/** Merge only: omissions and invalid input never delete existing entries. */
export async function saveConvertNames(text:string,options?:{forAi:true}):Promise<number> {
  const edits=parseConvertNames(text);
  return db.transaction('rw',db.settings,async()=>{
    const rows=await readConvertNames(),resolveKey=nameKeyResolver(rows),names=new Map(rows.map(n=>[n.key,n.value]));
    const aiKeys=options?.forAi?await readAiCommonKeys():undefined;
    for(const entry of edits){const key=resolveKey(entry.key);names.set(key,entry.value);aiKeys?.add(key);await db.settings.delete(convertTombKey(key));}
    const merged=[...names].map(([key,value])=>({key,value}));checkSize(merged);
    await db.settings.put({key:CONVERT_NAMES_KEY,value:merged});
    if(aiKeys)await db.settings.put({key:AI_COMMON_KEYS,value:merged.filter(row=>aiKeys.has(row.key)).map(row=>row.key)});
    return merged.length;
  });
}
export async function deleteConvertName(key:string):Promise<void> {
  if(!key.trim()||key!==key.trim()||/[\r\n=]/.test(key))throw new Error('Khóa Name cần hợp lệ để xóa.');
  await db.transaction('rw',db.settings,async()=>{
    const names=await readConvertNames(),aiKeys=await readAiCommonKeys();
    await db.settings.put({key:CONVERT_NAMES_KEY,value:names.filter(n=>n.key!==key)});
    await db.settings.put({key:convertTombKey(key),value:{kind:'convert-name',key,value:null}});
    if(aiKeys.delete(key))await db.settings.put({key:AI_COMMON_KEYS,value:[...aiKeys]});
  });
}
/** Move one Unicode code point, keeping the engine's raw UTF-16 offsets. */
export function expandConvertSelection(text:string,start:number,end:number,direction:'left'|'right') {
  let nextStart=start,nextEnd=end;
  if(direction==='left'&&start>0){nextStart--;if(nextStart>0&&/[\uDC00-\uDFFF]/.test(text[nextStart])&&/[\uD800-\uDBFF]/.test(text[nextStart-1]))nextStart--;}
  if(direction==='right'&&end<text.length){nextEnd++;if(/[\uD800-\uDBFF]/.test(text[end])&&/[\uDC00-\uDFFF]/.test(text[nextEnd]||''))nextEnd++;}
  return {sourceStart:nextStart,sourceEnd:nextEnd,source:text.slice(nextStart,nextEnd)};
}
