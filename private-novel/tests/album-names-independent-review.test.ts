import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {readNameScope,saveScopedBookNames,deleteScopedBookName} from '../src/features/names-convert/services/scoped-names';
import {ALBUM_NAMES_PREFIX,albumNameKey,albumNameSetting} from '../src/features/names-convert/services/album-name-schema';
import {validateSharedRecord,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {applyLocalSharedRecord,readLocalSharedRecord,sharedJson,LocalSharedConflict,captureSharedRecords} from '../src/features/sync-cloud/services/shared-state-local';
import {createAlbum,getAlbumRegistry,renameAlbum} from '../src/features/library/services/album-registry';
import {saveReaderName,deleteReaderName} from '../src/features/reader/services/reader-word-edit';
import {prepareBackup,stageBackup,restoreBackup,hashBlob} from '../src/features/import-export/services/backup';

beforeEach(async()=>{
 vi.stubGlobal('location',{origin:'https://album-review.example'});
 vi.stubGlobal('localStorage',{getItem:()=>null});
 await db.delete();await db.open();
 await db.books.bulkAdd([['a','Author/Series 1'],['b','Author/Series 2'],['other','AuthorTwo'],['outside',undefined]].map(([id,album])=>({id:id!,album,title:id!,author:'',status:'ready' as const,createdAt:1,updatedAt:2,chapterCount:1,charCount:4})));
 await db.names.bulkAdd([
  {id:'a-same',bookId:'a',key:'同',value:'Cùng'},
  {id:'b-same',bookId:'b',key:'同',value:'Cùng'},
  {id:'a-conflict',bookId:'a',key:'异',value:'A'},
  {id:'b-conflict',bookId:'b',key:'异',value:'B'},
  {id:'b-only',bookId:'b',key:'乙',value:'Chỉ B'},
  {id:'other',bookId:'other',key:'外',value:'Ngoài'},
 ]);
 await db.chapters.put({id:'chapter',bookId:'a',order:0,title:'Original',text:'原文😀',revision:2,sourceId:'source'});
 await db.sources.put({id:'source',bookId:'a',name:'original.txt',relativePath:'Author/Series 1/original.txt',encoding:'UTF-8',sha256:'a'.repeat(64),bytes:4,blob:new Blob([new Uint8Array([1,2,3,255])])});
 await db.progress.put({bookId:'a',chapterId:'chapter',paragraph:0,offset:2,revision:2,updatedAt:7});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const values=async(id:string)=>Object.fromEntries((await readNameScope(id)).rows.map(n=>[n.key,n.value]));
const record=(key:string,value:string|null):SharedRecord=>validateSharedRecord({kind:'album-name',key:albumNameKey('Author',key),value});

it('shares only unambiguous legacy values across outer author roots, including series',async()=>{
 expect(await values('a')).toEqual({'同':'Cùng','异':'A','乙':'Chỉ B'});
 expect(await values('b')).toEqual({'同':'Cùng','异':'B','乙':'Chỉ B'});
 expect(await values('other')).toEqual({'外':'Ngoài'});
 expect(await values('outside')).toEqual({});
 expect(await readNameScope('a')).toMatchObject({album:'Author',members:2,conflicts:1});
});

it('explicit value and tombstone resolve disagreements without touching legacy or original data',async()=>{
 const legacy=await db.names.toArray(),books=await db.books.toArray(),chapters=await db.chapters.toArray(),progress=await db.progress.toArray(),source=await db.sources.get('source');
 await saveScopedBookNames('a','异=Chung\n新=Mới','Author');
 expect(await values('b')).toMatchObject({'异':'Chung','新':'Mới'});
 expect((await readNameScope('b')).conflicts).toBe(0);
 const current=(await readNameScope('b')).rows.find(n=>n.key==='异')!;
 await deleteScopedBookName('b','异',current);
 expect(await values('a')).not.toHaveProperty('异');expect(await values('b')).not.toHaveProperty('异');
 expect(await db.names.toArray()).toEqual(legacy);expect(await db.books.toArray()).toEqual(books);expect(await db.chapters.toArray()).toEqual(chapters);expect(await db.progress.toArray()).toEqual(progress);
 const after=await db.sources.get('source');expect({...after,blob:undefined}).toEqual({...source,blob:undefined});expect(await after!.blob.arrayBuffer()).toEqual(await source!.blob.arrayBuffer());
});

it('rejects stale scope and changed delete value, keeping both scopes intact',async()=>{
 const current=(await readNameScope('a')).rows.find(n=>n.key==='同')!;
 await saveScopedBookNames('b','同=Changed');
 await expect(deleteScopedBookName('a','同',current)).rejects.toThrow('thay đổi');
 await db.books.update('a',{album:'Different'});
 await expect(saveScopedBookNames('a','新=Wrong','Author')).rejects.toThrow('Album');
 expect(await values('a')).not.toHaveProperty('新');expect(await values('b')).not.toHaveProperty('新');
});

it('rolls back a preceding valid write if another settings write fails',async()=>{
 const put=db.settings.put.bind(db.settings);let writes=0;
 vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof put>)=>{if(++writes===2)throw Error('quota');return put(...args);});
 await expect(saveScopedBookNames('a','一=One\n二=Two')).rejects.toThrow('quota');
 expect(await values('a')).not.toHaveProperty('一');expect(await values('b')).not.toHaveProperty('二');
});

it('validates canonical namespace, rejects book-scoped album records and does not collide on punctuation',()=>{
 for(const key of ['["Author","甲"] ','["Author/Series","甲"]','["Author","#甲"]','["Author","a=b"]','["Author","甲","乙"]'])expect(()=>validateSharedRecord({kind:'album-name',key,value:'Value'})).toThrow();
 expect(()=>validateSharedRecord({...record('甲','Value'),bookId:'a'})).toThrow();
 const first=validateSharedRecord({kind:'album-name',key:albumNameKey('A,[]"','甲%'),value:'One'});
 const second=validateSharedRecord({kind:'album-name',key:albumNameKey('A','甲,[]"%'),value:'Two'});
 expect(albumNameSetting(first.key)).not.toBe(albumNameSetting(second.key));
});

it('sync CAS applies each album key separately, rejecting concurrent local edit and preserving tombstones',async()=>{
 const initial=record('同','Remote');
 await db.transaction('rw',[db.settings,db.books,db.names],()=>applyLocalSharedRecord(initial,undefined));
 const before=sharedJson(await readLocalSharedRecord(initial));
 await saveScopedBookNames('b','同=Local\n新=Keep');
 await expect(db.transaction('rw',[db.settings,db.books,db.names],()=>applyLocalSharedRecord(record('同',null),before))).rejects.toBeInstanceOf(LocalSharedConflict);
 expect(await values('a')).toMatchObject({'同':'Local','新':'Keep'});
 const latest=sharedJson(await readLocalSharedRecord(initial));
 await db.transaction('rw',[db.settings,db.books,db.names],()=>applyLocalSharedRecord(record('同',null),latest));
 expect(await values('a')).not.toHaveProperty('同');expect(await values('b')).not.toHaveProperty('同');
 const captured=(await captureSharedRecords()).filter(r=>r.kind==='album-name');
 expect(captured).toContainEqual(record('同',null));expect(captured).toContainEqual(record('新','Keep'));
});

it('renames complete author tree and carries explicit values and tombstones, preserving legacy standalone paths',async()=>{
 const root=await createAlbum('Author');
 await db.books.put({...(await db.books.get('other'))!,id:'empty-segment',album:'Author//Standalone'});
 await getAlbumRegistry();await saveScopedBookNames('a','新=Shared');await deleteScopedBookName('a','同');
 const legacy=await db.names.toArray(),chapters=await db.chapters.toArray(),progress=await db.progress.toArray();
 await renameAlbum(root.id,'Renamed');
 expect((await db.books.get('a'))!.album).toBe('Renamed/Series 1');expect((await db.books.get('b'))!.album).toBe('Renamed/Series 2');expect((await db.books.get('empty-segment'))!.album).toBe('Author//Standalone');
 expect(await values('a')).toMatchObject({'新':'Shared'});expect(await values('b')).not.toHaveProperty('同');
 expect(await readLocalSharedRecord({kind:'album-name',key:albumNameKey('Renamed','同')})).toMatchObject({value:null});
 expect(await readLocalSharedRecord(record('新',null))).toMatchObject({value:null});
 expect(await db.names.toArray()).toEqual(legacy);expect(await db.chapters.toArray()).toEqual(chapters);expect(await db.progress.toArray()).toEqual(progress);
});

it('preserves exact whitespace in valid legacy author path roots',async()=>{
 await db.books.update('a',{album:'Author /Series 1'});await db.books.update('b',{album:'Author /Series 2'});
 await saveScopedBookNames('a','新=Whitespace','Author ');
 expect((await readNameScope('b')).album).toBe('Author ');expect(await values('b')).toHaveProperty('新','Whitespace');expect(await values('other')).not.toHaveProperty('新');
});

it('rejects Reader Name mutations after moving a book away from the captured author',async()=>{
 const current=(await readNameScope('a')).rows.find(n=>n.key==='异')!;
 await db.books.update('a',{album:'OtherAuthor'});
 await expect(saveReaderName('a','chapter',2,'新','Wrong','book','Author')).rejects.toThrow('Album');
 await expect(deleteReaderName('a','chapter',2,'异','Author',current)).rejects.toThrow('Album');
 expect(await values('a')).toHaveProperty('异','A');expect(await values('a')).not.toHaveProperty('新');expect(await values('b')).not.toHaveProperty('新');
});

async function backupFile(){const part=await(await prepareBackup('a')).part(0);return new File([part.blob],part.name);}
async function restore(file:File){const [id]=await stageBackup([file],()=>{});return restoreBackup(id);}

it('backup adds author values while current legacy meanings, edits and deletions win over imported values and tombstones',async()=>{
 await saveScopedBookNames('a','新=Backup\n删=Delete later');await deleteScopedBookName('a','同');const file=await backupFile();
 await db.settings.clear();const restored=await restore(file);
 expect(await values(restored)).toHaveProperty('新','Backup');expect(await values('b')).toHaveProperty('新','Backup');expect(await values('b')).toHaveProperty('同','Cùng');
 await saveScopedBookNames('b','新=Current');await deleteScopedBookName('b','删');await restore(file);
 expect(await values('a')).toHaveProperty('新','Current');expect(await values('a')).not.toHaveProperty('删');
});

it('backup rejects cross-author Name records before activating or publishing any pool entries',async()=>{
 await saveScopedBookNames('a','新=Backup');const file=await backupFile(),packet=JSON.parse(await file.text()),body=JSON.parse(packet.body);
 body.albumNames.push({kind:'album-name',key:albumNameKey('Unrelated','外'),value:'Wrong'});packet.body=JSON.stringify(body);packet.checksum=await hashBlob(new Blob([packet.body]));
 const books=await db.books.toArray(),names=await db.names.toArray(),settings=await db.settings.where('key').startsWith(ALBUM_NAMES_PREFIX).toArray();
 await expect(restore(new File([JSON.stringify(packet)],file.name))).rejects.toThrow('Album');
 expect(await db.books.toArray()).toEqual(books);expect(await db.names.toArray()).toEqual(names);expect(await db.settings.where('key').startsWith(ALBUM_NAMES_PREFIX).toArray()).toEqual(settings);
});

it('failed activation atomically rolls back restored author pool and staged book',async()=>{
 await saveScopedBookNames('a','新=Backup');const file=await backupFile();await db.settings.clear();
 const update=db.books.update.bind(db.books);
 vi.spyOn(db.books,'update').mockImplementation(((key:Parameters<typeof update>[0],changes:any)=>changes.status==='ready'?Promise.reject(Error('activation failed')):update(key,changes)) as typeof db.books.update);
 await expect(restore(file)).rejects.toThrow('activation failed');
 expect(await readLocalSharedRecord(record('新',null))).toBeUndefined();expect(await db.books.where('status').equals('staging').count()).toBe(0);expect(await db.books.count()).toBe(4);
});
