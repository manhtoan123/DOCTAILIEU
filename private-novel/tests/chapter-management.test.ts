import 'fake-indexeddb/auto';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {db,activeChapters,readyChapters} from '../src/core/db';
import {changeChapterVisibility,retryChapterState} from '../src/features/sync-cloud/services/shared-state-sync';
import {CHAPTER_STATE_PENDING} from '../src/features/sync-cloud/services/chapter-state-schema';
import {saveSharedChapter} from '../src/features/sync-cloud/services/shared-chapters';
import {saveReadingProgress,saveAiReadingProgress} from '../src/features/reader/services/reading-progress';
import {prepareBackup,stageBackup,restoreBackup} from '../src/features/import-export/services/backup';
import {validateCloudSnapshot,createCloudSnapshotWithMetadata} from '../src/features/sync-cloud/services/cloud-snapshot';
import {decodeCloudSnapshot} from '../src/features/sync-cloud/services/cloud-snapshot-codec';
const bookId='11111111-1111-4111-8111-111111111111',ids=['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const origin='https://manage.example';
beforeEach(async()=>{
 vi.stubGlobal('location',{origin});vi.stubGlobal('window',new EventTarget());const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 await db.delete();await db.open();
 await db.books.add({id:bookId,title:'Truyện thử',author:'',status:'ready',chapterCount:2,charCount:6,createdAt:1,updatedAt:1});
 await db.chapters.bulkAdd(ids.map((id,order)=>({id,bookId,order,title:'Chương '+(order+1),text:'abc',sourceId:'source',revision:1})));
 await db.progress.put({bookId,chapterId:ids[0],revision:1,paragraph:0,offset:0,updatedAt:1});
});
afterEach(async()=>{await db.delete();vi.unstubAllGlobals();});
it('hides and restores stable rows, moves progress and rejects late writes',async()=>{
 const before=(await db.chapters.get(ids[0]))!;await changeChapterVisibility(bookId,[ids[0]],true);
 expect((await activeChapters(bookId)).map(c=>c.id)).toEqual([ids[1]]);expect(await readyChapters(bookId)).toHaveLength(2);expect(await db.chapters.get(ids[0])).toEqual(before);
 expect((await db.progress.get(bookId))?.chapterId).toBe(ids[1]);expect((await db.books.get(bookId))?.charCount).toBe(3);
 expect(await saveReadingProgress({bookId,chapterId:ids[0],revision:1,paragraph:0,offset:0,updatedAt:2})).toBe(false);
 expect(await saveAiReadingProgress({bookId,id:ids[0],revision:1,text:'abc'})).toBe(false);
 await expect(saveSharedChapter(before,'changed')).rejects.toThrow();
 await changeChapterVisibility(bookId,[ids[0]],false);expect(await activeChapters(bookId)).toHaveLength(2);expect(await db.chapters.get(ids[0])).toEqual(before);
});
it('edits title and body on same ID and rejects a stale editor',async()=>{
 const before=(await db.chapters.get(ids[0]))!;await saveSharedChapter(before,'new body',undefined,'New title');
 expect(await db.chapters.get(ids[0])).toMatchObject({id:ids[0],title:'New title',text:'new body',revision:2,sourceId:'source',order:0});
 await expect(saveSharedChapter(before,'stale')).rejects.toThrow();
});
it('waits for cloud acknowledgement and recovers a lost response using the fixed CAS',async()=>{
 await db.settings.put({key:`cloud-uploaded:${origin}:${bookId}`,value:{sha256:'a'.repeat(64)}});
 let accepted:any;vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{const input=JSON.parse(init.body as string);if(!accepted){accepted={id:input.id,revision:1,record:input.record};throw Error('lost response');}expect(input.baseRevision).toBe(0);return Response.json({row:accepted},{status:409});}));
 await expect(changeChapterVisibility(bookId,[ids[0]],true)).rejects.toThrow('lost response');expect(await activeChapters(bookId)).toHaveLength(2);expect(await db.settings.get(CHAPTER_STATE_PENDING+bookId)).toBeTruthy();
 await retryChapterState(bookId);expect(await activeChapters(bookId)).toHaveLength(1);expect(await db.settings.get(CHAPTER_STATE_PENDING+bookId)).toBeUndefined();
});
it('round trips hidden rows with remapped IDs in backup v3 and cloud v2',async()=>{
 await changeChapterVisibility(bookId,ids,true);const plan=await prepareBackup(bookId),part=await plan.part(0),packet=JSON.parse(await part.blob.text());expect(packet.version).toBe(3);
 const staged=await stageBackup([new File([part.blob],part.name)],()=>{}),restored=await restoreBackup(staged[0]);expect(await readyChapters(restored)).toHaveLength(2);expect(await activeChapters(restored)).toHaveLength(0);expect((await db.books.get(restored))?.hiddenChapterIds).not.toEqual(ids);
 const snapshot=await createCloudSnapshotWithMetadata(bookId),decoded=await decodeCloudSnapshot(snapshot.bytes),data=validateCloudSnapshot(decoded.value);expect(data.version).toBe(2);expect(data.chapters).toHaveLength(2);expect(data.book.chapterCount).toBe(0);
 await changeChapterVisibility(bookId,ids,false);const restoredPlan=await prepareBackup(bookId);expect(JSON.parse(await (await restoredPlan.part(0)).blob.text()).version).toBe(2);expect(validateCloudSnapshot((await decodeCloudSnapshot((await createCloudSnapshotWithMetadata(bookId)).bytes)).value).version).toBe(1);
});
