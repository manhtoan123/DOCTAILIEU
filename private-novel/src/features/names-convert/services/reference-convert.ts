import type {ConvertBudget,ConvertOptions,Token} from './language';
import type {DictKind} from '../../../core/domain';
import {nameSourceKey,parseNameValue,NAME_IMAGE_LIMIT,type NameImage} from './name-images';

// Reimplemented from the observed ZXC pipeline; no upstream code/data is bundled.
type DictionaryIndex={values:Map<string,string>|{get(key:string):string|undefined;has(key:string):boolean};get(key:string,normalized?:boolean):string|undefined;match(text:string,at:number,normalized?:boolean):[string,string]|undefined};
type Indexes=Record<DictKind,DictionaryIndex>;
type Mapped={text:string;starts:number[];ends:number[]};
const punctuation=new Map<string,string>([
 ['。','.'],['、',','],['．','.'],['，',','],['：',':'],['；',';'],['？','?'],['！','!'],['～','~'],
 ['＂','"'],['＇',"'"],['（','('],['）',')'],['【','['],['】',']'],['〖','['],['〗',']'],['〔','['],['〕',']'],
 ['——','—'],['……','...'],['…','...'],['•','·'],['＃','#'],['＄','$'],['％','%'],['＆','&'],['＋','+'],['＝','='],['＠','@']
]);
const punctuationChars=new Set([...punctuation.keys(),...punctuation.values(),'“','”','‘','’','«','»','『','』','「','」','《','》','〈','〉',...`.,:;?!~"'()[]{}<>*#$%^&+=@-_\x60|/\\`].flatMap(s=>[...s]));
const openings=new Set(['(','[','{','“','‘','«','<','【','〖','〔','《','〈']);
const closings=new Set([')',']','}','”','’','»','>',',','.','!','?',';',':','。','：','；','，','、','！','？','……','～','—']);
const separators=new Set([...openings,...closings,'"',"'"]);
const splitMeanings=(s:string)=>parseNameValue(s).label.split(/[;/]/).map(x=>x.trim()).filter(Boolean);
const first=(s:string)=>splitMeanings(s)[0]??'';

function normalize(source:string,enabled:boolean):Mapped {
 const result:Mapped={text:'',starts:[],ends:[]};
 for(let at=0;at<source.length;){
  const start=at;let key=String.fromCodePoint(source.codePointAt(at)!);
  if(source.startsWith('\r\n',at))key='\r\n';
  else if(enabled&&(source.startsWith('——',at)||source.startsWith('……',at)))key=source.slice(at,at+2);
  at+=key.length;
  if(enabled&&(key===' '||key==='\t')){
   while(source[at]===' '||source[at]==='\t')at++;
   if(!punctuationChars.has(source[start-1])&&!punctuationChars.has(source[at])){
    result.text+=source.slice(start,at);
    for(let i=start;i<at;i++){result.starts.push(i);result.ends.push(i+1);}
   }
   continue;
  }
  const value=/^\r\n?$/.test(key)?'\n':enabled?(punctuation.get(key)??key):key;
  result.text+=value;for(let i=0;i<value.length;i++){result.starts.push(start);result.ends.push(at);}
 }
 return result;
}
export function normalizeKey(key:string){return normalize(key,true).text;}
function replaceRanges(input:Mapped,replacements:{start:number;end:number;text:string}[]):Mapped {
 if(!replacements.length)return input;
 const length=replacements.reduce((size,row)=>size+row.text.length-(row.end-row.start),input.text.length);
 if(length>2000000)throw new Error('Kết quả Luật Nhân quá lớn; hãy chia đoạn nhỏ hơn.');
 const output:Mapped={text:'',starts:[],ends:[]};let at=0;
 for(const replacement of replacements){
  output.text+=input.text.slice(at,replacement.start);
  for(let i=at;i<replacement.start;i++){output.starts.push(input.starts[i]);output.ends.push(input.ends[i]);}
  output.text+=replacement.text;
  for(let i=0;i<replacement.text.length;i++){output.starts.push(input.starts[replacement.start]);output.ends.push(input.ends[replacement.end-1]);}
  at=replacement.end;
 }
 output.text+=input.text.slice(at);
 for(let i=at;i<input.text.length;i++){output.starts.push(input.starts[i]);output.ends.push(input.ends[i]);}
 return output;
}
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function omitUntranslatedTrailingDe(source:string,target:string){
 if(source!==target||!source.endsWith('的'))return target;
 const previous=Array.from(source.slice(0,-1)).at(-1);
 // A literal dictionary echo after a Latin name or a closing quote/bracket is
 // residue, while Han-to-Han possessives such as 老人的 remain untouched.
 return previous&&(/[\p{Script=Latin}\p{P}]$/u.test(previous))?target.slice(0,-1):target;
}

