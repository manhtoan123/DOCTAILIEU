import 'fake-indexeddb/auto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {db,commitImport} from '../src/core/db';
import {importEpub} from '../src/features/import-export/services/epub-import';
import {MAX_ORIGINAL_BYTES,MAX_EPUB_ORIGINAL_BYTES,parseOriginalDescriptor,originalObjectKey,type OriginalDescriptor} from '../src/features/sync-cloud/services/cloud-original-schema';
import {syncBookOriginals,downloadOriginal} from '../src/features/sync-cloud/services/cloud-original-client';
import {createCloudSnapshotWithMetadata,restoreCloudSnapshot,contentHash,validateCloudSnapshot} from '../src/features/sync-cloud/services/cloud-snapshot';
import {hashBlob,prepareBackup,stageBackup,restoreBackup} from '../src/features/import-export/services/backup';
import type {Book,Chapter} from '../src/core/domain';
import {validateSharedRecord,sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {saveSharedChapter} from '../src/features/sync-cloud/services/shared-chapters';
import {applyLocalSharedRecord,prepareSharedChapter,LocalSharedConflict} from '../src/features/sync-cloud/services/shared-state-local';
import {ttsHash} from '../src/features/tts/services/tts-cursor';
import {defaults} from '../src/core/domain';
import {validateSharedImage,type SharedImage} from '../src/features/sync-cloud/services/shared-image-schema';
import {storeSharedImage,setLibraryBackground,publishSharedImages,loadSharedImage} from '../src/features/sync-cloud/services/shared-images';
import {syncSharedState,sharedSyncStatus} from '../src/features/sync-cloud/services/shared-state-sync';
import {handleSharedState} from '../server/shared-state';
import {sharedBlobKey} from '../server/shared-state-files';
import type {D1Database} from '@cloudflare/workers-types';
import {attachEpubOriginal,loadEpubArchive} from '../src/features/import-export/services/epub-render';
import * as backupModule from '../src/features/import-export/services/backup';
import {syncLocalBooks} from '../src/features/sync-cloud/services/cloud-client';

const mockedPackage=vi.hoisted(()=>({open:vi.fn(),read:vi.fn()}));
vi.mock('../src/features/import-export/services/epub-package',()=>({openEpubPackage:mockedPackage.open,readEpubChapter:mockedPackage.read}));
const bookId='00000000-0000-4000-8000-000000000081',sourceId='00000000-0000-4000-8000-000000000082',chapterId='00000000-0000-4000-8000-000000000083',origin='https://epub-persistence.example';
const layout={path:'OPS/chapter.xhtml',body:'<body xmlns="http://www.w3.org/1999/xhtml"><h1>標題</h1><p>字😀文</p></body>',styles:[{path:'OPS/style.css',text:'p { text-indent: 2em; }'}],nodes:['標題','字😀文']};
const payload=new Uint8Array([80,75,3,4,1,2,3,4]);
const descriptor=(bytes=payload.length):OriginalDescriptor=>parseOriginalDescriptor({version:1,sourceId,name:'synthetic.epub',relativePath:'Books/synthetic.epub',encoding:'epub',sha256:'a'.repeat(64),bytes});
beforeEach(async()=>{
 await db.delete();await db.open();vi.stubGlobal('location',{origin});vi.stubGlobal('navigator',{storage:{estimate:async()=>({quota:1e9,usage:0})}});vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
 mockedPackage.open.mockReset();mockedPackage.read.mockReset();mockedPackage.open.mockResolvedValue({entries:new Map(),title:'Archive title',author:'Author',spine:[{path:layout.path,title:'First chapter'}],coverPath:'OPS/cover.png'});mockedPackage.read.mockResolvedValue(layout);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function readyArchive(){
 const blob=new Blob([payload]),sha256=await hashBlob(blob),source={...descriptor(),sha256},book:Book={id:bookId,title:'Synthetic EPUB',author:'Author',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:layout.nodes.join('\n').length,epub:{source,spine:[layout.path],coverPath:'OPS/cover.png'}},chapter:Chapter={id:chapterId,bookId,order:0,title:'First chapter',text:layout.nodes.join('\n'),revision:1,sourceId,epub:layout};
 await db.books.put(book);await db.chapters.put(chapter);await db.sources.put({id:sourceId,bookId,name:source.name,relativePath:source.relativePath,encoding:source.encoding,sha256,bytes:blob.size,blob});return {book,chapter,blob,source};
}
function png(){const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);bytes.set([73,72,68,82],12);new DataView(bytes.buffer).setUint32(16,1);new DataView(bytes.buffer).setUint32(20,1);return new Blob([bytes],{type:'image/png'});}
class NativeStateD1 {
 native=new DatabaseSync(':memory:');beforeBatch?:()=>void;
 constructor(){for(const file of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0010_shared_state.sql'])this.native.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));this.native.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,10,'ready',?,1)").run(bookId,'b'.repeat(64),'synthetic/snapshot.json');}
 prepare(sql:string){const fixture=this;let params:any[]=[];return {bind(...p:any[]){params=p;return this;},execute(){const statement=fixture.native.prepare(sql);return {results:statement.columns().length?statement.all(...params):(statement.run(...params),[]),success:true};},async first(){return this.execute().results[0]??null;},async all(){return this.execute();},async run(){return this.execute();}};}
 async batch(statements:ReturnType<NativeStateD1['prepare']>[]){const hook=this.beforeBatch;this.beforeBatch=undefined;hook?.();this.native.exec('BEGIN');try{const result=statements.map(s=>s.execute());this.native.exec('COMMIT');return result;}catch(error){this.native.exec('ROLLBACK');throw error;}}
}

describe('independent EPUB original descriptor limits',()=>{
 it('permits EPUB originals up to256MiB while legacy text retains40MiB',()=>{
  expect(parseOriginalDescriptor({...descriptor(MAX_EPUB_ORIGINAL_BYTES)}).bytes).toBe(MAX_EPUB_ORIGINAL_BYTES);
  expect(()=>parseOriginalDescriptor({...descriptor(MAX_EPUB_ORIGINAL_BYTES+1)})).toThrow();
  expect(parseOriginalDescriptor({...descriptor(MAX_ORIGINAL_BYTES),name:'selected.txt',relativePath:'Books/selected.txt',encoding:'utf-8'}).bytes).toBe(MAX_ORIGINAL_BYTES);
  expect(()=>parseOriginalDescriptor({...descriptor(MAX_ORIGINAL_BYTES+1),name:'selected.txt',relativePath:'Books/selected.txt',encoding:'utf-8'})).toThrow();
 });
 it('EPUB descriptor keeps exact provenance/whole SHA and rejects disguised extension',()=>{
  const source=descriptor();expect(parseOriginalDescriptor(source)).toEqual(source);expect(originalObjectKey(bookId,source)).toBe(`originals/v1/${bookId}/${sourceId}/${source.sha256}.bin`);
  for(const name of ['synthetic.zip','synthetic.epub.exe','synthetic.epub '])expect(()=>parseOriginalDescriptor({...source,name,relativePath:'Books/'+name})).toThrow();
 });
});

describe('independent native SQLite EPUB original migration',()=>{
 function oldDatabase(){const sql=new DatabaseSync(':memory:');for(const file of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql','0007_raise_cloud_snapshot_limit.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));sql.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,10,'ready',?,1)").run(bookId,'b'.repeat(64),`books/v1/${bookId}/snapshot.json`);return sql;}
 function migration(){const directory=new URL('../migrations/',import.meta.url),files=readdirSync(directory).filter(f=>/^0011_.*\.sql$/.test(f));expect(files).toHaveLength(1);return readFileSync(new URL(files[0],directory),'utf8');}
 function applyMigration(sql:DatabaseSync,fail=false){sql.exec('BEGIN');try{sql.exec(migration());if(fail)throw Error('synthetic migration final failure');sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}
 function reserve(sql:DatabaseSync,source:OriginalDescriptor,state='pending'){return sql.prepare('INSERT INTO cloud_originals(book_id,source_id,descriptor_json,sha256,bytes,object_key,state,updated_at) VALUES(?,?,?,?,?,?,?,1)').run(bookId,source.sourceId,JSON.stringify(source),source.sha256,source.bytes,originalObjectKey(bookId,source),state);}
 function used(sql:DatabaseSync){return (sql.prepare('SELECT used_bytes FROM cloud_storage_budget WHERE id=1').get() as {used_bytes:number}).used_bytes;}
 it('preserves ready/pending rows and exact retained ledger through migration and replay',()=>{
  const sql=oldDatabase();try{const a={...descriptor(),name:'old.txt',relativePath:'Books/old.txt',encoding:'utf-8' as const},b={...descriptor(),sourceId:chapterId,sha256:'c'.repeat(64)};reserve(sql,a,'ready');reserve(sql,b);const rows=sql.prepare('SELECT * FROM cloud_originals ORDER BY source_id').all(),budget=used(sql);expect(budget).toBe(10+a.bytes+b.bytes);applyMigration(sql);expect(sql.prepare('SELECT * FROM cloud_originals ORDER BY source_id').all()).toEqual(rows);expect(used(sql)).toBe(budget);applyMigration(sql);expect(used(sql)).toBe(budget);expect(sql.prepare('SELECT * FROM cloud_originals ORDER BY source_id').all()).toEqual(rows);}finally{sql.close();}
 });
 it('SQL admits selected large EPUB reservation but retains text40MiB and EPUB64MiB caps',()=>{
  const sql=oldDatabase();try{applyMigration(sql);const epub=descriptor(50432417);reserve(sql,epub);expect(used(sql)).toBe(10+epub.bytes);expect(()=>reserve(sql,{...descriptor(MAX_ORIGINAL_BYTES+1),sourceId:chapterId,name:'oversized.txt',relativePath:'Books/oversized.txt',encoding:'utf-8'})).toThrow();expect(()=>reserve(sql,{...descriptor(MAX_EPUB_ORIGINAL_BYTES),sourceId:chapterId,bytes:MAX_EPUB_ORIGINAL_BYTES+1})).toThrow();expect(used(sql)).toBe(10+epub.bytes);}finally{sql.close();}
 });
 it('reinstalled original triggers retain quota, immutable identity and cloud deletion guards',()=>{
  const sql=oldDatabase();try{applyMigration(sql);reserve(sql,descriptor());const budget=used(sql);expect(()=>sql.exec('DELETE FROM cloud_originals')).toThrow(/retained/);expect(()=>sql.exec('UPDATE cloud_originals SET bytes=bytes+1')).toThrow(/immutable/);expect(used(sql)).toBe(budget);sql.prepare('INSERT INTO cloud_book_deletions(id,deleted_at) VALUES(?,1)').run(bookId);expect(()=>reserve(sql,{...descriptor(),sourceId:chapterId})).toThrow(/unavailable/);expect(used(sql)).toBe(budget);sql.exec('DELETE FROM cloud_book_deletions');sql.prepare('UPDATE cloud_storage_budget SET used_bytes=9000000000 WHERE id=1').run();expect(()=>reserve(sql,{...descriptor(),sourceId:chapterId})).toThrow(/budget/);expect(used(sql)).toBe(9000000000);}finally{sql.close();}
 });
 it('per-book100-original reservation cap survives replacement table and rejected insert charges nothing',()=>{
  const sql=oldDatabase();try{applyMigration(sql);for(let i=0;i<100;i++)reserve(sql,{...descriptor(),sourceId:'00000000-0000-4000-8000-'+(i+1000).toString(16).padStart(12,'0')});const budget=used(sql);expect(()=>reserve(sql,{...descriptor(),sourceId:chapterId})).toThrow(/count/);expect(used(sql)).toBe(budget);expect(sql.prepare('SELECT COUNT(*) AS n FROM cloud_originals').get()?.n).toBe(100);}finally{sql.close();}
 });
 it('failure after table-copy/trigger recreation rolls back schema, reservations and ledger together',()=>{
  const sql=oldDatabase();try{reserve(sql,{...descriptor(),name:'old.txt',relativePath:'Books/old.txt',encoding:'utf-8'});const rows=sql.prepare('SELECT * FROM cloud_originals').all(),budget=used(sql),schema=sql.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cloud_originals'").get();expect(()=>applyMigration(sql,true)).toThrow('synthetic migration final failure');expect(sql.prepare('SELECT * FROM cloud_originals').all()).toEqual(rows);expect(used(sql)).toBe(budget);expect(sql.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cloud_originals'").get()).toEqual(schema);expect(()=>reserve(sql,{...descriptor(MAX_ORIGINAL_BYTES+1),sourceId:chapterId})).toThrow();expect(used(sql)).toBe(budget);}finally{sql.close();}
 });
});

describe('independent real Dexie EPUB import publication',()=>{
 it('one selected archive preserves exact original bytes/SHA and rich metadata atomically in staging',async()=>{
  const file=new File([payload],'synthetic.epub'),result=await importEpub(file,'User title',()=>{},new AbortController().signal),book=(await db.books.get(result.id))!,chapters=await db.chapters.where('bookId').equals(result.id).toArray(),sources=await db.sources.where('bookId').equals(result.id).toArray();
  expect(book).toMatchObject({title:'User title',status:'staging',chapterCount:1,charCount:layout.nodes.join('\n').length});expect(chapters[0]).toMatchObject({order:0,revision:1,text:layout.nodes.join('\n'),epub:layout});expect(sources).toHaveLength(1);expect(new Uint8Array(await sources[0].blob.arrayBuffer())).toEqual(payload);expect(sources[0].sha256).toBe(await hashBlob(file));expect(book.epub?.source.sha256).toBe(sources[0].sha256);expect(book.epub?.source.sourceId).toBe(sources[0].id);expect(chapters[0].sourceId).toBe(sources[0].id);
  await commitImport(result.id);expect((await db.books.get(result.id))?.status).toBe('ready');expect((await db.importJobs.where('bookId').equals(result.id).first())?.phase).toBe('committed');
 });
 it('a late import job failure rolls back book/chapters/source publication without losing archive bytes',async()=>{
  const file=new File([payload],'synthetic.epub');vi.spyOn(db.importJobs,'add').mockRejectedValue(Error('synthetic late import failure'));
  await expect(importEpub(file,'Synthetic',()=>{},new AbortController().signal)).rejects.toThrow('synthetic late import failure');expect(await Promise.all([db.books.count(),db.chapters.count(),db.sources.count(),db.importJobs.count()])).toEqual([0,0,0,0]);expect(new Uint8Array(await file.arrayBuffer())).toEqual(payload);
 });
 it('cancellation during source write aborts the entire import transaction',async()=>{
  const controller=new AbortController(),add=db.sources.add.bind(db.sources);vi.spyOn(db.sources,'add').mockImplementation((...args:Parameters<typeof add>)=>{controller.abort();return add(...args);});
  await expect(importEpub(new File([payload],'synthetic.epub'),'Synthetic',()=>{},controller.signal)).rejects.toThrow();expect(controller.signal.aborted).toBe(true);expect(await Promise.all([db.books.count(),db.chapters.count(),db.sources.count(),db.importJobs.count()])).toEqual([0,0,0,0]);
 });
});

describe('independent rich cloud snapshot/source identity',()=>{
 it('cloud-restored EPUB compact backup synthesizes missing source metadata without fetching or caching archive bytes',async()=>{
  const fixture=await readyArchive();await db.sources.delete(sourceId);await db.chapters.update(chapterId,{sourceId:''});const fetch=vi.fn().mockRejectedValue(Error('no automatic archive fetch'));vi.stubGlobal('fetch',fetch);const backup=await prepareBackup(bookId,{mode:'compact'}),part=await backup.part(0),packet=JSON.parse(await part.blob.text()),body=JSON.parse(packet.body);
  expect(body.sources).toEqual([{id:sourceId,name:fixture.source.name,relativePath:fixture.source.relativePath,encoding:'epub',sha256:fixture.source.sha256,bytes:fixture.source.bytes,dataStatus:'missing'}]);expect(await db.sources.count()).toBe(0);expect(fetch).not.toHaveBeenCalled();
  const [id]=await stageBackup([new File([part.blob],part.name)],()=>{}),restoredId=await restoreBackup(id,{onConflict:'keep-both'}),restoredBook=(await db.books.get(restoredId))!,restoredSource=(await db.sources.where('bookId').equals(restoredId).first())!;expect(restoredBook.epub?.source.sourceId).toBe(restoredSource.id);expect(restoredBook.epub?.source.sha256).toBe(fixture.source.sha256);expect(restoredSource.dataStatus).toBe('missing');expect(restoredSource.blob.size).toBe(0);expect(fetch).not.toHaveBeenCalled();
 });
 it('portable EPUB above8MiB fails before encoding and leaves compact backup available',async()=>{
  const fixture=await readyArchive(),blob=new Blob([new Uint8Array(8*1048576+1)]),sha256=await hashBlob(blob),source={...fixture.source,bytes:blob.size,sha256};await db.sources.update(sourceId,{blob,bytes:blob.size,sha256});await db.books.update(bookId,{epub:{...fixture.book.epub!,source}});
  const read=vi.spyOn(Blob.prototype,'arrayBuffer').mockRejectedValue(Error('source encoding must not start'));await expect(prepareBackup(bookId,{mode:'portable'})).rejects.toThrow(/EPUB lớn|sao lưu gọn/);expect(read).not.toHaveBeenCalled();read.mockRestore();const compact=await prepareBackup(bookId,{mode:'compact'});expect(compact.manifest.hasSourceData).toBe(false);expect((await db.sources.get(sourceId))?.blob.size).toBe(blob.size);
 });
 it('plain chapter edits retain rich node mapping and original archive bytes; incompatible split is atomic rejection',async()=>{
  const fixture=await readyArchive();await saveSharedChapter(fixture.chapter,'新標題\n新字😀文');const saved=(await db.chapters.get(chapterId))!;expect(saved.text).toBe('新標題\n新字😀文');expect(saved.epub?.nodes.join('\n')).toBe(saved.text);expect(saved.epub?.body).toBe(layout.body);expect(saved.epub?.styles).toEqual(layout.styles);expect(saved.sourceId).toBe(sourceId);expect(await hashBlob((await db.sources.get(sourceId))!.blob)).toBe(fixture.source.sha256);
  const before=await Promise.all([db.chapters.toArray(),db.books.toArray(),db.settings.toArray()]);await expect(saveSharedChapter(saved,saved.text,2)).rejects.toThrow();expect(await Promise.all([db.chapters.toArray(),db.books.toArray(),db.settings.toArray()])).toEqual(before);await expect(saveSharedChapter(saved,'changed paragraph count')).rejects.toThrow();expect((await db.chapters.get(chapterId))?.text).toBe(saved.text);
 });
 it.each(['missing-layout','changed-path','changed-order','new-descendant'] as const)('shared EPUB overlay rejects %s before any local mutation',async change=>{
  const fixture=await readyArchive(),baseSha256=await contentHash((await createCloudSnapshotWithMetadata(bookId)).bytes);await db.settings.put({key:`cloud-uploaded:${origin}:${bookId}`,value:{sha256:baseSha256}});
  const target:Chapter={...fixture.chapter,revision:2};if(change==='missing-layout')delete target.epub;if(change==='changed-path')target.epub={...layout,path:'OPS/not-in-spine.xhtml'};if(change==='changed-order')target.order=1;
  const chapters=change==='new-descendant'?[target,{...target,id:'00000000-0000-4000-8000-000000000084',order:0.5}]:[target],record=validateSharedRecord({kind:'chapter',bookId,key:chapterId,value:{baseSha256,sourceHash:await ttsHash(fixture.chapter.text),sourceRevision:1,chapters}}),prepared=await prepareSharedChapter(record),before=await Promise.all([db.chapters.toArray(),db.books.toArray(),db.settings.toArray()]);
  await expect(db.transaction('rw',[db.settings,db.books,db.names,db.progress,db.chapters,db.dictionaries],()=>applyLocalSharedRecord(record,undefined,prepared))).rejects.toBeInstanceOf(LocalSharedConflict);expect(await Promise.all([db.chapters.toArray(),db.books.toArray(),db.settings.toArray()])).toEqual(before);expect(await hashBlob((await db.sources.get(sourceId))!.blob)).toBe(fixture.source.sha256);
 });
 it.each(['compact','portable'] as const)('%s backup restore remaps EPUB source identity and preserves layout/SHA',async mode=>{
  const fixture=await readyArchive(),backup=await prepareBackup(bookId,{mode}),part=await backup.part(0),[backupId]=await stageBackup([new File([part.blob],part.name)],()=>{}),restoredId=await restoreBackup(backupId,{onConflict:'keep-both'}),restoredBook=(await db.books.get(restoredId))!,source=(await db.sources.where('bookId').equals(restoredId).first())!,chapter=(await db.chapters.where('bookId').equals(restoredId).first())!;
  expect(source.id).not.toBe(sourceId);expect(restoredBook.epub?.source.sourceId).toBe(source.id);expect(chapter.sourceId).toBe(source.id);expect(restoredBook.epub?.source.sha256).toBe(fixture.source.sha256);expect(chapter.epub).toEqual(layout);expect(restoredBook.epub?.spine).toEqual([layout.path]);
  if(mode==='portable'){expect(new Uint8Array(await source.blob.arrayBuffer())).toEqual(payload);expect(await hashBlob(source.blob)).toBe(fixture.source.sha256);}else{expect(source.dataStatus).toBe('missing');expect(source.blob.size).toBe(0);}expect(new Uint8Array(await (await db.sources.get(sourceId))!.blob.arrayBuffer())).toEqual(payload);
 });
 it('snapshot v1 roundtrips rich EPUB layout and archive descriptor without embedding original bytes',async()=>{
  const fixture=await readyArchive(),snapshot=await createCloudSnapshotWithMetadata(bookId),decoded=JSON.parse(new TextDecoder().decode(snapshot.bytes));expect(decoded.version).toBe(1);expect(decoded.book.epub).toEqual(fixture.book.epub);expect(decoded.chapters[0].epub).toEqual(layout);expect(decoded.chapters[0].sourceId).toBe('');expect(decoded.sources).toBeUndefined();expect(JSON.stringify(decoded)).not.toContain('base64');
  await db.delete();await db.open();expect(await restoreCloudSnapshot(snapshot.bytes,bookId,await contentHash(snapshot.bytes))).toBe('added');expect((await db.books.get(bookId))?.epub).toEqual(fixture.book.epub);expect((await db.chapters.get(chapterId))?.epub).toEqual(layout);expect(await db.sources.count()).toBe(0);expect(new Uint8Array(await fixture.blob.arrayBuffer())).toEqual(payload);
 });
 it('snapshot rejects EPUB nodes inconsistent with canonical text and invalid archive provenance',async()=>{
  await readyArchive();const snapshot=JSON.parse(new TextDecoder().decode((await createCloudSnapshotWithMetadata(bookId)).bytes));
  expect(()=>validateCloudSnapshot({...snapshot,chapters:snapshot.chapters.map((c:Chapter)=>({...c,text:'different text'}))})).toThrow();
  expect(()=>validateCloudSnapshot({...snapshot,book:{...snapshot.book,epub:{...snapshot.book.epub,source:{...snapshot.book.epub.source,encoding:'utf-8'}}}})).toThrow();
 });
});

describe('independent EPUB original upload/download SHA and CAS',()=>{
 it('explicit local archive attachment verifies chosen bytes and fills only declared source without network',async()=>{
  const fixture=await readyArchive();await db.sources.delete(sourceId);const fetch=vi.fn().mockRejectedValue(Error('no attach network'));vi.stubGlobal('fetch',fetch);await attachEpubOriginal(bookId,new File([payload],'user-selected.epub'));const source=(await db.sources.get(sourceId))!;expect(source).toMatchObject({id:sourceId,bookId,name:fixture.source.name,relativePath:fixture.source.relativePath,encoding:'epub',bytes:fixture.source.bytes,sha256:fixture.source.sha256});expect(new Uint8Array(await source.blob.arrayBuffer())).toEqual(payload);expect((await db.books.get(bookId))?.epub).toEqual(fixture.book.epub);expect(fetch).not.toHaveBeenCalled();
 });
 it('wrong-size or same-size wrong-SHA selected archive never creates a source row',async()=>{
  await readyArchive();await db.sources.delete(sourceId);for(const bytes of [new Uint8Array(payload.length-1),new Uint8Array(payload.length).fill(9)]){await expect(attachEpubOriginal(bookId,new File([bytes],'selected.epub'))).rejects.toThrow();expect(await db.sources.get(sourceId)).toBeUndefined();}
 });
 it('book descriptor changed while chosen file hashes prevents stale local attachment',async()=>{
  const fixture=await readyArchive();await db.sources.delete(sourceId);const digest=backupModule.hashBlob;vi.spyOn(backupModule,'hashBlob').mockImplementationOnce(async blob=>{const hash=await digest(blob);await db.books.update(bookId,{epub:{...fixture.book.epub!,source:{...fixture.source,sha256:'c'.repeat(64)}}});return hash;});await expect(attachEpubOriginal(bookId,new File([payload],'selected.epub'))).rejects.toThrow(/thay đổi/);expect(await db.sources.get(sourceId)).toBeUndefined();expect((await db.books.get(bookId))?.epub?.source.sha256).toBe('c'.repeat(64));
 });
 it.each(['cloud-delete','foreign-source'] as const)('local archive attachment rejects %s without overwriting bytes',async cause=>{
  const fixture=await readyArchive();if(cause==='cloud-delete')await db.settings.put({key:`cloud-deleted:${origin}:${bookId}`,value:true});else await db.sources.update(sourceId,{bookId:'00000000-0000-4000-8000-000000000099'});const before=await db.sources.get(sourceId);await expect(attachEpubOriginal(bookId,new File([payload],'selected.epub'))).rejects.toThrow();expect(await db.sources.get(sourceId)).toEqual(before);expect(await hashBlob((await db.sources.get(sourceId))!.blob)).toBe(fixture.source.sha256);
 });
 it('late source write failure preserves metadata-only placeholder and ready book descriptor',async()=>{
  const fixture=await readyArchive();await db.sources.update(sourceId,{blob:new Blob([]),dataStatus:'missing'});const before=await db.sources.get(sourceId);vi.spyOn(db.sources,'put').mockRejectedValueOnce(Error('synthetic attach write failure'));await expect(attachEpubOriginal(bookId,new File([payload],'selected.epub'))).rejects.toThrow('synthetic attach write failure');expect(await db.sources.get(sourceId)).toEqual(before);expect((await db.books.get(bookId))?.epub).toEqual(fixture.book.epub);
 });
 it('archive download cannot overwrite a foreign empty source created while network request is in flight',async()=>{
  const fixture=await readyArchive(),foreign='00000000-0000-4000-8000-000000000099';await db.sources.delete(sourceId);await db.books.put({...fixture.book,id:foreign,epub:undefined});vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.endsWith('/originals'))return Response.json({originals:[{descriptor:fixture.source,state:'ready',updatedAt:1}]});await db.sources.put({id:sourceId,bookId:foreign,name:fixture.source.name,relativePath:fixture.source.relativePath,encoding:'epub',sha256:fixture.source.sha256,bytes:fixture.source.bytes,blob:new Blob([]),dataStatus:'missing'});return new Response(payload,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(payload.length),'X-Content-SHA256':fixture.source.sha256}});}));await expect(loadEpubArchive(bookId,new AbortController().signal)).rejects.toThrow();const preserved=(await db.sources.get(sourceId))!;expect(preserved.bookId).toBe(foreign);expect(preserved.blob.size).toBe(0);expect(preserved.dataStatus).toBe('missing');
 });
 it('publishes exact source descriptor and bytes only after checksum verified ACK',async()=>{
  const fixture=await readyArchive(),calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
   calls.push(init?.method??'GET');if(!init?.method)return Response.json({originals:[]});if(init.method==='POST'){expect(JSON.parse(init.body as string)).toEqual(fixture.source);return Response.json({descriptor:fixture.source,state:'pending'});}expect(new Uint8Array(await (init.body as Blob).arrayBuffer())).toEqual(payload);return Response.json({sourceId,sha256:fixture.source.sha256,state:'ready'});
  }));expect(await syncBookOriginals(bookId)).toBe(1);expect(calls).toEqual(['GET','POST','PUT']);expect((await db.settings.get(`cloud-original-uploaded:${origin}:${bookId}:${sourceId}:${fixture.source.sha256}`))?.value).toMatchObject({descriptor:fixture.source});expect(new Uint8Array(await (await db.sources.get(sourceId))!.blob.arrayBuffer())).toEqual(payload);
 });
 it('same-sized EPUB Blob mutation in flight prevents ACK without replacing declared original identity',async()=>{
  const fixture=await readyArchive();vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{if(!init?.method)return Response.json({originals:[]});if(init.method==='POST')return Response.json({descriptor:fixture.source,state:'pending'});await db.sources.update(sourceId,{blob:new Blob([new Uint8Array(payload.length).fill(9)])});return Response.json({sourceId,sha256:fixture.source.sha256,state:'ready'});}));
  await expect(syncBookOriginals(bookId)).rejects.toThrow();expect(await db.settings.get(`cloud-original-uploaded:${origin}:${bookId}:${sourceId}:${fixture.source.sha256}`)).toBeUndefined();expect((await db.sources.get(sourceId))?.sha256).toBe(fixture.source.sha256);
 });
 it('corrupt archive download fails checksum without caching or modifying local source',async()=>{
  const fixture=await readyArchive();await db.sources.delete(sourceId);let count=0;vi.stubGlobal('fetch',vi.fn(async()=>++count===1?Response.json({originals:[{descriptor:fixture.source,state:'ready',updatedAt:1}]}):new Response(new Uint8Array(payload.length).fill(9),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(payload.length),'X-Content-SHA256':fixture.source.sha256}})));
  await expect(downloadOriginal(bookId,sourceId)).rejects.toThrow();expect(await db.sources.get(sourceId)).toBeUndefined();expect((await db.books.get(bookId))?.epub).toEqual(fixture.book.epub);
 });
});

