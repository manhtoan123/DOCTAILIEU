import {parseEntry,type DictKind} from '../../../core/domain';
import {referenceConvert,normalizeKey} from './reference-convert';
import {nameSourceKey,parseNameValue,NAME_IMAGE_LIMIT,type NameImage} from './name-images';
export interface Token {sourceStart:number;sourceEnd:number;source:string;targetText:string;type:string;meanings:string[];hanviet:string;nameImage?:NameImage}
export interface ConvertOptions {mode?:'vietphrase'|'hanviet';multipleMeanings?:boolean;standardizePunctuation?:boolean;capitalize?:boolean;reference?:boolean}
export type ConvertBudget=(units:number)=>void;
export const punctuationMap=new Map<string,string>([
  ['。','.'],['、',','],['．','.'],['，',','],['：',':'],['；',';'],['？','?'],['！','!'],['～','~'],
  ['“','“'],['”','”'],['＂','"'],['＇',"'"],['«','«'],['»','»'],['『','“'],['』','”'],['「','“'],['」','”'],
  ['《','«'],['》','»'],['〈','<'],['〉','>'],['（','('],['）',')'],['‘',"‘"],['’',"’"],['【','['],['】',']'],
  ['〖','['],['〗',']'],['〔','['],['〕',']'],['——','—'],['—','—'],['……','...'],['…','...'],['•','·'],['·','·'],
  ['＃','#'],['＄','$'],['％','%'],['＆','&'],['＋','+'],['＝','='],['＠','@']
]);
class Index {
  values=new Map<string,string>(); max=new Map<string,number>();
  private normalizedOverrides=new Map<string,string>();
  add(k:string,v:string) {if(k.length>256)return;this.values.set(k,v);this.max.set(k[0],Math.max(this.max.get(k[0])||0,k.length));const normalized=normalizeKey(k);if(normalized!==k||this.normalizedOverrides.has(normalized))this.normalizedOverrides.set(normalized,v);this.max.set(normalized[0],Math.max(this.max.get(normalized[0])||0,normalized.length));}
  get(key:string,normalized=false){return normalized?(this.normalizedOverrides.get(key)??this.values.get(key)):this.values.get(key);}
  match(text:string,at:number,normalized=false):[string,string]|undefined {
    for(let length=Math.min(this.max.get(text[at])||0,text.length-at);length>0;length--){const k=text.slice(at,at+length);const v=this.get(k,normalized);if(v!==undefined)return[k,v];}
  }
}
export const meanings=(value:string)=>parseNameValue(value).label.split(/[\/;]/).map(s=>s.trim()).filter(Boolean);
export function boundedSuggestions(sets:string[][],limit=100):string[] {
  if(!sets.length || sets.length>7)return[];let result=[''];
  for(const set of sets) {const next:string[]=[];outer:for(const prefix of result)for(const item of set){next.push(`${prefix} ${item}`.trim());if(next.length>=limit)break outer;}result=next;}
  return [...new Set(result)].slice(0,limit);
}
interface RuleItem {key:string;before:string;after:string;value:string}
export class LanguageEngine {
  indexes:Record<DictKind,Index>={vp:new Index(),names:new Index(),names2:new Index(),hanviet:new Index(),rules:new Index(),chapter:new Index(),number:new Index(),pronouns:new Index(),blacklist:new Index(),english:new Index()};
  referenceRules=new Map<string,string>();
  private normalizedReferenceRules=new Map<string,string>();
  private rulesByPrefix=new Map<string,RuleItem[]>();
  private rulesByAfter=new Map<string,RuleItem[]>();
  add(kind:DictKind,line:string):boolean {
    const entry=kind==='blacklist'?[line.trim().split('=')[0],'']:parseEntry(line);if(!entry||!entry[0]||entry[0].startsWith('#'))return false;const[k,v]=entry;
    if(k.length>256||v.length>65536)return false;
    if(kind==='rules') {
      if(!k.includes('{0}'))return false;
      const parts=k.split('{0}');if(parts.length!==2 || (!parts[0] && !parts[1]))return false;
      this.referenceRules.set(k,v);this.normalizedReferenceRules.set(normalizeKey(k),v);
      const rule:RuleItem={key:k,before:parts[0],after:parts[1],value:v};
      if(parts[0]) {
        const bucket=this.rulesByPrefix.get(parts[0][0])||[];
        const existing=bucket.find(r=>r.before===parts[0]&&r.after===parts[1]);
        if(existing)existing.value=v;else {bucket.push(rule);bucket.sort((a,b)=>b.key.length-a.key.length);}
        this.rulesByPrefix.set(parts[0][0],bucket);
      } else {
        const bucket=this.rulesByAfter.get(parts[1][0])||[];
        const existing=bucket.find(r=>r.after===parts[1]);
        if(existing)existing.value=v;else {bucket.push(rule);bucket.sort((a,b)=>b.after.length-a.after.length);}
        this.rulesByAfter.set(parts[1][0],bucket);
      }
    }else this.indexes[kind].add(kind==='names'||kind==='names2'?nameSourceKey(k):k,v);return true;
  }
  lookup(source:string) {const english=meanings(this.indexes.english.values.get(source)||''),names=[...new Set([...meanings(this.indexes.names.values.get(source)||''),...meanings(this.indexes.names2.values.get(source)||'')])];return {meanings:meanings(this.indexes.vp.values.get(source)||''),hanviet:[...source].map(c=>meanings(this.indexes.hanviet.values.get(c)||c)[0]).join(' '),...(english.length?{english}:{}),...(names.length?{names}: {})};}
  convert(text:string,names:{key:string;value:string}[],options:ConvertOptions={},budget?:ConvertBudget):Token[] {
    if(options.reference&&options.mode!=='hanviet')return referenceConvert(text,names,this.indexes,options.standardizePunctuation===false?this.referenceRules:this.normalizedReferenceRules,options,budget);
    const own=new Index();for(const e of names)own.add(nameSourceKey(e.key),e.value);
    const nameLayers:[string,Index][]=[['name',own],['names2',this.indexes.names2],['names',this.indexes.names]];
    const result:Token[]=[];let at=0,imageCount=0;let capitalizeNext=true;
    const CLOSING_PUNCT=new Set([')',']','}','”','’','»','>',',','.','!','?',';',':']);
    const OPENING_PUNCT=new Set(['(','[','{','“','‘','«','<']);
    while(at<text.length) {
      let found:{key:string;value:string;type:string}|undefined;
      for(const[type,index]of options.mode==='hanviet'?[]:nameLayers){
        const match=index.match(text,at);
        if(match&&(!found||match[0].length>found.key.length))found={key:match[0],value:match[1],type};
      }
      if(!found&&options.mode!=='hanviet') {
        const prefixRules=this.rulesByPrefix.get(text[at])||[];
        for(let r=0;r<Math.min(prefixRules.length,256);r++) {
          const rule=prefixRules[r];if(!text.startsWith(rule.before,at))continue;
          const start=at+rule.before.length;
          if(rule.after) {
            const end=text.indexOf(rule.after,start);
            if(end<=start || end-start>24)continue;const capture=text.slice(start,end);
            if(!/^\p{Script=Han}+$/u.test(capture))continue;
            let protectedName=false;
            for(let offset=0;offset<capture.length;){if(own.match(capture,offset)||this.indexes.names.match(capture,offset)||this.indexes.names2.match(capture,offset)){protectedName=true;break;}offset+=String.fromCodePoint(capture.codePointAt(offset)!).length;}
            if(protectedName)continue;
            const value=this.indexes.vp.values.get(capture)||this.lookup(capture).hanviet;
            found={key:text.slice(at,end+rule.after.length),value:rule.value.replace('{0}',meanings(value)[0]||capture),type:'rule'};break;
          } else {
            let maxL=0;while(start+maxL<text.length&&maxL<12&&/^\p{Script=Han}$/u.test(text[start+maxL]))maxL++;
            for(let len=maxL;len>0;len--){
              const capture=text.slice(start,start+len);let protectedName=false;
              for(let offset=0;offset<capture.length;){if(own.match(capture,offset)||this.indexes.names.match(capture,offset)||this.indexes.names2.match(capture,offset)){protectedName=true;break;}offset+=String.fromCodePoint(capture.codePointAt(offset)!).length;}
              if(!protectedName&&(this.indexes.vp.values.has(capture)||len<=4)){
                const value=this.indexes.vp.values.get(capture)||this.lookup(capture).hanviet;
                found={key:text.slice(at,start+len),value:rule.value.replace('{0}',meanings(value)[0]||capture),type:'rule'};break;
              }
            }
            if(found)break;
          }
        }
        if(!found) {
          let maxL=0;while(at+maxL<text.length&&maxL<12&&/^\p{Script=Han}$/u.test(text[at+maxL]))maxL++;
          for(let len=maxL;len>0;len--){
            const nextChar=text[at+len];if(!nextChar)continue;
            const afterRules=this.rulesByAfter.get(nextChar)||[];
            for(let r=0;r<Math.min(afterRules.length,128);r++){
              const rule=afterRules[r];if(!text.startsWith(rule.after,at+len))continue;
              const capture=text.slice(at,at+len);let protectedName=false;
              for(let offset=0;offset<capture.length;){if(own.match(capture,offset)||this.indexes.names.match(capture,offset)||this.indexes.names2.match(capture,offset)){protectedName=true;break;}offset+=String.fromCodePoint(capture.codePointAt(offset)!).length;}
              if(protectedName)continue;
              const value=this.indexes.vp.values.get(capture)||this.lookup(capture).hanviet;
              found={key:text.slice(at,at+len+rule.after.length),value:rule.value.replace('{0}',meanings(value)[0]||capture),type:'rule'};break;
            }
            if(found)break;
          }
        }
      }
      if(!found&&options.mode!=='hanviet'){
        const match=this.indexes.vp.match(text,at);
        if(match)found={key:match[0],value:match[1],type:'vp'};
      }
      if(!found&&options.standardizePunctuation) {
        if(text.startsWith('——',at))found={key:'——',value:'—',type:'original'};
        else if(text.startsWith('……',at))found={key:'……',value:'...',type:'original'};
        else if(punctuationMap.has(text[at]))found={key:text[at],value:punctuationMap.get(text[at])!,type:'original'};
      }
      if(!found) {
        const c=String.fromCodePoint(text.codePointAt(at)!);
        const hv=this.indexes.hanviet.values.get(c);
        if(hv)found={key:c,value:hv,type:'hanviet'};
        else {found={key:c,value:c,type:'original'};}
      }
      const choices=meanings(found.value);let target=(options.multipleMeanings?choices.join('/'):choices[0])||found.key;
      if(options.capitalize) {
        if(capitalizeNext&&/^[\p{L}]/u.test(target)){target=target[0].toUpperCase()+target.slice(1);capitalizeNext=false;}
        if(/[.!?]$/.test(target.trim())||found.key==='\n'||found.value==='\n')capitalizeNext=true;
        else if(target.trim()==='“'||target.trim()==='"')capitalizeNext=true;
      }
      const previous=result[result.length-1];
      if(options.standardizePunctuation||options.capitalize) {
        if(previous) {
          if(target.startsWith('\n') || previous.targetText.endsWith('\n')) {/* newline */}
          else if(CLOSING_PUNCT.has(target.trim())) {/* attach closing punct without space */}
          else if(OPENING_PUNCT.has(previous.targetText.trim())) {/* no space after opening punct */}
          else if(CLOSING_PUNCT.has(previous.targetText.trim())||OPENING_PUNCT.has(target.trim())) target=' '+target;
          else if(/[\p{L}\p{N}]$/u.test(previous.targetText)&&/^[\p{L}\p{N}]/u.test(target)) target=' '+target;
        }
      } else {
        if(previous && /[\p{L}\p{N}]$/u.test(previous.targetText) && /^[\p{L}\p{N}]/u.test(target) && (found.type!=='original'||previous.type!=='original'))target=' '+target;
      }
      const image=found.type.startsWith('name')?parseNameValue(found.value).image:undefined;
      budget?.(160+6*(found.key.length+found.value.length+target.length)+choices.length*32);
      result.push({sourceStart:at,sourceEnd:at+found.key.length,source:found.key,targetText:target,type:found.type,meanings:choices,hanviet:'',...(image&&imageCount++<NAME_IMAGE_LIMIT?{nameImage:image}:{})});at+=found.key.length;
    }
    return result;
  }
}
