import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {prepareBackup,stageBackup,restoreBackup,restoreInfo,hashBlob} from '../src/features/import-export/services/backup';
import {CONVERT_NAMES_KEY,saveConvertNames,readConvertNames,deleteConvertName} from '../src/features/names-convert/services/convert-names';

beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>vi.restoreAllMocks());
async function seed(){
  await db.books.add({id:'book',title:'Stability',displayTitle:'Tên truyện',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:3});
  await db.chapters.add({id:'chapter',bookId:'book',order:0,title:'第一章',displayTitle:'Chương một',text:'甲🙂',revision:1,sourceId:'source'});
  const blob=new Blob(['Original bytes']);
  await db.sources.add({id:'source',bookId:'book',name:'原文.txt',displayName:'Bản gốc.txt',relativePath:'原文.txt',encoding:'utf-8',sha256:await hashBlob(blob),bytes:blob.size,blob});
  await db.progress.put({bookId:'book',chapterId:'chapter',paragraph:0,offset:1,revision:1,updatedAt:1});
}
async function packet(){const p=await(await prepareBackup('book',{mode:'portable'})).part(0);return new File([p.blob],p.name);}
async function mutate(file:File,change:(body:any)=>void){const p=JSON.parse(await file.text()),b=JSON.parse(p.body);change(b);p.body=JSON.stringify(b);p.checksum=await hashBlob(new Blob([p.body]));return new File([JSON.stringify(p)],file.name);}
async function restore(file:File){const [id]=await stageBackup([file],()=>{});return restoreBackup(id,{onConflict:'replace'});}

it('clean restore preserves source bytes, Vietnamese names, global Names and reading offset',async()=>{
  await seed();await saveConvertNames('甲=Giáp');const file=await packet();await db.delete();await db.open();
  const id=await restore(file),source=await db.sources.where('bookId').equals(id).first(),chapter=await db.chapters.where('bookId').equals(id).first();
  expect(await source!.blob.text()).toBe('Original bytes');expect(await hashBlob(source!.blob)).toBe(source!.sha256);
  expect(source!.displayName).toBe('Bản gốc.txt');expect(chapter!.displayTitle).toBe('Chương một');
  expect((await db.progress.get(id))?.chapterId).toBe(chapter!.id);expect((await db.progress.get(id))?.offset).toBe(1);
  expect(await readConvertNames()).toEqual([{key:'甲',value:'Giáp'}]);
});
it('restoring Names preserves current edits and explicit deletions, and adds only absent keys',async()=>{
  await seed();await saveConvertNames('甲=Old\n乙=Deleted\n丙=Added');const file=await packet();
  await saveConvertNames('甲=Current');await deleteConvertName('乙');await db.settings.put({key:CONVERT_NAMES_KEY,value:[{key:'甲',value:'Current'}]});
  await restore(file);expect(await readConvertNames()).toEqual([{key:'甲',value:'Current'},{key:'丙',value:'Added'}]);
});
it('activation failure rolls global Names back together with the old book',async()=>{
  await seed();await saveConvertNames('甲=Backup');const file=await packet();await db.settings.delete(CONVERT_NAMES_KEY);
  const update=db.books.update.bind(db.books);vi.spyOn(db.books,'update').mockImplementation(((key:any,changes:any)=>changes.status==='ready'?Promise.reject(new Error('Activation failed')):update(key,changes)) as any);
  await expect(restore(file)).rejects.toThrow('Activation failed');expect(await readConvertNames()).toEqual([]);
  expect((await db.books.get('book'))?.status).toBe('ready');expect(await db.books.count()).toBe(1);
});
it.each(['bytes','hash'] as const)('rejects source %s corruption before replacing the original',async kind=>{
  await seed();const file=await mutate(await packet(),body=>{if(kind==='bytes')body.sources[0].bytes++;else body.sources[0].dataBase64=btoa('Changed! bytes');});
  await expect(restore(file)).rejects.toThrow();expect((await db.books.get('book'))?.status).toBe('ready');
  expect(await(await db.sources.get('source'))!.blob.text()).toBe('Original bytes');expect(await db.books.where('status').equals('staging').count()).toBe(0);
});
it('rejects a dictionary whose bytes disagree with its declared hash without installing it',async()=>{
  await seed();const blob=new Blob(['甲=Giáp']);await db.dictionaries.put({kind:'vp',name:'VP.txt',sha256:await hashBlob(blob),blob,updatedAt:1});
  const file=await mutate(await packet(),body=>{body.dictionaries[0].dataBase64=btoa('wrong');});await db.dictionaries.clear();
  await expect(restore(file)).rejects.toThrow();expect(await db.dictionaries.count()).toBe(0);expect((await db.books.get('book'))?.status).toBe('ready');
});
it('invalid global Names never partially install or replace a book',async()=>{
  await seed();const file=await mutate(await packet(),body=>{body.convertNames=[{key:'甲',value:'Valid'},{key:'invalid\nkey',value:'bad'}];});
  await expect(restore(file)).rejects.toThrow();expect(await readConvertNames()).toEqual([]);expect(await db.books.count()).toBe(1);
});
it('reports the required dictionary as missing when an existing different dictionary is preserved',async()=>{
  await seed();const blob=new Blob(['甲=Old']),sha256=await hashBlob(blob);await db.dictionaries.put({kind:'vp',name:'VP.txt',sha256,blob,updatedAt:1});
  const file=await packet(),current=new Blob(['甲=Current']);await db.dictionaries.put({kind:'vp',name:'Current.txt',sha256:await hashBlob(current),blob:current,updatedAt:2});
  const [id]=await stageBackup([file],()=>{});expect((await restoreInfo(id)).conflicts.missingDictionaries.map(d=>d.sha256)).toContain(sha256);
  await restoreBackup(id);expect(await(await db.dictionaries.get('vp'))!.blob.text()).toBe('甲=Current');
});
it('rejects an oversized export before returning a file that restore cannot accept',async()=>{
  await seed();const blob=new Blob([new Uint8Array(13*1024*1024)]);await db.sources.update('source',{blob,bytes:blob.size,sha256:await hashBlob(blob)});
  const plan=await prepareBackup('book',{mode:'portable'});await expect(plan.part(0)).rejects.toThrow(/16 MiB/);
});
