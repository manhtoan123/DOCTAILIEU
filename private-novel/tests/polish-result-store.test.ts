import 'fake-indexeddb/auto';
import {it,expect,afterEach} from 'vitest';
import {db} from '../src/core/db';
import {writePolishResult,writePolishTerms,clearPolishChapter,adoptLegacyPolish} from '../src/features/ai/services/polish-result-store';
afterEach(async()=>{await db.settings.clear();});
it('keeps committed progress but refuses the next queued write after Stop',async()=>{
 const controller=new AbortController();await writePolishResult('polish-fixture',{part:1},controller.signal);
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const queued=gate.then(()=>writePolishResult('polish-fixture',{part:2},controller.signal));const rejected=expect(queued).rejects.toMatchObject({name:'AbortError'});
 controller.abort();release();await rejected;expect((await db.settings.get('polish-fixture'))?.value).toEqual({part:1});
});
it('aborts an in-flight write before native commit',async()=>{
 const controller=new AbortController(),abort=()=>{controller.abort();};db.settings.hook('creating',abort);
 try{await expect(writePolishResult('polish-fixture',{part:1},controller.signal)).rejects.toBeDefined();expect(await db.settings.get('polish-fixture')).toBeUndefined();}finally{db.settings.hook('creating').unsubscribe(abort);}
});
it('clears all known polish variants of one chapter, retaining unrelated data and unknown formats',async()=>{
 const hash='a'.repeat(64),key=`convert-polish:v1:chapter:1:${hash}`,other=`convert-polish:v1:other:1:${hash}`;
 const rows=[{key,value:{version:3,text:'partial'}},{key:`convert-polish:v1:chapter:2:${hash}`,value:{version:2,text:'complete'}},{key:other,value:{version:3,text:'keep'}},{key:'convert-polish-prompt:v1',value:'my prompt'},{key:'convert-polish-options:v1',value:{splitParts:true}},{key:'ai-reading-cache:keep',value:{text:'keep'}},{key:`convert-polish:v1:chapter:1:2:${hash}`,value:{version:3,text:'different chapter id'}},{key:`convert-polish:v1:chapter:3:${hash}`,value:{version:99,text:'future format'}}];
 await db.settings.bulkPut(rows);expect(await clearPolishChapter('chapter')).toBe(2);
 expect(await db.settings.get(key)).toBeUndefined();expect(await db.settings.count()).toBe(rows.length-2);expect((await db.settings.get(other))?.value).toEqual({version:3,text:'keep'});
});
it('a stopped queued writer cannot recreate the cache after clearing',async()=>{
 const controller=new AbortController(),key=`convert-polish:v1:chapter:1:${'a'.repeat(64)}`;
 await writePolishResult(key,{version:3,text:'partial'},controller.signal);controller.abort();await clearPolishChapter('chapter');
 await expect(writePolishResult(key,{version:2,text:'late'},controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(await db.settings.get(key)).toBeUndefined();
});
it('stores terms without applying prose and merges them into an existing result',async()=>{
 const key=`convert-polish:v1:chapter:1:${'b'.repeat(64)}`,controller=new AbortController();
 const flower={convert:'hoa viên',source:'花园',meaning:'vườn hoa'},morning={convert:'thanh thần',source:'清晨',meaning:'sáng sớm'};
 await writePolishTerms(key,[flower],'model',controller.signal);
 expect((await db.settings.get(key))?.value).toMatchObject({version:4,applied:false,text:'',terms:[flower]});
 await writePolishResult(key,{version:4,applied:true,text:'Đã sửa.',terms:[flower]},controller.signal);
 await writePolishTerms(key,[morning,flower],'model',controller.signal);
 expect((await db.settings.get(key))?.value).toMatchObject({applied:true,text:'Đã sửa.',terms:expect.arrayContaining([flower,morning])});
 controller.abort();expect(await clearPolishChapter('chapter')).toBe(1);
 await expect(writePolishTerms(key,[flower],'model',controller.signal)).rejects.toMatchObject({name:'AbortError'});
 expect(await db.settings.get(key)).toBeUndefined();
});

it('adopts exact legacy partial without losing its accepted prefix or overwriting a newer run',async()=>{
 const pairs=[{start:0,end:3,original:'甲。',converted:'An.'},{start:3,end:8,original:'乙。',converted:'Bình.'}],legacyKey='exact-legacy',key=`convert-polish:v1:c:1:${'b'.repeat(64)}`,signal=new AbortController().signal;
 await db.settings.put({key:legacyKey,value:{version:3,applied:true,partial:true,sourceEnd:3,text:'Đầu.Bình.'}});
 await adoptLegacyPolish(key,legacyKey,'An.Bình.',pairs,signal);
 expect((await db.settings.get(key))?.value).toMatchObject({version:4,text:'Đầu.Bình.',prefix:'Đầu.',originalEnd:2});expect(await db.settings.get(legacyKey)).toBeDefined();
 await db.settings.put({key,value:{version:4,applied:true,text:'Mới hơn.'}});await adoptLegacyPolish(key,legacyKey,'An.Bình.',pairs,signal);expect((await db.settings.get(key))?.value).toMatchObject({text:'Mới hơn.'});
 expect(await clearPolishChapter('c')).toBe(1);expect(await db.settings.get(key)).toBeUndefined();
});
it('does not adopt an unproven legacy suffix or an aborted request',async()=>{
 const controller=new AbortController();await db.settings.put({key:'legacy',value:{version:3,applied:true,partial:true,sourceEnd:2,text:'Unrelated'}});
 await adoptLegacyPolish('new','legacy','An.Bình.',[],controller.signal);expect(await db.settings.get('new')).toBeUndefined();controller.abort();await expect(adoptLegacyPolish('new','legacy','An.Bình.',[],controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
