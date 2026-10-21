// Read-only audit of the cloud library explicitly requested by the user.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeCloudSnapshot,MAX_CLOUD_BYTES} from '../src/features/sync-cloud/services/cloud-snapshot-codec';
import {previewChapters} from '../src/features/import-export/services/splitter';
const dir='.dsh-tmp/chapter-audit',origin='https://thu-phong-private.pages.dev';mkdirSync(dir,{recursive:true});
let cursor:string|null=null;const books:any[]=[],results:any[]=[];
do{const r=await fetch(origin+'/api/cloud/books'+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(!r.ok)throw Error('Catalog '+r.status);const d=await r.json();if(!Array.isArray(d.books)||books.length>1000)throw Error('Invalid catalog');books.push(...d.books);cursor=d.cursor;}while(cursor);
for(const book of books){
 const r=await fetch(origin+'/api/cloud/books/'+book.id,{signal:AbortSignal.timeout(120000)});if(!r.ok){results.push({id:book.id,title:book.title,status:r.status});continue;}
 if(Number(r.headers.get('Content-Length'))>MAX_CLOUD_BYTES)throw Error('Snapshot too large');
 const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>MAX_CLOUD_BYTES||createHash('sha256').update(bytes).digest('hex')!==book.sha256)throw Error('Checksum mismatch '+book.id);
 const snapshot=(await decodeCloudSnapshot(bytes)).value as any;if(snapshot.book?.id!==book.id||!Array.isArray(snapshot.chapters))throw Error('Book mismatch');
 const chapters=snapshot.chapters,full=chapters.map((c:any)=>c.text).join(''),before=chapters.map((c:any)=>({id:c.id,order:c.order,title:c.title,charCount:c.text.length,revision:c.revision}));
 const row={id:book.id,title:book.title,sha256:book.sha256,epub:!!snapshot.book.epub,count:chapters.length,chars:full.length,edited:chapters.filter((c:any)=>c.revision>1).length,toc:before};
 writeFileSync(dir+'/'+book.id+'-toc.json',JSON.stringify(row,null,2));
 if(!row.epub){writeFileSync(dir+'/'+book.id+'-snapshot.json',JSON.stringify(snapshot));const preview=previewChapters(full,{maxChars:0,title:book.title});(row as any).currentResplitCount=preview.length;writeFileSync(dir+'/'+book.id+'-preview.json',JSON.stringify(preview,null,2));}
 results.push({...row,toc:before.slice(0,10)});writeFileSync(dir+'/inventory.json',JSON.stringify({cloudWrites:false,results},null,2));
 console.log(JSON.stringify({id:row.id,title:row.title,epub:row.epub,count:row.count,chars:row.chars,edited:row.edited}));
}