export function referenceConvert(source:string,names:{key:string;value:string}[],indexes:Indexes,rules:Map<string,string>,options:ConvertOptions,budget?:ConvertBudget):Token[]{
 const normalized=options.standardizePunctuation!==false;
 const capitalize=options.capitalize!==false;
 let mapped=normalize(source,normalized);
 const combined=new Map<string,{value:string;type:string;user:boolean;order:number}>();let order=0;
 for(const kind of ['names','names2'] as const){const values=indexes[kind].values;if(values instanceof Map)for(const[rawKey,rawValue]of values){const key=normalized?normalizeKey(rawKey):rawKey,value=indexes[kind].get(key,normalized)??rawValue;const old=combined.get(key);combined.set(key,{value,type:kind,user:false,order:old?.order??order++});}}
 for(const {key,value}of names){const sourceKey=nameSourceKey(key),normalizedKey=normalized?normalizeKey(sourceKey):sourceKey;const old=combined.get(normalizedKey);combined.set(normalizedKey,{value,type:'name',user:true,order:old?.order??order++});}
 // Gather only keys present in the paragraph, then protect globally longest names.
 // This also protects names that start inside a longer ordinary phrase or rule.
 const nameLengths=new Map<string,Set<number>>();
 for(const key of combined.keys()){const lengths=nameLengths.get(key[0])??new Set<number>();lengths.add(key.length);nameLengths.set(key[0],lengths);}
 const candidates:{start:number;end:number;key:string}[]=[];
 for(let at=0;at<mapped.text.length;at++){
  const lengths=nameLengths.get(mapped.text[at]);if(!lengths)continue;
  budget?.(lengths.size);
  for(const length of lengths){
   const end=at+length;
   if(end>mapped.text.length)continue;
   const key=mapped.text.slice(at,end);
   if(combined.has(key)){budget?.(64);candidates.push({start:at,end,key});}
  }
 }
 candidates.sort((a,b)=>b.key.length-a.key.length||Number(combined.get(b.key)!.user)-Number(combined.get(a.key)!.user)||combined.get(a.key)!.order-combined.get(b.key)!.order||a.start-b.start);
 const occupied=new Uint8Array(mapped.text.length);const selected:typeof candidates=[];
 for(const match of candidates){let overlap=false;for(let i=match.start;i<match.end;i++)if(occupied[i]){overlap=true;break;}if(overlap)continue;occupied.fill(1,match.start,match.end);selected.push(match);}
 let markerTail=0;
 for(let at=source.indexOf('\uE000');at!==-1;at=source.indexOf('\uE000',at)){
  const start=++at;
  while(source[at]==='\uE001')at++;
  markerTail=Math.max(markerTail,at-start+1);
 }
 const marker='\uE000'+'\uE001'.repeat(markerTail);
 budget?.(24*marker.length*selected.length);
 const protectedWords=new Map<string,{value:string;type:string;sourceKey:string}>();
 mapped=replaceRanges(mapped,selected.sort((a,b)=>a.start-b.start).map((match,i)=>{const id=`${marker}${i}\uE002`;const info=combined.get(match.key)!;protectedWords.set(id,{...info,sourceKey:match.key});return {...match,text:id};}));
 const priority:DictKind[]=['names2','names','vp','chapter','number','pronouns','hanviet','english','blacklist'];
 const exact=(key:string)=>{const own=combined.get(key);if(own)return first(own.value);for(const kind of priority){const value=indexes[kind].get(key,normalized);if(value!==undefined)return first(value);}return key;};
 for(const [key,value]of [...rules].sort((a,b)=>b[0].length-a[0].length)){
  budget?.(Math.ceil(mapped.text.length/16));
  const [before,after]=key.split('{0}');if(!mapped.text.includes(before)||!mapped.text.includes(after))continue;
  // The greedy capture can backtrack from multiple starts in one Han run.
  if(budget)for(const run of mapped.text.matchAll(/[\u4e00-\u9fa5]+/g))budget(run[0].length**2);
  const pattern=new RegExp(`${escape(before)}([\u4e00-\u9fa5]+)${escape(after)}`,'g');
  const replacements:{start:number;end:number;text:string}[]=[];
  for(const match of mapped.text.matchAll(pattern)){
   const text=value.replace('{0}',()=>exact(match[1]));
   budget?.(64+24*text.length);
   replacements.push({start:match.index!,end:match.index!+match[0].length,text});
  }
  mapped=replaceRanges(mapped,replacements);
 }
 const ordinary:DictKind[]=['vp','chapter','number','pronouns','hanviet','english','blacklist'];
 function matchAt(at:number){let result:{key:string;value:string;type:string}|undefined;for(const kind of ordinary){const match=indexes[kind].match(mapped.text,at,normalized);if(match&&(!result||match[0].length>result.key.length))result={key:match[0],value:match[1],type:kind};}return result;}
 const raw:Token[]=[];let at=0,imageCount=0;let last='';let lineStart=true;let sentenceStart=false;let doubleQuote=false;let singleQuote=false;
 while(at<mapped.text.length){
  const start=at;let key='';let target='';let type='original';let choices:string[]=[];let nameImage:NameImage|undefined;
  if(mapped.text.startsWith(marker,at)){
   const end=mapped.text.indexOf('\uE002',at)+1;key=mapped.text.slice(at,end);const item=protectedWords.get(key);
   if(item){target=item.value===""?"":first(item.value)||item.sourceKey;choices=splitMeanings(item.value);type=item.type;const image=parseNameValue(item.value).image;if(image&&imageCount++<NAME_IMAGE_LIMIT)nameImage=image;}
  }
  if(!key){const match=matchAt(at);if(match){key=match.key;choices=splitMeanings(match.value);type=match.type;target=type==='blacklist'?'':options.multipleMeanings?`(${choices.join('/')})`:choices[0]??'';}}
  if(!key){
   key=String.fromCodePoint(mapped.text.codePointAt(at)!);
   if(key!=='\n'&&!separators.has(key)){
    let end=at+key.length;
    while(end<mapped.text.length&&mapped.text[end]!=='\n'&&!separators.has(mapped.text[end])&&!mapped.text.startsWith(marker,end)&&!matchAt(end)){end+=String.fromCodePoint(mapped.text.codePointAt(end)!).length;}
    key=mapped.text.slice(at,end);
   }
   target=/^[\u4e00-\u9fa5]+$/.test(key)?'':key;type=target?'original':'untranslated';
  }
  at+=key.length;
  const isNewline=key==='\n';
  const quote=key==='"'||key==="'";const openingQuote=quote&&(key==='"'?!doubleQuote:!singleQuote);
  if(capitalize&&target.trim()){
   if(lineStart||sentenceStart){if(/^\d/.test(key.trim()))sentenceStart=false;else if(/\p{L}/u.test(target)){target=target.replace(/\p{L}/u,c=>c.toLocaleUpperCase('vi'));sentenceStart=false;}}
  }
  let space='';
  if(target&&!isNewline&&!lineStart&&!/\s$/.test(last)&&!/^\s/.test(target)){
   if(!openings.has(last)&&!(doubleQuote&&last==='"')&&!(singleQuote&&last==="'")&&!closings.has(key[0])&&!(quote&&!openingQuote))space=' ';
  }
  if(target.trim()){lineStart=false;if(/[.!?]$/.test(target.trim())||openings.has(key)||openingQuote)sentenceStart=true;}
  if(quote){if(!openingQuote)sentenceStart=false;if(key==='"')doubleQuote=!doubleQuote;else singleQuote=!singleQuote;}
  if(isNewline){lineStart=true;sentenceStart=false;doubleQuote=false;singleQuote=false;}
  if(budget)budget(160+6*(key.length+target.length+choices.reduce((sum,choice)=>sum+choice.length,0))+32*choices.length);
  const original=source.slice(mapped.starts[start],mapped.ends[at-1]);
  target=omitUntranslatedTrailingDe(original,target);
  raw.push({sourceStart:mapped.starts[start],sourceEnd:mapped.ends[at-1],source:original,targetText:space+target,type,meanings:choices,hanviet:'',...(nameImage?{nameImage}:{})});
  if(type!=='name'||target)last=isNewline?'':key.slice(-1);
 }
 // Rule replacements may span several output words: merge overlapping origins so
 // every editing token still refers to a single exact range in the raw source.
 const result:Token[]=[];
 for(const token of raw){const previous=result.at(-1);if(previous&&token.sourceStart<previous.sourceEnd){previous.sourceEnd=Math.max(previous.sourceEnd,token.sourceEnd);previous.source=source.slice(previous.sourceStart,previous.sourceEnd);previous.targetText+=token.targetText;previous.type='rule';delete previous.nameImage;}else result.push({...token});}
 let covered=0;
 for(const token of result){token.sourceStart=covered;token.source=source.slice(covered,token.sourceEnd);covered=token.sourceEnd;}
 if(covered<source.length)result.push({sourceStart:covered,sourceEnd:source.length,source:source.slice(covered),targetText:'',type:'original',meanings:[],hanviet:''});
 return result;
}
