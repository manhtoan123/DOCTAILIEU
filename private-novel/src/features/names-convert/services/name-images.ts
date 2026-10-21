/** STV Name markup stays intact in storage; only the reading view interprets it. */
export interface NameImage {label:string;url:string}
export interface NameImageMatch {start:number;end:number;image:NameImage}
export const NAME_IMAGE_LIMIT=1000;
export const NAME_IMAGE_RULE_LIMIT=256;
const imageHost='archives.bulbagarden.net';
export const nameSourceKey=(key:string)=>key.replace(/^\$(?=\p{Script=Han})/u,'');
export function safeNameImageUrl(value:unknown):string|undefined{
 if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/u.test(value))return;
 try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!==imageHost||url.username||url.password||url.port||url.search||url.hash||!/^https:\/\//i.test(value)||!url.pathname.startsWith('/media/upload/')||! /\.(png|jpe?g|webp)$/i.test(url.pathname))return;return url.href;}catch{return;}
}
export function parseNameValue(value:string):{label:string;image?:NameImage}{
 if(!/^\s*\[i\]/i.test(value))return {label:value};
 const close=value.indexOf('[/]');if(close<0)return {label:''};
 const label=value.slice(close+3).trim(),url=safeNameImageUrl(value.slice(value.indexOf(']')+1,close).trim());
 return {label,...(url&&label&&label.length<=256&&!/[\r\n\u0000-\u001f]|\[i\]/i.test(label)?{image:{label,url}}:{})};
}
/** Revalidate even metadata recovered from an untrusted local cache. */
export function validNameImage(value:unknown):NameImage|undefined{
 if(!value||typeof value!=='object')return;
 const {label,url}=value as NameImage,checked=safeNameImageUrl(url);
 if(typeof label!=='string'||!label.trim()||label!==label.trim()||label.length>256||/[\u0000-\u001f\u007f]/.test(label)||!checked)return;
 return {label,url:checked};
}
export function nameImagesForSource(source:string,names:readonly {key:string;value:string}[]):NameImage[]{
 // Last entry wins, including a later plain Name that removes an earlier image.
 const bySource=new Map<string,string>();for(const row of names)bySource.set(nameSourceKey(row.key),row.value);
 const images:NameImage[]=[];for(const [key,value] of bySource){if(!key||!source.includes(key))continue;const image=parseNameValue(value).image;if(image)images.push(image);if(images.length>=NAME_IMAGE_RULE_LIMIT)break;}return images;
}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function findNameImages(text:string,values:readonly NameImage[],limit=NAME_IMAGE_LIMIT):NameImageMatch[]{
 const unique=new Map<string,NameImage>();for(const value of values){const image=validNameImage(value);if(image)unique.set(image.label.toLowerCase(),image);if(unique.size>=NAME_IMAGE_RULE_LIMIT)break;}
 const images=[...unique.values()].sort((a,b)=>b.label.length-a.label.length);if(!images.length||limit<=0)return [];
 const pattern=new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])(?:${images.map(x=>escape(x.label)).join('|')})(?![\\p{L}\\p{N}\\p{M}_])`,'giu'),matches:NameImageMatch[]=[];
 for(const match of text.matchAll(pattern)){const image=unique.get(match[0].toLowerCase())??images.find(x=>new RegExp(`^${escape(x.label)}$`,'iu').test(match[0]));if(image)matches.push({start:match.index,end:match.index+match[0].length,image});if(matches.length>=Math.min(NAME_IMAGE_LIMIT,limit))break;}return matches;
}
