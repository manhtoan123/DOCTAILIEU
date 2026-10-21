import 'fake-indexeddb/auto';
import {createHash} from 'node:crypto';
import Dexie from 'dexie';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db,deleteBook} from '../src/core/db';
import {CLOUD_DEVICE_TOKEN_KEY} from '../src/features/sync-cloud/services/cloud-device';
import {downloadOriginal,listBookOriginals,syncBookOriginals} from '../src/features/sync-cloud/services/cloud-original-client';
import type {OriginalDescriptor} from '../src/features/sync-cloud/services/cloud-original-schema';

const book='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',source='00000000-0000-4000-8000-000000000010';
const bytes=new Uint8Array([255,254,87,0,0x2d,0x4e]);
const sha=createHash('sha256').update(bytes).digest('hex');
const descriptor:OriginalDescriptor={version:1,sourceId:source,name:'100%25 中.txt',relativePath:'Root/%2e%2e/100%25 中.txt',encoding:'utf-16le',sha256:sha,bytes:bytes.length};
const ack=`cloud-original-uploaded:https://example.test:${book}:${source}:${sha}`;
async function seed(id=book){await db.books.add({id,title:id,author:'',status:'ready',chapterCount:1,charCount:2,createdAt:1,updatedAt:1});}
async function sourceRow(){await seed();await db.sources.add({id:source,bookId:book,name:descriptor.name,relativePath:descriptor.relativePath,encoding:descriptor.encoding,sha256:sha,bytes:bytes.length,blob:new Blob([bytes])});await db.names.add({id:'name',bookId:book,key:'名',value:'Name'});}
function list(state='pending',value:unknown=descriptor){return Response.json({originals:[{descriptor:value,state,updatedAt:1}]});}
function empty(){return Response.json({originals:[]});}
function reserve(){return Response.json({descriptor,state:'pending'},{status:201});}
function ready(){return Response.json({sourceId:source,sha256:sha,state:'ready'},{status:201});}
function binary(value:Uint8Array=bytes,headers:Record<string,string>={}){return new Response(new Uint8Array(value),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'X-Content-SHA256':sha,...headers}});}
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('location',{origin:'https://example.test'});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('original cloud standalone client',()=>{
 it('uploads byte-exact UTF16 and literal percent provenance then ACKs without mutating user rows',async()=>{
  await sourceRow();const originals=await db.sources.toArray(),names=await db.names.toArray(),books=await db.books.toArray();
  const fetch=vi.fn(async(path:string,init?:RequestInit)=>{expect(path).not.toContain('%25');expect(init?.credentials).toBe('same-origin');expect(init?.redirect).toBe('error');expect(init?.signal).toBeInstanceOf(AbortSignal);expect(new Headers(init?.headers).get('Authorization')).toBeNull();
   if(init?.method==='POST'){expect(JSON.parse(init.body as string)).toEqual(descriptor);return reserve();}
   if(init?.method==='PUT'){expect(new Headers(init.headers).get('Content-Type')).toBe('application/octet-stream');expect(new Uint8Array(await (init.body as Blob).arrayBuffer())).toEqual(bytes);return ready();}return empty();});vi.stubGlobal('fetch',fetch);
  expect(await syncBookOriginals(book)).toBe(1);expect(fetch).toHaveBeenCalledTimes(3);expect(await db.settings.get(ack)).toBeDefined();expect(await db.books.toArray()).toEqual(books);expect(await db.names.toArray()).toEqual(names);expect((await db.sources.toArray())[0].sha256).toBe(originals[0].sha256);expect(new Uint8Array(await (await db.sources.get(source))!.blob.arrayBuffer())).toEqual(bytes);
 });
 it('acknowledges exact remote-ready descriptor without uploading or reserving',async()=>{await sourceRow();const fetch=vi.fn(async()=>list('ready'));vi.stubGlobal('fetch',fetch);expect(await syncBookOriginals(book)).toBe(1);expect(fetch).toHaveBeenCalledTimes(1);expect(await db.settings.get(ack)).toBeDefined();});
 it('reservation-ready exact descriptor also skips body upload',async()=>{await sourceRow();const fetch=vi.fn(async(_path:string,init?:RequestInit)=>init?.method?Response.json({descriptor,state:'ready'}):empty());vi.stubGlobal('fetch',fetch);expect(await syncBookOriginals(book)).toBe(1);expect(fetch).toHaveBeenCalledTimes(2);});
 it('hashes a source larger than one chunk without reading the whole Blob arrayBuffer',async()=>{
  await sourceRow();const large=new Uint8Array(2*1024*1024+17).fill(97),largeSha=createHash('sha256').update(large).digest('hex');await db.sources.update(source,{blob:new Blob([large]),bytes:large.length,sha256:largeSha});let largest=0;
  const originalArrayBuffer=Blob.prototype.arrayBuffer;vi.spyOn(Blob.prototype,'arrayBuffer').mockImplementation(function(this:Blob){largest=Math.max(largest,this.size);return originalArrayBuffer.call(this);});
  vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>!init?.method?empty():init.method==='POST'?Response.json({descriptor:JSON.parse(init.body as string),state:'pending'}):Response.json({sourceId:source,sha256:largeSha,state:'ready'})));expect(await syncBookOriginals(book)).toBe(1);expect(largest).toBeLessThanOrEqual(262144);expect(largest).toBeGreaterThan(0);
 });
 it('never uploads staging or missing/legacy empty sources',async()=>{
  await sourceRow();await db.books.update(book,{status:'staging'});const fetch=vi.fn(async()=>empty());vi.stubGlobal('fetch',fetch);await expect(syncBookOriginals(book)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();await db.books.update(book,{status:'ready'});
  await db.sources.update(source,{dataStatus:'missing'});expect(await syncBookOriginals(book)).toBe(0);await db.sources.update(source,{dataStatus:undefined,blob:new Blob([])});expect(await syncBookOriginals(book)).toBe(0);expect(await db.settings.get(ack)).toBeUndefined();
 });
 it.each(['hash','length','encoding'] as const)('rejects local %s corruption before POST/body/ACK',async kind=>{
  await sourceRow();await db.sources.update(source,kind==='hash'?{blob:new Blob([new Uint8Array(bytes.length)])}:kind==='length'?{bytes:bytes.length+1}:{encoding:'utf-99'});const fetch=vi.fn(async()=>empty());vi.stubGlobal('fetch',fetch);await expect(syncBookOriginals(book)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);expect(await db.settings.get(ack)).toBeUndefined();expect(await db.sources.count()).toBe(1);
 });
 it.each([401,409,410,503,507])('keeps local bytes and exposes sanitized HTTP %i error',async status=>{await sourceRow();vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'PRIVATE_SERVER_SECRET'},{status})));await expect(syncBookOriginals(book)).rejects.toThrow();expect(await db.settings.get(ack)).toBeUndefined();expect(new Uint8Array(await (await db.sources.get(source))!.blob.arrayBuffer())).toEqual(bytes);});
 it('retries whole file after HTTP failure without false ACK',async()=>{
  await sourceRow();let calls=0;vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>!init?.method?empty():init.method==='POST'?reserve():++calls===1?Response.json({error:'failure'},{status:500}):ready()));await expect(syncBookOriginals(book)).rejects.toThrow();expect(await db.settings.get(ack)).toBeUndefined();expect(await syncBookOriginals(book)).toBe(1);expect(calls).toBe(2);
 });
 it.each(['malformed','unknown-version','different'] as const)('rejects %s reservation descriptor without body/ACK',async mode=>{
  await sourceRow();const bad=mode==='malformed'?{...descriptor,extra:1}:mode==='unknown-version'?{...descriptor,version:2}:{...descriptor,name:'other.txt',relativePath:'other.txt'};const fetch=vi.fn(async(_path:string,init?:RequestInit)=>init?.method?Response.json({descriptor:bad,state:'pending'}):empty());vi.stubGlobal('fetch',fetch);await expect(syncBookOriginals(book)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(2);expect(await db.settings.get(ack)).toBeUndefined();
 });
 it('rejects malformed PUT ACK and remote descriptor conflict',async()=>{await sourceRow();vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>!init?.method?empty():init.method==='POST'?reserve():Response.json({sourceId:source,sha256:'0'.repeat(64),state:'ready'})));await expect(syncBookOriginals(book)).rejects.toThrow();expect(await db.settings.get(ack)).toBeUndefined();const fetch=vi.fn(async()=>list('ready',{...descriptor,sha256:'0'.repeat(64)}));vi.stubGlobal('fetch',fetch);await expect(syncBookOriginals(book)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);});
 it('fresh locked ACK digest detects same-size Blob replacement while preserving replacement bytes',async()=>{
  await sourceRow();const replacement=new Uint8Array(bytes.length).fill(88);vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{if(!init?.method)return empty();if(init.method==='POST')return reserve();await db.sources.update(source,{blob:new Blob([replacement])});return ready();}));await expect(syncBookOriginals(book)).rejects.toThrow();expect(await db.settings.get(ack)).toBeUndefined();expect(new Uint8Array(await (await db.sources.get(source))!.blob.arrayBuffer())).toEqual(replacement);expect((await db.sources.get(source))!.sha256).toBe(sha);
 });
 it('native IndexedDB abort during pending ACK digest rolls back, unlocks queue and rejects late hash',async()=>{
  // fake-indexeddb unit exercises native idbtrans.abort/event ordering, not a
  // browser-device claim. Real browser integration remains a separate gate.
  await sourceRow();let block=false,lateResolve:((value:ArrayBuffer)=>void)|undefined;
  const originalBuffer=Blob.prototype.arrayBuffer,bufferSpy=vi.spyOn(Blob.prototype,'arrayBuffer').mockImplementation(function(this:Blob){return block?new Promise<ArrayBuffer>(resolve=>{lateResolve=resolve;}):originalBuffer.call(this);});
  const originalWait= Dexie.waitFor,waitSpy=vi.spyOn(Dexie,'waitFor').mockImplementation((operation,timeout)=>{const transaction=Dexie.currentTransaction!;setTimeout(()=>transaction.idbtrans.abort(),0);return originalWait(operation,timeout);});
  vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{if(!init?.method)return empty();if(init.method==='POST')return reserve();block=true;return ready();}));
  await expect(syncBookOriginals(book)).rejects.toThrow(/hủy|abort/i);expect(await db.settings.get(ack)).toBeUndefined();expect(await db.sources.count()).toBe(1);
  await db.settings.put({key:'unrelated-after-native-abort',value:'retained'});expect((await db.settings.get('unrelated-after-native-abort'))?.value).toBe('retained');
  waitSpy.mockRestore();bufferSpy.mockRestore();block=false;lateResolve?.(bytes.slice().buffer);
  await db.settings.put({key:'after-late-hash',value:true});expect(await db.settings.get(ack)).toBeUndefined();
  vi.stubGlobal('fetch',vi.fn(async()=>list('ready')));expect(await syncBookOriginals(book)).toBe(1);expect(await db.settings.get(ack)).toBeDefined();expect(new Uint8Array(await (await db.sources.get(source))!.blob.arrayBuffer())).toEqual(bytes);
 });
 it.each(['delete','metadata','missing','token','tombstone'] as const)('blocks late ACK after %s mutation',async mode=>{
  await sourceRow();vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{if(!init?.method)return empty();if(init.method==='POST')return reserve();if(mode==='delete')await deleteBook(book);if(mode==='metadata')await db.sources.update(source,{relativePath:'changed/'+descriptor.name});if(mode==='missing')await db.sources.update(source,{dataStatus:'missing'});if(mode==='token')await db.settings.put({key:CLOUD_DEVICE_TOKEN_KEY,value:'b'.repeat(64)});if(mode==='tombstone')await db.settings.put({key:`cloud-deleted:https://example.test:${book}`,value:true});return ready();}));
  await expect(syncBookOriginals(book)).rejects.toThrow();expect(await db.settings.get(ack)).toBeUndefined();
 });
 it('processes sources sequentially and preserves unrelated books and settings',async()=>{
  await sourceRow();await seed(other);await db.sources.add({...((await db.sources.get(source))!),id:'00000000-0000-4000-8000-000000000011'});await db.settings.put({key:'ai-book-settings:'+other,value:{userPrompt:'untouched'}});let active=0,max=0;
  vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,1));active--;if(!init?.method)return empty();if(init.method==='POST')return Response.json({descriptor:JSON.parse(init.body as string),state:'pending'});return Response.json({sourceId:path.split('/').at(-2),sha256:sha,state:'ready'});}));
  expect(await Promise.all([syncBookOriginals(book),syncBookOriginals(book)])).toEqual([2,2]);expect(max).toBe(1);expect((await db.books.get(other))?.title).toBe(other);expect((await db.settings.get('ai-book-settings:'+other))?.value).toEqual({userPrompt:'untouched'});
 });
 it('supports optional legacy token in headers with no token in URLs',async()=>{await db.settings.put({key:CLOUD_DEVICE_TOKEN_KEY,value:'a'.repeat(64)});vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{expect(path).not.toContain('a'.repeat(64));expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer '+'a'.repeat(64));return empty();}));expect(await listBookOriginals(book)).toEqual([]);});
 it.each(['duplicate','state','version','count','overflow','truncated-json'] as const)('rejects bounded list %s',async mode=>{
  vi.stubGlobal('fetch',vi.fn(async()=>mode==='duplicate'?Response.json({originals:[{descriptor,state:'ready',updatedAt:1},{descriptor,state:'ready',updatedAt:1}]}):mode==='state'?list('bogus'):mode==='version'?list('ready',{...descriptor,version:2}):mode==='count'?Response.json({originals:Array(101).fill({descriptor,state:'ready',updatedAt:1})}):mode==='overflow'?new Response(' '.repeat(2*1024*1024+1),{headers:{'Content-Type':'application/json'}}):new Response('{',{headers:{'Content-Type':'application/json'}})));await expect(listBookOriginals(book)).rejects.toThrow();
 });
 it('downloads verified byte-exact Blob without writing source/book/ACK',async()=>{
  const fetch=vi.fn(async(path:string)=>path.endsWith('/data')?binary():list('ready'));vi.stubGlobal('fetch',fetch);const result=await downloadOriginal(book,source);expect(result.descriptor).toEqual(descriptor);expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);expect(await db.books.count()).toBe(0);expect(await db.sources.count()).toBe(0);expect(await db.settings.count()).toBe(0);
 });
 it.each(['header-hash','header-size','content-type','truncated','oversize','hash'] as const)('rejects download %s before exposing bytes',async mode=>{
  const headers:Record<string,string>=mode==='header-hash'?{'X-Content-SHA256':'0'.repeat(64)}:mode==='header-size'?{'Content-Length':'9'}:mode==='content-type'?{'Content-Type':'text/html'}:{};const value=mode==='truncated'?bytes.slice(1):mode==='oversize'?new Uint8Array(bytes.length+1):mode==='hash'?new Uint8Array(bytes.length):bytes;
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>path.endsWith('/data')?binary(value,headers):list('ready')));await expect(downloadOriginal(book,source)).rejects.toThrow();expect(await db.sources.count()).toBe(0);expect(await db.settings.count()).toBe(0);
 });
 it.each(['delete','token','source'] as const)('blocks downstream verified Blob after late %s change',async mode=>{
  await sourceRow();vi.stubGlobal('fetch',vi.fn(async(path:string)=>{if(!path.endsWith('/data'))return list('ready');if(mode==='delete')await deleteBook(book);if(mode==='token')await db.settings.put({key:CLOUD_DEVICE_TOKEN_KEY,value:'a'.repeat(64)});if(mode==='source')await db.sources.update(source,{bytes:8});return binary();}));await expect(downloadOriginal(book,source)).rejects.toThrow();expect(await db.settings.get(ack)).toBeUndefined();
 });
 it('checks local deletion again after streamed download body finishes',async()=>{
  await sourceRow();vi.stubGlobal('fetch',vi.fn(async(path:string)=>{if(!path.endsWith('/data'))return list('ready');let sent=false;return new Response(new ReadableStream<Uint8Array>({async pull(controller){if(!sent){sent=true;controller.enqueue(bytes);}else{await deleteBook(book);controller.close();}}}),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'X-Content-SHA256':sha}});}));await expect(downloadOriginal(book,source)).rejects.toThrow();expect(await db.sources.count()).toBe(0);expect(await db.settings.get(ack)).toBeUndefined();
 });
 it.each(['list','data'] as const)('keeps the same120s deadline through a stalled %s body and cancels it',async phase=>{
  const controllers:AbortController[]=[];let cancelled=false;
  vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{expect(ms).toBe(120000);const controller=new AbortController();controllers.push(controller);return controller.signal;});
  const stalled=()=>new ReadableStream<Uint8Array>({pull(){controllers.at(-1)!.abort();},cancel(){cancelled=true;}},{highWaterMark:0});
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>phase==='list'?new Response(stalled(),{headers:{'Content-Type':'application/json'}}):path.endsWith('/data')?new Response(stalled(),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'X-Content-SHA256':sha}}):list('ready')));
  await expect(phase==='list'?listBookOriginals(book):downloadOriginal(book,source)).rejects.toThrow('quá thời gian');expect(cancelled).toBe(true);expect(await db.settings.count()).toBe(0);expect(await db.sources.count()).toBe(0);
 });
 it('rejects pending/missing source and invalid IDs before body or request',async()=>{const fetch=vi.fn(async()=>list('pending'));vi.stubGlobal('fetch',fetch);await expect(downloadOriginal(book,source)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);await expect(downloadOriginal('invalid',source)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);});
});
