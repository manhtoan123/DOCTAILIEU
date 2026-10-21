import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {buildCloudDeviceLink,CLOUD_DEVICE_TOKEN_KEY,connectCloudDeviceFromLocation,forgetCloudDevice,getCloudDeviceToken} from '../src/features/sync-cloud/services/cloud-device';
import {listCloudBooks,syncLocalBooks} from '../src/features/sync-cloud/services/cloud-client';

const origin='https://device.example.test',tokenA='a'.repeat(64),tokenB='b'.repeat(64);
const id='00000000-0000-4000-8000-000000000001';
const chapterId='00000000-0000-4000-8000-000000000002';
const ack=`cloud-uploaded:${origin}:${id}`,otherAck=`cloud-uploaded:https://other.example.test:${id}`;
let address:{origin:string;pathname:string;search:string;hash:string};
let replace:ReturnType<typeof vi.fn>;
function fragment(value:string){address.hash=value;}
beforeEach(async()=>{
 await db.delete();await db.open();address={origin,pathname:'/reader',search:'?view=convert',hash:''};
 replace=vi.fn((_state:unknown,_unused:string,url:string)=>{const parsed=new URL(url,origin);address.pathname=parsed.pathname;address.search=parsed.search;address.hash=parsed.hash;});
 vi.stubGlobal('location',address);vi.stubGlobal('history',{state:{reader:true},replaceState:replace});vi.stubGlobal('navigator',{storage:{estimate:async()=>({})}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function readyBook(){
 await db.books.put({id,title:'Synthetic 中文',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:2});
 await db.chapters.put({id:chapterId,bookId:id,order:0,title:'正文',text:'正文',revision:1,sourceId:'original'});
 await db.sources.put({id:'original',bookId:id,name:'source.txt',relativePath:'source.txt',encoding:'utf-8',sha256:'c'.repeat(64),bytes:6,blob:new Blob(['正文'])});
}
async function connect(token=tokenA){fragment(`#cloud-connect=${token}`);expect(await connectCloudDeviceFromLocation()).toBe(true);}
it('consumes a valid fragment synchronously before storage and saves only the validated token',async()=>{
 fragment(`#cloud-connect=${tokenA}`);const pending=connectCloudDeviceFromLocation();
 expect(address.hash).toBe('');expect(replace).toHaveBeenCalledWith({reader:true},'','/reader?view=convert');
 expect(await pending).toBe(true);expect(await getCloudDeviceToken()).toBe(tokenA);expect(await db.settings.count()).toBe(1);
});
it('rejects and strips malformed fragments with generic errors, preserving an existing connection',async()=>{
 await connect();
 for(const suffix of ['',`=${'A'.repeat(64)}`,`=${tokenA}extra`,`=${tokenA}&x=1`,`=${tokenA}\n`,'=invalid','=','=%61'.repeat(64)]){
  fragment(`#cloud-connect${suffix}`);let message='';try{await connectCloudDeviceFromLocation();}catch(error){message=(error as Error).message;}
  expect(address.hash).toBe('');expect(message).toBe('Liên kết kết nối thiết bị không hợp lệ.');expect(message).not.toContain(tokenA);expect(await getCloudDeviceToken()).toBe(tokenA);
 }
});
it('never accepts query credentials or consumes unrelated fragments',async()=>{
 address.search=`?cloud-connect=${tokenA}`;expect(await connectCloudDeviceFromLocation()).toBe(false);expect(await getCloudDeviceToken()).toBeUndefined();expect(replace).not.toHaveBeenCalled();
 fragment('#chapter-2');expect(await connectCloudDeviceFromLocation()).toBe(false);expect(address.hash).toBe('#chapter-2');
});
it('clears only current-origin ACKs when the token changes and preserves original source/user data',async()=>{
 await readyBook();await connect();await db.settings.bulkPut([{key:ack,value:{uploadedAt:1}},{key:otherAck,value:{uploadedAt:2}},{key:'convert-name-list',value:[{key:'名',value:'Tên'}]}]);
 await db.dictionaries.put({kind:'vp',name:'dictionary.txt',sha256:'d'.repeat(64),updatedAt:1,blob:new Blob(['正文=nội dung'])});
 const beforeBooks=await db.books.toArray(),beforeChapters=await db.chapters.toArray();await connect(tokenB);
 expect(await getCloudDeviceToken()).toBe(tokenB);expect(await db.settings.get(ack)).toBeUndefined();expect(await db.settings.get(otherAck)).toBeDefined();expect(await db.settings.get('convert-name-list')).toBeDefined();
 expect(await db.books.toArray()).toEqual(beforeBooks);expect(await db.chapters.toArray()).toEqual(beforeChapters);expect(await (await db.sources.get('original'))!.blob.text()).toBe('正文');expect(await db.dictionaries.count()).toBe(1);
});
it('same-token reconnection preserves ACKs; forget removes only token and this origin ACKs',async()=>{
 await connect();await db.settings.bulkPut([{key:ack,value:'kept'},{key:otherAck,value:'other'},{key:'reader-settings',value:{fontSize:22}}]);await connect();
 expect((await db.settings.get(ack))?.value).toBe('kept');await forgetCloudDevice();expect(await getCloudDeviceToken()).toBeUndefined();expect(await db.settings.get(ack)).toBeUndefined();expect(await db.settings.get(otherAck)).toBeDefined();expect(await db.settings.get('reader-settings')).toBeDefined();
});
it('storage failure strips the fragment and atomically rolls back token plus ACK clearing',async()=>{
 await connect();await db.settings.put({key:ack,value:'old'});vi.spyOn(db.settings,'put').mockRejectedValueOnce(new Error(`quota secret ${tokenB}`));fragment(`#cloud-connect=${tokenB}`);
 const pending=connectCloudDeviceFromLocation();expect(address.hash).toBe('');await expect(pending).rejects.toThrow('Không thể lưu kết nối thiết bị');expect(await getCloudDeviceToken()).toBe(tokenA);expect((await db.settings.get(ack))?.value).toBe('old');
});
it('validates saved tokens and device links without echoing invalid input',async()=>{
 for(const value of ['',42,tokenA.toUpperCase(),tokenA+' ',tokenA+'\n',null]){await db.settings.put({key:CLOUD_DEVICE_TOKEN_KEY,value});expect(await getCloudDeviceToken()).toBeUndefined();}
 expect(buildCloudDeviceLink(tokenA)).toBe(`${origin}/#cloud-connect=${tokenA}`);
 try{buildCloudDeviceLink(`bad-${tokenA}`);throw new Error('expected rejection');}catch(error){expect((error as Error).message).toBe('Liên kết kết nối thiết bị không hợp lệ.');}
});
it('adds bearer credentials to requests while preserving upload content headers and legacy transport options',async()=>{
 await readyBook();await connect();const calls:{path:string;init:RequestInit}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,init:RequestInit)=>{calls.push({path,init});return init.method==='PUT'?Response.json({id,sha256:new Headers(init.headers).get('X-Content-SHA256')}):Response.json({books:[],cursor:null});}));
 expect(await syncLocalBooks()).toBe(1);expect(calls.map(call=>call.path)).toEqual(['/api/cloud/books','/api/cloud/books?features=1',`/api/cloud/books/${id}`]);
 for(const call of calls){expect(new Headers(call.init.headers).get('Authorization')).toBe(`Bearer ${tokenA}`);expect(call.path).not.toContain(tokenA);expect(call.init.credentials).toBe('same-origin');expect(call.init.redirect).toBe('error');}
 const headers=new Headers(calls[2].init.headers);expect(headers.get('Content-Type')).toBe('application/json');expect(headers.get('X-Content-SHA256')).toMatch(/^[a-f0-9]{64}$/);expect(headers.get('X-Book-Title')).toBe(encodeURIComponent('Synthetic 中文'));expect(await db.settings.get(ack)).toBeDefined();expect(await (await db.sources.get('original'))!.blob.text()).toBe('正文');
});
it('missing-token requests preserve legacy behavior and use connection/R2 error messages without passwords',async()=>{
 for(const [status,message] of [[401,'Kết nối thiết bị với kho cloud để tiếp tục.'],[503,'Kho cloud chưa được cấu hình: cần hoàn tất thiết lập R2.']] as const){
  const fetch=vi.fn(async(_path:string,init:RequestInit)=>{expect(new Headers(init.headers).has('Authorization')).toBe(false);return Response.json({error:status===503?'cloud_not_configured':'closed'},{status});});vi.stubGlobal('fetch',fetch);
  await expect(listCloudBooks()).rejects.toThrow(message);expect(fetch).toHaveBeenCalledTimes(1);
 }
});
it.each(['cloud_unavailable','snapshot_unavailable','snapshot_publish_failed','unknown'])('does not mislabel %s as missing R2 or expose server details',async code=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:code,detail:tokenA},{status:503})));
 await expect(listCloudBooks()).rejects.toThrow('Kho cloud tạm thời không khả dụng. Hãy thử lại. Bản trên thiết bị vẫn được giữ.');
});
it.each(['<html>upstream failed</html>','null','{broken'])('handles non-object or malformed 503 bodies safely: %s',async body=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{status:503})));
 await expect(listCloudBooks()).rejects.toThrow('Kho cloud tạm thời không khả dụng.');
});
it.each(['storage_migration_required','parts_migration_required'])('identifies %s without blaming R2',async code=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:code},{status:503})));
 await expect(listCloudBooks()).rejects.toThrow('Kho cloud cần cập nhật cấu trúc lưu trữ.');
});
it('identifies unavailable cloud authentication separately',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'cloud_auth_unavailable'},{status:503})));
 await expect(listCloudBooks()).rejects.toThrow('Kết nối kho cloud chưa sẵn sàng.');
});
it('identifies exhausted daily D1 reads separately from missing R2',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'cloud_read_limit'},{status:503})));
 await expect(listCloudBooks()).rejects.toThrow('Kho cloud đã hết hạn mức đọc D1 hôm nay.');
});
it('rotation while a request is pending rejects old-account results and prevents upload or obsolete ACK writes',async()=>{
 await readyBook();await connect();let release!:(response:Response)=>void;
 const fetch=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal('fetch',fetch);
 const pending=syncLocalBooks(),rejected=expect(pending).rejects.toThrow('Kết nối kho cloud đã thay đổi');await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));await connect(tokenB);release(Response.json({books:[],cursor:null}));await rejected;
 expect(fetch).toHaveBeenCalledTimes(1);expect(await db.settings.get(ack)).toBeUndefined();expect(await db.books.count()).toBe(1);expect(await getCloudDeviceToken()).toBe(tokenB);
});
