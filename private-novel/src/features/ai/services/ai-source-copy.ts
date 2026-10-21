import {parseNameValue} from '../../names-convert/services/name-images';

/** Inspect text values, never JSON IDs or markup. Does not change stored output. */
function values(text:string):string{
  const plain=text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/,'$1');
  if(plain.startsWith('{')||plain.startsWith('"'))try{
    const row:unknown=JSON.parse(plain);
    if(typeof row==='string')return row;
    if(row&&typeof row==='object'&&!Array.isArray(row)&&Object.values(row).every(v=>typeof v==='string'))return Object.values(row).join('\n');
  }catch{/* Plain prose is valid input too. */}
  return text;
}

/** Source remnants, not a semantic translation score.
 * Mixed Vietnamese/Latin prose must not retain source Han outside explicit Names.
 * Pure Han paragraphs need >=24 Han and an exact 8-Han source span; short isolated
 * quotations alone never fail. Explicit Name captions are always allowed.
 */
export function hasCopiedSource(source:string,result:string,allowedNameValues:readonly string[]=[]):boolean{
  let text=values(result);
  for(const label of [...new Set(allowedNameValues.map(v=>parseNameValue(v).label).filter(v=>v&&/\p{Script=Han}/u.test(v)))].sort((a,b)=>b.length-a.length))text=text.split(label).join(' ');
  const sourceText=values(source),lines=text.split(/[\r\n]+/);
  const mixed=lines.filter(p=>/\p{Script=Latin}/u.test(p)&&/\p{Script=Han}/u.test(p));
  if(mixed.length){const sourceHan=new Set(sourceText.match(/\p{Script=Han}/gu)??[]);for(const paragraph of mixed)for(const char of paragraph.match(/\p{Script=Han}/gu)??[])if(sourceHan.has(char))return true;}
  const paragraphs=lines.filter(p=>(p.match(/\p{Script=Han}/gu)?.length??0)>=24);
  if(!paragraphs.length)return false;
  const spans=new Set<string>();
  for(const run of sourceText.match(/\p{Script=Han}{8,}/gu)??[]){const chars=Array.from(run);for(let i=0;i<=chars.length-8;i++)spans.add(chars.slice(i,i+8).join(''));}
  for(const paragraph of paragraphs)for(const run of paragraph.match(/\p{Script=Han}{8,}/gu)??[]){const chars=Array.from(run);for(let i=0;i<=chars.length-8;i++)if(spans.has(chars.slice(i,i+8).join('')))return true;}
  return false;
}
