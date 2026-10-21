import {test,expect} from '@playwright/test';

test('1241 remote Names retain bytes and IDs with bounded replica writes',async({page},info)=>{
 const bookId='name-sync-fixture',rows:any[]=[];let revision=0,gets=0,puts=0;
 await page.route(/\/api\/state(?:\?|$)/,r=>{
  const request=r.request(),url=new URL(request.url());
  if(request.method()!=='GET'){puts++;return r.fulfill({status:503,json:{error:'fixture forbids writes'}});}
  const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);
  const pending=rows.filter(row=>(row.record.bookId??'')===scope&&row.revision>after),selected=pending.slice(0,99);
  if(scope===bookId)gets++;
  return r.fulfill({json:{rows:selected,cursor:pending.length>99?selected.at(-1).revision:revision,more:pending.length>99}});
 });
 // A module document provides a real origin/IndexedDB without mounting App's timers.
 await page.goto('/src/core/db.ts');
 rows.push(...await page.evaluate(async bookId=>{
  const {db}=await import('/src/core/db.ts');const {captureSharedRecords}=await import('/src/features/sync-cloud/services/shared-state-local.ts');const {sharedRecordId}=await import('/src/features/sync-cloud/services/shared-state-schema.ts');
  await db.books.put({id:bookId,title:'Synthetic Names',author:'',status:'ready',chapterCount:0,charCount:0,createdAt:1,updatedAt:1});
  await db.names.put({id:'stable-name-id',bookId,key:'名字0',value:'Tên 0'});
  const record=(await captureSharedRecords()).find(r=>r.kind==='book')!;
  const records=[record,...Array.from({length:1241},(_,i)=>({kind:'name' as const,bookId,key:'名字'+i,value:i===0?'Tên 0':`[i]https://archives.bulbagarden.net/media/upload/4/41/0423Gastrodon.png[/]Tên ${i}`}))];
  return Promise.all(records.map(async(record,i)=>({record,id:await sharedRecordId(record),revision:i+1})));
 },bookId));revision=rows.length;
 const result=await page.evaluate(async bookId=>{
  const {db}=await import('/src/core/db.ts');const {syncSharedState,sharedSyncStatus,SHARED_STATE_KEY}=await import('/src/features/sync-cloud/services/shared-state-sync.ts');const {liveQuery}=await import('/node_modules/.vite/deps/dexie.js');
  let writes=0;const counts:number[]=[];
  db.settings.hook('updating',(_mods,key)=>{if(key===SHARED_STATE_KEY)writes++;});
  db.settings.hook('creating',(_key,row)=>{if(row.key===SHARED_STATE_KEY)writes++;});
  const sub=liveQuery(()=>db.names.where('bookId').equals(bookId).count()).subscribe(n=>counts.push(n));
  const start=performance.now();await syncSharedState();const ms=Math.round(performance.now()-start);await new Promise(resolve=>setTimeout(resolve,50));sub.unsubscribe();
  const names=await db.names.where('bookId').equals(bookId).toArray();
  return {ms,writes,counts,status:sharedSyncStatus(),names};
 },bookId);
 expect(result.names).toHaveLength(1241);expect(result.names.find(n=>n.key==='名字0')?.id).toBe('stable-name-id');
 for(let i=1;i<1241;i++)expect(result.names.find(n=>n.key==='名字'+i)?.value).toBe(rows[i+1].record.value);
 expect(result.status.state).toBe('synced');expect(gets).toBe(13);expect(puts).toBe(0);
 expect(result.writes).toBeLessThanOrEqual(30);expect(result.counts.length).toBeLessThanOrEqual(15);
 console.log('NAME-SYNC-MEASURE '+JSON.stringify({project:info.project.name,ms:result.ms,writes:result.writes,updates:result.counts.length,gets,puts}));
});
