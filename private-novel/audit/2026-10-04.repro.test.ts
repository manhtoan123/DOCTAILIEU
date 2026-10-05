import 'fake-indexeddb/auto';
import {beforeEach, afterAll, describe, it, expect} from 'vitest';
import {db} from '../src/db';
import {prepareBackup, stageBackup, restoreBackup, restoreInfo, hashBlob} from '../src/backup';
import {acceptSourceHash} from '../src/importer';
import {StreamingSplitter, type Part} from '../src/splitter';

// Synthetic positive invariants. A1/A4/A5/A6/A7 use it.fails until repaired;
// unexpected success is red and requires removing fails after review.
// A3 also has targeted atomicity regressions in tests/backup.test.ts.
beforeEach(async()=>{await db.delete();await db.open();});
afterAll(async()=>{await db.delete();});
async function seed(count=1, source=new Blob(['Original source text'])) {
  const sha=await hashBlob(source);
  await db.books.add({id:'book',title:'Audit book',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:count,charCount:count});
  await db.chapters.bulkAdd(Array.from({length:count},(_,order)=>({id:`c${order}`,bookId:'book',order,title:`C${order}`,text:'a',revision:1,sourceId:'src'})));
  await db.sources.add({id:'src',bookId:'book',name:'synthetic.txt',relativePath:'synthetic.txt',encoding:'utf-8',sha256:sha,bytes:source.size,blob:source});
  return sha;
}
async function exportFiles(mode:'compact'|'portable') {
  const plan=await prepareBackup('book',{mode});
  const files:File[]=[];
  for(let i=0;i<plan.total;i++){const p=await plan.part(i);files.push(new File([p.blob],p.name));}
  return files;
}
async function mutateBody(file:File, mutate:(body:any)=>void) {
  const packet=JSON.parse(await file.text());const body=JSON.parse(packet.body);
  mutate(body);packet.body=JSON.stringify(body);packet.checksum=await hashBlob(new Blob([packet.body]));
  return new File([JSON.stringify(packet)],file.name);
}
async function addDictionary(text='文=văn') {
  const blob=new Blob([text]);const sha256=await hashBlob(blob);
  await db.dictionaries.put({kind:'vp',name:'Audit VP.txt',sha256,blob,updatedAt:1});
  return sha256;
}

describe('AUDIT: A2/A3 regressions and five tracked expected failures',()=>{
  it.fails('A1: its own portable export must be accepted by restore',async()=>{
    await seed(1,new Blob([new Uint8Array(13*1024*1024)]));
    const files=await exportFiles('portable');
    const ids=await stageBackup(files,()=>{});
    expect(ids).toHaveLength(1);
    expect(await db.restorePackets.count()).toBe(files.length);
  });
  it('A2 FIXED regression: Compact Replace preserves original bytes and dedupes only actual source data',async()=>{
    const sha=await seed();const files=await exportFiles('compact');
    const [backupId]=await stageBackup(files,()=>{});
    const restored=await restoreBackup(backupId,{onConflict:'replace'});
    expect(await db.books.get('book')).toBeUndefined();
    const source=await db.sources.where('bookId').equals(restored).first();
    expect(source!.blob.size).toBe(source!.bytes);expect(await source!.blob.text()).toBe('Original source text');
    expect(source!.sha256).toBe(sha);
    expect(acceptSourceHash(new Set((await db.sources.toArray()).map(s=>s.sha256)),sha)).toBe(false);
  });
  it('A3 regression: failed restore cannot install a dictionary outside rollback',async()=>{
    await seed();await addDictionary();const files=await exportFiles('portable');
    files[0]=await mutateBody(files[0],body=>{body.book.chapterCount+=1;});
    await db.delete();await db.open();
    const [id]=await stageBackup(files,()=>{});
    await expect(restoreBackup(id)).rejects.toThrow();
    expect(await db.books.count()).toBe(0);
    expect(await db.dictionaries.count()).toBe(0);
    expect((await db.restoreJobs.toArray())[0].status).toBe('failed');
  });
  it.fails('A4: ready source bytes must agree with declared hash and length',async()=>{
    await seed();const files=await exportFiles('portable');
    files[0]=await mutateBody(files[0],body=>{body.sources[0].dataBase64=btoa('x');});
    await db.delete();await db.open();
    let restored:string;
    try{const [id]=await stageBackup(files,()=>{});restored=await restoreBackup(id);}
    catch{return;} // Rejecting corrupt bytes also satisfies the invariant.
    const source=await db.sources.where('bookId').equals(restored).first();
    expect((await db.books.get(restored))!.status).toBe('ready');
    expect(await hashBlob(source!.blob)).toBe(source!.sha256);
    expect(source!.blob.size).toBe(source!.bytes);
  });
  it.fails('A5: an unresolved dictionary requirement must be reported or installed',async()=>{
    await seed();const required=await addDictionary();const files=await exportFiles('portable');
    await db.delete();await db.open();const existing=await addDictionary('文=khác');
    const [id]=await stageBackup(files,()=>{});const info=await restoreInfo(id);
    await restoreBackup(id,{restoreDictionaries:true});
    const installed=(await db.dictionaries.get('vp'))!.sha256;
    expect(installed===required||info.conflicts.missingDictionaries.some(d=>d.sha256===required)).toBe(true);
    expect(existing).not.toBe(required);
  });
  it.fails('A6: packet indices cannot silently change original chapter order',async()=>{
    await seed(41);const files=await exportFiles('compact');
    const p1=JSON.parse(await files[1].text());const p2=JSON.parse(await files[2].text());
    [p1.index,p2.index]=[p2.index,p1.index];
    files[1]=new File([JSON.stringify(p1)],'one.json');files[2]=new File([JSON.stringify(p2)],'two.json');
    await db.delete();await db.open();
    let restored:string;
    try{const [id]=await stageBackup(files,()=>{});restored=await restoreBackup(id);}
    catch{return;} // Rejecting swapped parts is valid, as is preserving order.
    const chapters=(await db.chapters.where('bookId').equals(restored).toArray()).sort((a,b)=>a.order-b.order);
    expect(chapters).toHaveLength(41);expect(chapters[20].title).toBe('C20');
    expect(chapters[21].title).toBe('C21');
  });
  it.fails('A7: per-chapter TXT export preserves every Unicode character',async()=>{
    const input='a'.repeat(63999)+'🙂b';const parts:Part[]=[];
    new StreamingSplitter('Unicode',part=>parts.push(part)).feed(input,true);
    expect(parts.map(p=>p.text).join('')).toBe(input);
    const exported=(await Promise.all(parts.map(p=>new Blob([p.text]).text()))).join('');
    expect(exported).toBe(input);expect(exported).not.toContain('\uFFFD');
  });
});
