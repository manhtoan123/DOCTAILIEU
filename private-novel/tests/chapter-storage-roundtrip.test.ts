import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {uid} from '../src/core/domain';
import {StreamingSplitter,type Part} from '../src/features/import-export/services/splitter';
import {createCloudSnapshot,restoreCloudSnapshot,contentHash} from '../src/features/sync-cloud/services/cloud-snapshot';
import {prepareBackup,stageBackup,restoreBackup} from '../src/features/import-export/services/backup';

beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('navigator',{storage:{estimate:async()=>undefined}});});
afterEach(()=>vi.unstubAllGlobals());
it('whole-chapter safe parts roundtrip through cloud and compact backup without losing Unicode',async()=>{
  const source='第1章 长篇\n'+'文🙂'.repeat(90000)+'\n第2章 终点\n完';
  const parts:Part[]=[];const s=new StreamingSplitter('Text',p=>parts.push(p),undefined,0);s.feed(source,true);
  expect(parts.every(p=>p.text.length<=128000)).toBe(true);
  const id=uid();await db.books.add({id,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:parts.length,charCount:source.length});
  await db.chapters.bulkAdd(parts.map((p,order)=>({...p,id:uid(),bookId:id,order,revision:1,sourceId:''})));
  const cloud=await createCloudSnapshot(id),hash=await contentHash(cloud);
  const backup=await prepareBackup(id);const files:File[]=[];
  for(let i=0;i<backup.total;i++){const packet=await backup.part(i);files.push(new File([packet.blob],packet.name));}
  await db.delete();await db.open();await restoreCloudSnapshot(cloud,id,hash);
  expect((await db.chapters.toArray()).sort((a,b)=>a.order-b.order).map(c=>c.text).join('')).toBe(source);
  await db.delete();await db.open();const [backupId]=await stageBackup(files,()=>{});await restoreBackup(backupId);
  expect((await db.chapters.toArray()).sort((a,b)=>a.order-b.order).map(c=>c.text).join('')).toBe(source);
});
