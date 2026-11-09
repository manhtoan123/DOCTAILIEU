import {parseEntry} from '../../../core/domain';

export type NamePair={key:string;value:string};
/** `$` is the Name-list marker, not part of a newly stored source key. */
export const canonicalNameKey=(key:string)=>key.trim().replace(/^\$+/,'').trim();
export const displayNameKey=(key:string)=>'$'+canonicalNameKey(key);
export const formatNameEntry=(key:string,value:string)=>`${displayNameKey(key)}=${value}`;
export function parseNameEntry(line:string):[string,string]|null{
 const entry=parseEntry(line);if(!entry)return null;
 const key=canonicalNameKey(entry[0]);return key&&!key.startsWith('#')?[key,entry[1]]:null;
}
export function formatNameList(rows:readonly NamePair[]){
 return [...rows].sort((a,b)=>canonicalNameKey(b.key).length-canonicalNameKey(a.key).length||canonicalNameKey(a.key).localeCompare(canonicalNameKey(b.key))).map(row=>formatNameEntry(row.key,row.value)).join('\n');
}
/** Preserve the actual legacy key. Ambiguous aliases require an explicit deletion,
 * never a silent merge or overwrite through their identical display spelling.
 * Even equal old values must be resolved explicitly before an edit can diverge. */
export function nameKeyResolver(rows:readonly NamePair[]){
 const index=new Map<string,Set<string>>();
 for(const row of rows){const key=canonicalNameKey(row.key),keys=index.get(key)??new Set<string>();keys.add(row.key);index.set(key,keys);}
 return (key:string)=>{
  const canonical=canonicalNameKey(key),keys=index.get(canonical);
  if(keys&&keys.size>1)throw Error(`Name ${displayNameKey(canonical)} có khóa cũ trùng hoặc khác nghĩa; hãy xóa đúng tên cần bỏ trước khi lưu.`);
  return keys?.values().next().value??canonical;
 };
}
export function resolveNameKey(key:string,rows:readonly NamePair[]){return nameKeyResolver(rows)(key);}
/** Format valid draft entries on import/export, retain comments/invalid lines. */
export function formatNameDraft(text:string){
 const valid:NamePair[]=[],other:string[]=[];
 for(const line of text.split(/\r?\n/)){const entry=parseNameEntry(line);if(entry)valid.push({key:entry[0],value:entry[1]});else if(line.trim())other.push(line);}
 return [formatNameList(valid),...other].filter(Boolean).join('\n');
}
export function removeNameDraftKey(text:string,key:string,rows:readonly NamePair[]=[]){
 const canonical=canonicalNameKey(key),aliases=rows.filter(row=>canonicalNameKey(row.key)===canonical),target=aliases.find(row=>row.key===key);
 const ambiguous=new Set(aliases.map(row=>row.key)).size>1;let removed=false;
 return text.split(/\r?\n/).filter(line=>{
  const entry=parseNameEntry(line);if(!entry||entry[0]!==canonical)return true;
  if(!ambiguous)return false;
  if(!removed&&target&&entry[1]===target.value){removed=true;return false;}
  return true;
 }).join('\n');
}
