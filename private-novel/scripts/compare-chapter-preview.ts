// Cached cloud bytes only: no network or data mutation.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {StreamingSplitter,type Part} from '../src/features/import-export/services/splitter';
const dir='.dsh-tmp/chapter-audit',inventory=JSON.parse(readFileSync(dir+'/inventory.json','utf8')),results:any[]=[];
for(const row of inventory.results){if(row.epub||!row.toc)continue;
 const snapshot=JSON.parse(readFileSync(`${dir}/${row.id}-snapshot.json`,'utf8')),source=snapshot.chapters.map((c:any)=>c.text).join(''),parts:Part[]=[];
 const splitter=new StreamingSplitter(row.title,p=>parts.push(p),undefined,0);for(const c of snapshot.chapters)splitter.feed(c.text);splitter.feed('',true);
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex');if(hash(source)!==hash(parts.map(p=>p.text).join('')))throw Error('Source changed '+row.id);
 writeFileSync(`${dir}/${row.id}-improved-preview.json`,JSON.stringify(parts.map(p=>({title:p.title,chars:p.text.length,start:p.text.slice(0,60)})),null,2));
 const result={id:row.id,title:row.title,old:row.count,proposed:parts.length,chars:source.length,sourceSha256:hash(source),lossless:true};results.push(result);console.log(JSON.stringify(result));
}
writeFileSync(dir+'/comparison.json',JSON.stringify({applied:false,cloudWrites:false,results},null,2));
