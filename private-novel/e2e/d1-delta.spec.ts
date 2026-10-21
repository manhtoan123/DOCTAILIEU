import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';

const id=(i:number)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
type RecordValue={kind:string;bookId?:string;key:string;value:unknown};
function ledger(){return {revision:0,rows:new Map<string,{id:string;revision:number;record:RecordValue}>(),reads:[] as {head:boolean;changes:boolean;scope:string}[]};}
function remote(store:ReturnType<typeof ledger>,record:RecordValue){const key=createHash('sha256').update(JSON.stringify([record.kind,record.bookId??'',record.key])).digest('hex');const row={id:key,revision:++store.revision,record};store.rows.set(key,row);return row;}
async function connect(context:BrowserContext,store:ReturnType<typeof ledger>){
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/state'){
   if(request.method()==='PUT'){
    const input=request.postDataJSON(),old=store.rows.get(input.id);
    if((old?.revision??0)!==input.baseRevision)return route.fulfill({status:409,json:{row:old}});
    return route.fulfill({json:{row:remote(store,input.record)}});
   }
   const head=url.searchParams.has('head'),changes=url.searchParams.has('changes'),scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);
   store.reads.push({head,changes,scope});
   if(head)return route.fulfill({json:{changesV1:true,revision:store.revision}});
   if(changes){const until=Number(url.searchParams.get('until')),rows=[...store.rows.values()].filter(r=>r.revision>after&&r.revision<=until).sort((a,b)=>a.revision-b.revision).slice(0,100),more=rows.length===100;return route.fulfill({json:{changesV1:true,revision:until,changes:rows.map(r=>({scope:r.record.bookId??'',revision:r.revision})),more,cursor:more?rows.at(-1)!.revision:until}});}
   const rows=[...store.rows.values()].filter(r=>(r.record.bookId??'')===scope&&r.revision>after).sort((a,b)=>a.revision-b.revision).slice(0,99),more=rows.length===99;
   return route.fulfill({json:{rows,more,cursor:more?rows.at(-1)!.revision:store.revision}});
  }
  if(url.pathname==='/api/prompts')return route.fulfill({json:{revision:0,rows:[]}});
  if(url.pathname.startsWith('/api/cloud/'))return route.fulfill({json:{books:[],ids:[],cursor:null,version:1,dictionaries:[]}});
  return route.fulfill({status:503,json:{error:'isolated_fixture'}});
 });
}
async function sync(page:Page){await page.evaluate(async()=>{const {syncSharedState}=await import('/src/features/sync-cloud/services/shared-state-sync.ts');await syncSharedState();await syncSharedState();});}
async function seed(page:Page){
 await page.goto('/phong-toi');
 await page.evaluate(async()=>{
  const {db}=await import('/src/core/db.ts');
  const books=Array.from({length:144},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,title:'Truyện '+i,author:'Tác giả',album:'Tác giả/Series',status:'ready' as const,chapterCount:0,charCount:0,createdAt:1,updatedAt:1}));
  await db.books.bulkPut(books);await db.settings.bulkPut(books.map(book=>({key:`cloud-uploaded:${location.origin}:${book.id}`,value:{sha256:'a'.repeat(64)}})));
 });await sync(page);
}
test('144 books: idle head only, two devices receive just the changed scope, reload keeps the checkpoint',async({page,browser})=>{
 const store=ledger(),otherContext=await browser.newContext({viewport:page.viewportSize()!});
 try{
  await connect(page.context(),store);await connect(otherContext,store);await seed(page);const other=await otherContext.newPage();await seed(other);await sync(page);await sync(other);
  const before=await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.books.toArray();});
  store.reads=[];await sync(page);await sync(other);expect(store.reads.some(r=>!r.head)).toBe(false);expect(store.reads.filter(r=>r.head).length).toBeGreaterThanOrEqual(2);
  remote(store,{kind:'name',bookId:id(37),key:'甲',value:'Tên đồng bộ'});store.reads=[];
  await sync(page);await sync(other);
  const scopes=new Set(store.reads.filter(r=>!r.head&&!r.changes).map(r=>r.scope));expect([...scopes]).toEqual([id(37)]);
  for(const device of [page,other])expect(await device.evaluate(async bookId=>{const {db}=await import('/src/core/db.ts');return (await db.names.where('bookId').equals(bookId).first())?.value;},id(37))).toBe('Tên đồng bộ');
  expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.books.toArray();})).toEqual(before);
  store.reads=[];await page.reload();await sync(page);expect(store.reads.some(r=>!r.head)).toBe(false);
  await expect(page.getByRole('region',{name:'Danh sách Album'})).toBeVisible();expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.books.count();})).toBe(144);
 }finally{await otherContext.close();}
});
