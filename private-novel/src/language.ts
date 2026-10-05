import {parseEntry,type DictKind} from './domain';
export interface Token {sourceStart:number;sourceEnd:number;source:string;targetText:string;type:string;meanings:string[];hanviet:string}
class Index {
  values=new Map<string,string>(); max=new Map<string,number>();
  add(k:string,v:string) {if(k.length>256)return;this.values.set(k,v);this.max.set(k[0],Math.max(this.max.get(k[0])||0,k.length));}
  match(text:string,at:number):[string,string]|undefined {
    for(let length=Math.min(this.max.get(text[at])||0,text.length-at);length>0;length--){const k=text.slice(at,at+length);const v=this.values.get(k);if(v!==undefined)return[k,v];}
  }
}
export const meanings=(value:string)=>value.split(/[\/;]/).map(s=>s.trim()).filter(Boolean);
export function boundedSuggestions(sets:string[][],limit=100):string[] {
  if(!sets.length || sets.length>7)return[];let result=[''];
  for(const set of sets) {const next:string[]=[];outer:for(const prefix of result)for(const item of set){next.push(`${prefix} ${item}`.trim());if(next.length>=limit)break outer;}result=next;}
  return [...new Set(result)].slice(0,limit);
}
export class LanguageEngine {
  indexes:Record<DictKind,Index>={vp:new Index(),names:new Index(),names2:new Index(),hanviet:new Index(),rules:new Index()};
  private rules=new Map<string,{before:string;after:string;value:string}[]>();
  add(kind:DictKind,line:string):boolean {
    const entry=parseEntry(line);if(!entry)return false;const[k,v]=entry;
    if(kind==='rules') {
      const parts=k.split('{0}');if(parts.length!==2 || !parts[0] || !parts[1])return false;
      const bucket=this.rules.get(parts[0][0])||[];bucket.push({before:parts[0],after:parts[1],value:v});this.rules.set(parts[0][0],bucket);
    }else this.indexes[kind].add(k,v);return true;
  }
  lookup(source:string) {return {meanings:meanings(this.indexes.vp.values.get(source)||''),hanviet:[...source].map(c=>meanings(this.indexes.hanviet.values.get(c)||c)[0]).join(' ')};}
  convert(text:string,names:{key:string;value:string}[]):Token[] {
    const own=new Index();for(const e of names)own.add(e.key,e.value);
    const nameLayers:[string,Index][]=[['name',own],['names2',this.indexes.names2],['names',this.indexes.names]];
    const result:Token[]=[];let at=0;
    while(at<text.length) {
      let found:{key:string;value:string;type:string}|undefined;
      // Compare each index's longest match without merging the dictionaries.
      // Layer order breaks equal-length ties: book names, Names2, then Names.
      for(const[type,index]of nameLayers){
        const match=index.match(text,at);
        if(match&&(!found||match[0].length>found.key.length))found={key:match[0],value:match[1],type};
      }
      if(!found){
        const match=this.indexes.vp.match(text,at);
        if(match)found={key:match[0],value:match[1],type:'vp'};
      }
      if(!found) {
        // Rules are bounded and only match a single Han capture. No arbitrary regex or recursive products.
        const rules=this.rules.get(text[at])||[];
        for(let r=0;r<Math.min(rules.length,256);r++) {
          const rule=rules[r];if(!text.startsWith(rule.before,at))continue;
          const start=at+rule.before.length;const end=text.indexOf(rule.after,start);
          if(end<=start || end-start>24)continue;const capture=text.slice(start,end);
          if(!/^\p{Script=Han}+$/u.test(capture))continue;
          // Do not consume a protected name inside a rule.
          if([...capture].some((_,offset)=>own.match(capture,offset)||this.indexes.names.match(capture,offset)||this.indexes.names2.match(capture,offset)))continue;
          const value=this.indexes.vp.values.get(capture)||this.lookup(capture).hanviet;
          found={key:text.slice(at,end+rule.after.length),value:rule.value.replace('{0}',meanings(value)[0]||capture),type:'rule'};break;
        }
      }
      if(!found) {
        const c=String.fromCodePoint(text.codePointAt(at)!);
        const hv=this.indexes.hanviet.values.get(c);
        if(hv)found={key:c,value:hv,type:'hanviet'};
        else {found={key:c,value:c,type:'original'};}
      }
      const choices=meanings(found.value);let target=choices[0]||found.key;
      const previous=result[result.length-1];
      if(previous && /[\p{L}\p{N}]$/u.test(previous.targetText) && /^[\p{L}\p{N}]/u.test(target) && (found.type!=='original'||previous.type!=='original'))target=' '+target;
      result.push({sourceStart:at,sourceEnd:at+found.key.length,source:found.key,targetText:target,type:found.type,meanings:choices,hanviet:''});at+=found.key.length;
    }
    return result;
  }
}
