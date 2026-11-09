import 'fake-indexeddb/auto';
import {beforeEach,it,expect} from 'vitest';
import {db} from '../src/core/db';
import {hashBlob,prepareBackup,stageBackup,restoreBackup} from '../src/features/import-export/services/backup';
beforeEach(async()=>{await db.delete();await db.open();});
it.each(['pdf','docx'])('portable backup restores %s bytes plus separate generated EPUB identity',async encoding=>{
 const bookId=crypto.randomUUID(),sourceId=crypto.randomUUID(),derivedId=crypto.randomUUID(),original=new Blob(['synthetic original '+encoding]),derived=new Blob(['synthetic generated archive']);
 const source={version:1 as const,sourceId:derivedId,name:'reading.epub',relativePath:'reading.epub',encoding:'epub' as const,sha256:await hashBlob(derived),bytes:derived.size};
 await db.books.add({id:bookId,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:6,epub:{source,spine:['section0.xhtml']}});
 await db.sources.bulkAdd([{id:derivedId,bookId,name:source.name,relativePath:source.relativePath,encoding:'epub',sha256:source.sha256,bytes:derived.size,blob:derived},{id:sourceId,bookId,name:'original.'+encoding,relativePath:'Root/original.'+encoding,encoding,sha256:await hashBlob(original),bytes:original.size,blob:original}]);
 await db.chapters.add({id:crypto.randomUUID(),bookId,order:0,title:'One',text:'Before',revision:1,sourceId:derivedId,epub:{path:'section0.xhtml',body:'<body><p>Before</p><img data-epub-src="image1.png"/></body>',styles:[],nodes:['Before']}});
 const plan=await prepareBackup(bookId,{mode:'portable'}),files:File[]=[];for(let i=0;i<plan.total;i++){const part=await plan.part(i);files.push(new File([part.blob],part.name));}const staged=await stageBackup(files,()=>{}),restored=await restoreBackup(staged[0]);
 const rows=await db.sources.where('bookId').equals(restored).toArray(),raw=rows.find(s=>s.encoding===encoding)!,book=await db.books.get(restored),chapter=await db.chapters.where('bookId').equals(restored).first();
 expect(rows).toHaveLength(2);expect(await raw.blob.text()).toBe(await original.text());expect(await hashBlob(raw.blob)).toBe(raw.sha256);expect(raw.relativePath).toBe('Root/original.'+encoding);expect(book?.epub?.source.sourceId).not.toBe(raw.id);expect(chapter?.sourceId).toBe(book?.epub?.source.sourceId);expect(chapter?.epub?.body).toContain('image1.png');
});