describe('independent cover/background immutable file publication',()=>{
 it('initial immutable snapshot publishes its captured cover even if user changes cover during image transfer',async()=>{
  const a=await storeSharedImage(png()),second=new Uint8Array(await png().arrayBuffer());new DataView(second.buffer).setUint32(16,2);const b=await storeSharedImage(new Blob([second]));await db.books.put({id:bookId,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:2,cover:a});await db.chapters.put({id:chapterId,bookId,order:0,title:'First',text:'原文',revision:1,sourceId:''});let changed=false;const verified=new Set<string>();
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(url.startsWith('/api/state-files/')){const sha=url.split('/').at(-1)!;if(init?.method==='HEAD'){if(!changed){changed=true;await db.books.update(bookId,{cover:b});}return new Response(null,{status:404});}const blob=init!.body as Blob;expect(await hashBlob(blob)).toBe(sha);verified.add(sha);return Response.json({sha256:sha,bytes:blob.size});}if(url==='/api/cloud/books')return Response.json({books:[],cursor:null});if(url===`/api/cloud/books/${bookId}`&&init?.method==='PUT'){const snapshot=JSON.parse(await (init.body as Blob).text());expect(verified.has(snapshot.book.cover.sha256)).toBe(true);return Response.json({id:bookId,sha256:new Headers(init.headers).get('X-Content-SHA256')});}throw Error('unexpected initial snapshot request');}));
  expect(await syncLocalBooks()).toBe(1);expect(changed).toBe(true);expect((await db.books.get(bookId))?.cover).toEqual(b);expect(await db.settings.get(`cloud-uploaded:${origin}:${bookId}`)).toBeDefined();
 });
 it('raster metadata keeps8MiB cap and rejects SVG/unknown MIME rather than trusting filename',()=>{
  for(const mime of ['image/png','image/jpeg','image/webp'])expect(validateSharedImage({sha256:'a'.repeat(64),bytes:8*1048576,mime}).mime).toBe(mime);
  for(const change of [{mime:'image/svg+xml'},{mime:'text/html'},{bytes:8*1048576+1},{bytes:0},{sha256:'bad'}])expect(()=>validateSharedImage({sha256:'a'.repeat(64),bytes:24,mime:'image/png',...change})).toThrow();
 });
 it('background selection/removal preserves other reader settings and exact verified image bytes',async()=>{
  await db.settings.put({key:'reader',value:{...defaults,fontSize:31,theme:'dark'}});const file=new File([png()],'background.png');await setLibraryBackground(file);const value=(await db.settings.get('reader'))!.value as typeof defaults&{libraryBackground:SharedImage};expect(value).toMatchObject({fontSize:31,theme:'dark'});expect(value.libraryBackground.sha256).toBe(await hashBlob(file));expect(new Uint8Array(await (await loadSharedImage(value.libraryBackground)).arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));await setLibraryBackground();expect((await db.settings.get('reader'))?.value).toMatchObject({fontSize:31,theme:'dark',libraryBackground:null});
 });
 it.each(['book','reader'] as const)('%s image bytes are verified before metadata CAS publication',async kind=>{
  const image=await storeSharedImage(png());if(kind==='book')await db.books.put({id:bookId,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:0,charCount:0,cover:image});else await db.settings.put({key:'reader',value:{...defaults,libraryBackground:image}});const events:string[]=[];let fileReady=false,revision=0;
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(url.startsWith('/api/state-files/')){events.push(init?.method??'GET');if(init?.method==='HEAD')return new Response(null,{status:404});expect(await hashBlob(init?.body as Blob)).toBe(image.sha256);fileReady=true;return Response.json({sha256:image.sha256,bytes:image.bytes});}if(init?.method==='PUT'){const body=JSON.parse(init.body as string);events.push('METADATA');expect(fileReady).toBe(true);return Response.json({row:{id:body.id,revision:++revision,record:validateSharedRecord(body.record)}});}return Response.json({rows:[],cursor:revision,more:false});}));
  await syncSharedState();expect(events).toEqual(['HEAD','PUT','METADATA']);expect(sharedSyncStatus().state).toBe('synced');
 });
 it('wrong successful image upload receipt prevents metadata publication and preserves cached bytes',async()=>{
  const image=await storeSharedImage(png()),record:SharedRecord={kind:'reader',key:'',value:{...defaults,libraryBackground:image}};vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='HEAD'?new Response(null,{status:404}):Response.json({sha256:'c'.repeat(64),bytes:image.bytes})));await expect(publishSharedImages(record)).rejects.toThrow();expect(await hashBlob((await db.settings.get('shared-image-blob:'+image.sha256))!.value as Blob)).toBe(image.sha256);
 });
 it('cached and downloaded image MIME/checksum use the same fail-closed validation',async()=>{
  const image=await storeSharedImage(png());await expect(loadSharedImage({...image,mime:'image/jpeg'})).rejects.toThrow();await db.settings.delete('shared-image-blob:'+image.sha256);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(image.bytes),{headers:{'X-Content-SHA256':image.sha256,'Content-Length':String(image.bytes)}})));await expect(loadSharedImage(image)).rejects.toThrow();expect(await db.settings.get('shared-image-blob:'+image.sha256)).toBeUndefined();
 });
 it.each(['book','reader'] as const)('server %s image metadata requires ready blob proof and rechecks it inside CAS',async kind=>{
  const image=await storeSharedImage(png()),sql=new NativeStateD1(),record:SharedRecord=kind==='book'?{kind,bookId,key:'',value:{title:'Synthetic',author:'',cover:image}}:{kind,key:'',value:{...defaults,libraryBackground:image}},id=await sharedRecordId(record),head={key:sharedBlobKey(image.sha256),size:image.bytes,checksums:{sha256:new Uint8Array(image.sha256.match(/../g)!.map(b=>parseInt(b,16))).buffer}},env={DB:sql as unknown as D1Database,LIBRARY_BUCKET:{head:async()=>head} as any};
  const put=()=>handleSharedState(new Request(origin+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,baseRevision:0,record})}),env);
  try{expect((await put()).status).not.toBe(200);expect(sql.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(0);sql.native.prepare("INSERT INTO shared_state_blobs(sha256,bytes,state) VALUES(?,?,'ready')").run(image.sha256,image.bytes);sql.beforeBatch=()=>{sql.native.prepare("UPDATE shared_state_blobs SET state='pending' WHERE sha256=?").run(image.sha256);};expect((await put()).status).not.toBe(200);expect(sql.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(0);sql.native.prepare("UPDATE shared_state_blobs SET state='ready' WHERE sha256=?").run(image.sha256);const response=await put();expect(response.status).toBe(200);expect((await response.json()).row.record).toEqual(validateSharedRecord(record));}finally{sql.native.close();}
 });
});
