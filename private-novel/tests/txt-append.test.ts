import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db,readyChapters} from '../src/core/db';
import {uid,type Chapter,type SourceFile} from '../src/core/domain';
import {ttsHash} from '../src/features/tts/services/tts-cursor';
import {findNewOnlyStart,findAppendStart,resolveAppendMatch,appendEligibleChapters,selectedAppendChapters,commitTxtAppend,discardAppendPreview,makeAppendRecords,prepareAppendRecord,applyAppendRecord,type AppendPreview} from '../src/features/import-export/services/chapter-append';
import {APPEND_PREFIX,APPEND_PACKET_PREFIX,type AppendManifest} from '../src/features/import-export/services/chapter-append-schema';
import {applyLocalSharedRecord,captureSharedRecords,prepareSharedChapter,readLocalSharedRecord} from '../src/features/sync-cloud/services/shared-state-local';
import {validateSharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
const bookId='append-book',baseSha='a'.repeat(64),stageId='append-stage';
const chapter=(i:number,book=bookId):Chapter=>({id:`${book}-${i}`,bookId:book,order:i,title:`第${i+1}章 标题`,text:`第${i+1}章 标题\n正文${i}。`,revision:1,sourceId:'old-source'});
let preview:AppendPreview,oldBytes:Uint8Array<ArrayBuffer>;
beforeEach(async()=>{
 vi.stubGlobal('location',{origin:'https://test'});await db.delete();await db.open();const before=Array.from({length:3},(_,i)=>chapter(i)),book={id:bookId,title:'Truyện giữ nguyên',author:'',status:'ready' as const,createdAt:1,updatedAt:1,chapterCount:3,charCount:before.reduce((n,c)=>n+c.text.length,0)};
 oldBytes=new Uint8Array([0,255,13,10,65]);await db.books.add(book);await db.chapters.bulkAdd(before);await db.sources.add({id:'old-source',bookId,name:'old.txt',relativePath:'old.txt',encoding:'utf-8',sha256:await ttsHash('old'),bytes:5,blob:new Blob([oldBytes])});
 const full=Array.from({length:5},(_,i)=>({...chapter(i,stageId),sourceId:'new-source'})),blob=new Blob([full.map(c=>c.text).join('\n')]),source:SourceFile={id:'new-source',bookId:stageId,name:'full.txt',relativePath:'full.txt',encoding:'utf-8',sha256:await ttsHash(await blob.text()),bytes:blob.size,blob};
 await db.books.add({...book,id:stageId,status:'staging',chapterCount:5});await db.chapters.bulkAdd(full);await db.sources.add(source);await db.importJobs.add({jobId:'stage-job',bookId:stageId,phase:'preview',totalFiles:1,processedFiles:1,processedBytes:source.bytes,checkpoint:1,duplicateFiles:[],updatedAt:1});
 await db.settings.bulkPut([{key:`cloud-uploaded:https://test:${bookId}`,value:{sha256:baseSha}},{key:'ai-reading-cache:v1:keep',value:{result:'Bản dịch giữ nguyên'}},{key:'tts-cursor-shared:'+bookId,value:{version:1,bookId,chapterId:before[0].id,mode:'ai',revision:1,sourceHash:'c'.repeat(64),semanticHash:'c'.repeat(64),renderedHash:'c'.repeat(64),voiceId:'tiktok-female-1',rate:1,offset:0,audioTime:0,updatedAt:1}}]);await db.progress.put({bookId,chapterId:before[1].id,revision:1,paragraph:0,offset:3,updatedAt:7});
 preview={book,before,stageId,staged:full,source,start:3};
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('resolves exact tail from the end and preserves existing default selection',async()=>{
 const match=await resolveAppendMatch(preview.before,preview.staged);expect(match).toMatchObject({start:3,match:'exact'});expect(appendEligibleChapters({...preview,...match}).map(c=>c.id)).toEqual(preview.staged.slice(3).map(c=>c.id));
});
it('uses normalized title-tail suggestions when bodies differ and requires explicit selection',async()=>{
 const fresh=preview.staged.map(c=>({...c,title:c.title.replace(/\d/g,n=>String.fromCharCode(n.charCodeAt(0)+0xfee0)).replace(' ','   '),text:c.text+' changed'})),match=await resolveAppendMatch(preview.before,fresh),candidate={...preview,staged:fresh,...match};
 expect(match).toMatchObject({start:3,match:'title'});expect(()=>selectedAppendChapters(candidate)).toThrow('tích chọn');expect(selectedAppendChapters(candidate,[fresh[4].id,fresh[3].id]).map(c=>c.id)).toEqual(fresh.slice(3).map(c=>c.id));expect(()=>selectedAppendChapters(candidate,[fresh[0].id])).toThrow('hợp lệ');
});
it('does not guess the latest repeated tail and blocks known and repeated chapters in manual preview',async()=>{
 const tail=preview.staged.slice(0,3).map(c=>({...c,text:c.text+' edited'})),fresh=[...tail,...tail.map(c=>({...c,id:c.id+'copy'})),...preview.staged.slice(3)],match=await resolveAppendMatch(preview.before,fresh),candidate={...preview,staged:fresh,...match};
 expect(match.match).toBe('manual');expect(match.start).toBe(0);expect(appendEligibleChapters(candidate).map(c=>c.id)).toEqual(preview.staged.slice(3).map(c=>c.id));expect(()=>selectedAppendChapters(candidate)).toThrow('tích chọn');
});
it('manual fallback still blocks known bodies with different titles and accepts explicit unknown chapters',async()=>{
 const fresh=preview.staged.map(c=>({...c,title:'Different '+c.title})),match=await resolveAppendMatch(preview.before,fresh),candidate={...preview,staged:fresh,...match};
 expect(match.match).toBe('manual');expect(match.blockedIds).toEqual(fresh.slice(0,3).map(c=>c.id));expect(()=>selectedAppendChapters(candidate,[fresh[1].id])).toThrow('hợp lệ');expect(selectedAppendChapters(candidate,[fresh[4].id])).toEqual([fresh[4]]);
});
it('blocks duplicate suffix text or titles even after an exact anchor',async()=>{
 const fresh=[...preview.staged,{...preview.staged[3],id:'duplicate-new',title:'Different new title'}],match=await resolveAppendMatch(preview.before,fresh);expect(match.match).toBe('exact');expect(appendEligibleChapters({...preview,staged:fresh,...match}).map(c=>c.id)).toEqual([preview.staged[4].id]);
});
it('does not collapse meaningful title numbers and punctuation into false tail matches',async()=>{
 const before=preview.before.map((c,i)=>({...c,title:['RE1','Chapter 1.2','Last'][i]})),fresh=preview.staged.map((c,i)=>({...c,title:['RE10','Chapter 12','Last','New4','New5'][i],text:'different body '+i}));expect((await resolveAppendMatch(before,fresh)).match).toBe('manual');
});
it('retains no-new-chapter detection and cancellation in relaxed matching',async()=>{
 await expect(resolveAppendMatch(preview.before,preview.staged.slice(0,3))).rejects.toThrow('chưa có chương mới');const stop=new AbortController();stop.abort();await expect(resolveAppendMatch(preview.before,preview.staged,stop.signal)).rejects.toMatchObject({name:'AbortError'});
});
it('new-only rejects overlap, duplicate text/title, empty input and cancellation',async()=>{
 const fresh=preview.staged.slice(3);expect(await findNewOnlyStart(preview.before,fresh)).toBe(0);
 await expect(findNewOnlyStart(preview.before,preview.staged)).rejects.toThrow('trùng');
 await expect(findNewOnlyStart(preview.before,[fresh[0],{...fresh[1],text:fresh[0].text}])).rejects.toThrow('trùng');
 await expect(findNewOnlyStart(preview.before,[{...fresh[0],title:preview.before[0].title}])).rejects.toThrow('trùng');
 await expect(findNewOnlyStart(preview.before,[])).rejects.toThrow();
 const stop=new AbortController();stop.abort();await expect(findNewOnlyStart(preview.before,fresh,stop.signal)).rejects.toMatchObject({name:'AbortError'});
});
it('new-only commits all staged chapters and preserves old rows, bytes and progress',async()=>{
 const fresh=preview.staged.slice(3);await db.chapters.where('bookId').equals(stageId).delete();await db.chapters.bulkAdd(fresh);
 const progress=await db.progress.get(bookId);expect(await commitTxtAppend({...preview,staged:fresh,start:0})).toBe(2);
 const all=await readyChapters(bookId);expect(all.slice(0,3)).toEqual(preview.before);expect(all.slice(3).map(c=>c.order)).toEqual([3,4]);expect(await db.progress.get(bookId)).toEqual(progress);
 expect(new Uint8Array(await (await db.sources.get('old-source'))!.blob.arrayBuffer())).toEqual(oldBytes);
});
it('finds a unique consecutive tail by title and content, not apparent chapter numbers',async()=>{
 expect(await findAppendStart(preview.before,preview.staged)).toBe(3);const shifted=preview.staged.map(c=>({...c,order:c.order+100}));expect(await findAppendStart(preview.before,shifted)).toBe(3);
 await expect(findAppendStart(preview.before,[...preview.staged,...preview.staged])).rejects.toThrow('nhiều lần');await expect(findAppendStart(preview.before,preview.staged.slice(0,3))).rejects.toThrow('chưa có chương mới');
 const edited=preview.staged.map(c=>c.order===2?{...c,text:c.text+'sửa'}:c);await expect(findAppendStart(preview.before,edited)).rejects.toThrow('Không tìm thấy');
});
it('appends only new suffix atomically, preserving original bytes, IDs/revisions, progress, AI and TTS',async()=>{
 const progress=await db.progress.get(bookId),settings=await db.settings.toArray();expect(await commitTxtAppend(preview)).toBe(2);
 const all=await readyChapters(bookId);expect(all.slice(0,3)).toEqual(preview.before);expect(all.slice(3).map(c=>[c.id,c.order,c.revision,c.sourceId])).toEqual(preview.staged.slice(3).map((c,i)=>[c.id,i+3,1,'new-source']));expect(await db.progress.get(bookId)).toEqual(progress);
 for(const row of settings)expect(await db.settings.get(row.key)).toEqual(row);expect(new Uint8Array(await (await db.sources.get('old-source'))!.blob.arrayBuffer())).toEqual(oldBytes);expect(await (await db.sources.get('new-source'))!.blob.text()).toBe(await preview.source.blob.text());
 expect((await db.sources.get('new-source'))!.bookId).toBe(bookId);expect(await db.books.get(stageId)).toBeUndefined();expect(await db.importJobs.count()).toBe(0);expect((await db.books.get(bookId))!.chapterCount).toBe(5);
 const records=await captureSharedRecords(),append=records.filter(r=>r.kind.startsWith('chapter-append'));expect(append.map(r=>r.kind)).toEqual(['chapter-append-packet','chapter-append']);expect((append[1].value as AppendManifest).baseSha256).toBe(baseSha);
});
it('commits a sparse selection in source order and syncs only chosen chapters',async()=>{
 const progress=await db.progress.get(bookId),settings=await db.settings.toArray();
 expect(await commitTxtAppend(preview,undefined,[preview.staged[4].id])).toBe(1);
 const all=await readyChapters(bookId);expect(all.slice(0,3)).toEqual(preview.before);expect(all[3]).toMatchObject({id:preview.staged[4].id,order:3,text:preview.staged[4].text});
 expect(await db.progress.get(bookId)).toEqual(progress);for(const row of settings)expect(await db.settings.get(row.key)).toEqual(row);
 expect((await db.books.get(bookId))!.charCount).toBe(all.reduce((n,c)=>n+c.text.length,0));
 const records=await captureSharedRecords(),manifest=records.find(r=>r.kind==='chapter-append')!;expect((manifest.value as AppendManifest).count).toBe(1);
 // Replay on a fresh base using the real packet/manifest path.
 await db.chapters.delete(all[3].id);await db.sources.delete('new-source');await db.settings.delete(APPEND_PREFIX+bookId+':'+manifest.key);
 const prepared=await prepareAppendRecord(manifest);expect(prepared.chapters.map(c=>c.id)).toEqual([preview.staged[4].id]);
 await db.transaction('rw',[db.books,db.chapters,db.sources,db.settings],()=>applyAppendRecord(manifest,prepared));
 expect(await readyChapters(bookId)).toEqual(all);expect((await db.books.get(bookId))!.chapterCount).toBe(4);expect((await db.books.get(bookId))!.charCount).toBe(all.reduce((n,c)=>n+c.text.length,0));expect((await db.sources.get('new-source'))!.dataStatus).toBe('missing');expect(await db.progress.get(bookId)).toEqual(progress);
});
it('orders reversed selection by file position rather than click order',async()=>{
 await commitTxtAppend(preview,undefined,[preview.staged[4].id,preview.staged[3].id]);expect((await readyChapters(bookId)).slice(3).map(c=>c.id)).toEqual(preview.staged.slice(3).map(c=>c.id));
});
it.each(['empty','duplicate','unknown','old'])('rejects %s selection before any writes',async kind=>{
 const ids=kind==='empty'?[]:kind==='duplicate'?[preview.staged[3].id,preview.staged[3].id]:kind==='old'?[preview.staged[0].id]:['unknown'];
 await expect(commitTxtAppend(preview,undefined,ids)).rejects.toThrow('Chọn ít nhất');expect(await readyChapters(bookId)).toEqual(preview.before);expect(await db.books.get(stageId)).toBeDefined();expect(await db.settings.where('key').startsWith(APPEND_PREFIX).count()).toBe(0);
});
it.each(['chapter','book','source','stage','deleted'])('rejects stale %s preview without changing the target suffix',async what=>{
 if(what==='chapter')await db.chapters.update(preview.before[0].id,{revision:2});if(what==='book')await db.books.update(bookId,{title:'Changed'});if(what==='source')await db.sources.update('new-source',{sha256:'b'.repeat(64)});if(what==='stage')await db.books.update(stageId,{status:'ready'});if(what==='deleted')await db.settings.put({key:`cloud-deleted:https://test:${bookId}`,value:true});
 const before=await readyChapters(bookId);await expect(commitTxtAppend(preview)).rejects.toThrow();expect(await readyChapters(bookId)).toEqual(before);expect(await db.settings.where('key').startsWith(APPEND_PREFIX).count()).toBe(0);
});
it('abort during native chapter add rolls back packets, manifest, sources, counters and staging together',async()=>{
 const stop=new AbortController(),add=IDBObjectStore.prototype.add;vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof add>){const request=add.apply(this,args);if(this.name==='chapters'&&(args[0] as Chapter).bookId===bookId)request.addEventListener('success',()=>stop.abort(),{once:true});return request;});
 await expect(commitTxtAppend(preview,stop.signal)).rejects.toMatchObject({name:'AbortError'});expect(await readyChapters(bookId)).toEqual(preview.before);expect((await db.sources.get('new-source'))!.bookId).toBe(stageId);expect(await db.books.get(stageId)).toBeDefined();expect(await db.settings.where('key').startsWith(APPEND_PACKET_PREFIX).count()).toBe(0);expect((await db.books.get(bookId))!.chapterCount).toBe(3);
});
it('discard removes only the owned staging preview and leaves a ready book alone',async()=>{
 await discardAppendPreview({stageId:bookId});expect(await readyChapters(bookId)).toEqual(preview.before);await discardAppendPreview(preview);expect(await db.books.get(stageId)).toBeUndefined();expect(await db.books.get(bookId)).toBeDefined();
});
async function remote(){
 const chapters=preview.staged.slice(3).map(c=>({...c,bookId})),records=await makeAppendRecords(bookId,preview.before,chapters,preview.source,baseSha);
 await discardAppendPreview(preview);for(const packet of records.packets)await db.settings.put({key:APPEND_PACKET_PREFIX+bookId+':'+packet.key,value:packet});return records;
}
const apply=async(record:Awaited<ReturnType<typeof remote>>['manifest'])=>{const expected=await readLocalSharedRecord(record),prepared=await prepareSharedChapter(record);await db.transaction('rw',[db.settings,db.books,db.chapters,db.sources],()=>applyLocalSharedRecord(record,expected?JSON.stringify(expected):undefined,prepared));};
it('fresh-device packet/manifest applies complete suffix only, creates honest missing source and is idempotent',async()=>{
 const {manifest}=await remote(),progress=await db.progress.get(bookId);expect(await readyChapters(bookId)).toHaveLength(3);await apply(manifest);expect(await readyChapters(bookId)).toHaveLength(5);expect(await db.progress.get(bookId)).toEqual(progress);const source=await db.sources.get('new-source');expect(source?.dataStatus).toBe('missing');expect(source?.blob.size).toBe(0);expect(source?.bytes).toBe(preview.source.bytes);await apply(manifest);expect(await readyChapters(bookId)).toHaveLength(5);
});
it.each(['missing','hash','anchor','id','base','competing'])('rejects remote %s atomically without publishing a prefix or overwriting existing data',async what=>{
 const {packets,manifest}=await remote();if(what==='missing')await db.settings.delete(APPEND_PACKET_PREFIX+bookId+':'+packets[0].key);
 if(what==='hash'){const changed=structuredClone(packets[0]);(changed.value as {chapters:Chapter[]}).chapters[0].text+='corrupt';await db.settings.put({key:APPEND_PACKET_PREFIX+bookId+':'+changed.key,value:changed});}
 if(what==='anchor')await db.chapters.update(preview.before.at(-1)!.id,{text:'Changed anchor'});
 if(what==='id')await db.chapters.add({...preview.staged[3],bookId:'other'});
 if(what==='base')await db.settings.put({key:`cloud-uploaded:https://test:${bookId}`,value:{sha256:'b'.repeat(64)}});
 if(what==='competing')await db.chapters.add({...chapter(3),id:'other-suffix'});
 const before=await readyChapters(bookId);await expect(apply(manifest)).rejects.toThrow();expect(await readyChapters(bookId)).toEqual(before);expect(await db.settings.get(APPEND_PREFIX+bookId+':'+manifest.key)).toBeUndefined();
});
it('multiple bounded packets are validated before the entire suffix becomes visible',async()=>{
 const added=Array.from({length:5},(_,i)=>({...chapter(i+3),id:uid(),sourceId:'new-source',text:'文'.repeat(128000)})),{packets,manifest}=await makeAppendRecords(bookId,preview.before,added,preview.source,baseSha);expect(packets.length).toBe(3);await discardAppendPreview(preview);
 for(const packet of packets.slice(0,2))await db.settings.put({key:APPEND_PACKET_PREFIX+bookId+':'+packet.key,value:packet});await expect(prepareAppendRecord(manifest)).rejects.toThrow('Chưa đủ');expect(await readyChapters(bookId)).toHaveLength(3);await db.settings.put({key:APPEND_PACKET_PREFIX+bookId+':'+packets[2].key,value:packets[2]});await apply(manifest);expect(await readyChapters(bookId)).toHaveLength(8);
});
it('schema rejects null, cross-book chapters, repeated IDs, forged totals and invalid source sizes',async()=>{
 const {packets,manifest}=await remote();for(const row of [packets[0],manifest])expect(()=>validateSharedRecord({...row,value:null})).toThrow();
 const p=structuredClone(packets[0]);(p.value as {chapters:Chapter[]}).chapters[0].bookId='elsewhere';expect(()=>validateSharedRecord(p)).toThrow();const m=structuredClone(manifest);(m.value as AppendManifest).count++;expect(()=>validateSharedRecord(m)).toThrow();const invalid=structuredClone(manifest);(invalid.value as AppendManifest).source.bytes=41*1024*1024;expect(()=>validateSharedRecord(invalid)).toThrow();
});
