import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ConvertCache, convertCache, convertCacheKey, effectiveConvertOptions, type CacheInputs} from '../src/features/names-convert/services/convert-cache';
import {db} from '../src/core/db';
import type {Token} from '../src/features/names-convert/services/language';
import * as client from '../src/features/names-convert/services/language-client';
import {CONVERT_NAMES_KEY} from '../src/features/names-convert/services/convert-names';

const caches: ConvertCache[]=[];
function cache(total=1800,entry=700){const value=new ConvertCache(`review-${crypto.randomUUID()}`,total,entry);caches.push(value);return value;}
function tokens(text:string,targetText='Converted'):Token[]{return [{sourceStart:0,sourceEnd:text.length,source:text,targetText,type:'original',hanviet:'',meanings:[]}];}
async function digest(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
const input:CacheInputs={text:'正文😀',options:{},globalNames:[{key:'正',value:'Main'}],bookNames:[{key:'文',value:'Text'}],dictionarySignature:'vp:hash:1:100'};
beforeEach(async()=>{client.resetLanguage();await convertCache.entries.clear();await db.delete();await db.open();ReviewWorker.instances=[];ReviewWorker.blockLoad=false;ReviewWorker.blockConvert=false;});
afterEach(async()=>{client.resetLanguage();vi.restoreAllMocks();vi.unstubAllGlobals();for(const value of caches.splice(0))await value.database.delete();});

describe('independent disposable Convert cache review',()=>{
  it('keys full source and every dictionary/name/options input while normalizing default options',async()=>{
    const original=await convertCacheKey(input);expect(original).toMatch(/^[a-f0-9]{64}$/);
    expect(await convertCacheKey({...input,options:effectiveConvertOptions()})).toBe(original);
    const variants:CacheInputs[]=[
      {...input,text:input.text+' '}, {...input,dictionarySignature:'vp:other:1:100'},
      {...input,dictionarySignature:'vp:hash:2:100'}, {...input,dictionarySignature:'vp:hash:1:101'},
      {...input,globalNames:[{key:'正',value:'Changed'}]}, {...input,bookNames:[{key:'文',value:'Changed'}]},
      ...(['reference','multipleMeanings','standardizePunctuation','capitalize']as const).map(key=>({...input,options:{[key]:!effectiveConvertOptions()[key]}})),
      {...input,options:{mode:'hanviet'}},
    ];
    for(const variant of variants)expect(await convertCacheKey(variant)).not.toBe(original);
    const ordered=[{key:'正',value:'First'},{key:'正',value:'Second'}];
    expect(await convertCacheKey({...input,bookNames:ordered})).not.toBe(await convertCacheKey({...input,bookNames:[...ordered].reverse()}));
  });
  it('preserves exact UTF16 provenance and rejects surrogate-splitting or gapped tokens',async()=>{
    const value=cache();const text='😀文';await value.put('valid',text,tokens(text));expect(await value.get('valid',text)).toEqual(tokens(text));
    const invalid=[{...tokens(text)[0],sourceEnd:1,source:text.slice(0,1)},{...tokens(text)[0],sourceStart:1,sourceEnd:3,source:text.slice(1)}];
    await value.put('surrogate',text,invalid);expect(await value.entries.get('surrogate')).toBeUndefined();
    await value.put('gap',text,[{...tokens(text)[0],sourceStart:2,source:'文'}]);expect(await value.entries.get('gap')).toBeUndefined();
    expect(await value.get('valid','different source')).toBeUndefined();
  });
  it('rejects altered payload even when its byte count remains equal, and schema-invalid payload with matching digest',async()=>{
    const value=cache();await value.put('corrupt','文',tokens('文'));
    const row=(await value.entries.get('corrupt'))!;
    await value.entries.update('corrupt',{payload:row.payload.replace('Converted','Corrupted')});
    expect(await value.get('corrupt','文')).toBeUndefined();expect(await value.entries.get('corrupt')).toBeUndefined();
    const payload=JSON.stringify([{...tokens('文')[0],sourceStart:1}]);
    await value.entries.put({...row,key:'shape',payload,digest:await digest(payload),bytes:new TextEncoder().encode(payload).length+256});
    expect(await value.get('shape','文')).toBeUndefined();
    await value.entries.put({...row,key:'version',version:999});expect(await value.get('version','文')).toBeUndefined();
  });
  it('evicts least recently used rows and caps concurrent writers atomically',async()=>{
    const value=cache(900,700);vi.spyOn(Date,'now').mockReturnValue(123);
    await value.put('a','文',tokens('文'));await value.put('b','文',tokens('文'));
    expect(await value.get('a','文')).toEqual(tokens('文'));await value.put('c','文',tokens('文'));
    expect(await value.entries.get('a')).toBeDefined();expect(await value.entries.get('b')).toBeUndefined();expect(await value.entries.get('c')).toBeDefined();
    await Promise.all(Array.from({length:20},(_,i)=>value.put(`concurrent-${i}`,'文',tokens('文'))));
    const rows=await value.entries.toArray();expect(rows.reduce((sum,row)=>sum+row.bytes,0)).toBeLessThanOrEqual(900);
    expect(rows.length).toBeLessThanOrEqual(2);
  });
  it('discards oversize entries and swallows quota/open/read failures without modifying library data',async()=>{
    const value=cache();await db.settings.put({key:'sentinel',value:{names:'keep'}});
    await value.put('large','文',tokens('文','x'.repeat(1000)));expect(await value.entries.count()).toBe(0);
    vi.spyOn(value.entries,'put').mockRejectedValue(new DOMException('quota','QuotaExceededError'));
    await expect(value.put('quota','文',tokens('文'))).resolves.toBeUndefined();
    vi.spyOn(value.entries,'get').mockRejectedValue(new Error('cache unavailable'));
    await expect(value.get('unavailable','文')).resolves.toBeUndefined();
    expect((await db.settings.get('sentinel'))?.value).toEqual({names:'keep'});expect(await db.books.count()).toBe(0);
    expect(value.database.name).not.toBe(db.name);
  });
});

type WorkerMessage={id:number;type:string;text?:string;names?:{key:string;value:string}[]};
class ReviewWorker extends EventTarget {
  static instances:ReviewWorker[]=[];static blockLoad=false;static blockConvert=false;
  messages:WorkerMessage[]=[];
  constructor(){super();ReviewWorker.instances.push(this);}
  postMessage(message:WorkerMessage){this.messages.push(message);if(message.type==='load'&&ReviewWorker.blockLoad||message.type==='convert'&&ReviewWorker.blockConvert)return;queueMicrotask(()=>this.reply(message));}
  reply(message=this.messages.at(-1)!){this.dispatchEvent(new MessageEvent('message',{data:{id:message.id,type:'result',result:message.type==='load'?[]:tokens(message.text!,message.names?.at(-1)?.value??'Default')}}));}
  terminate(){}
}
describe('independent Convert cache integration races',()=>{
  it('returns a real persisted hit before a blocked startup load, without another Worker convert',async()=>{
    vi.stubGlobal('Worker',ReviewWorker);expect(await client.convert('正文',[])).toEqual(tokens('正文','Default'));client.resetLanguage();
    ReviewWorker.blockLoad=true;const warm=client.loadDictionaries();const failure=expect(warm).rejects.toThrow('thay đổi');
    await vi.waitFor(()=>expect(ReviewWorker.instances).toHaveLength(2));
    expect(await client.convert('正文',[])).toEqual(tokens('正文','Default'));
    expect(ReviewWorker.instances[1].messages.map(message=>message.type)).toEqual(['load']);client.resetLanguage();await failure;
  });
  it('reset during asynchronous cache lookup rejects an otherwise valid stale hit',async()=>{
    vi.stubGlobal('Worker',ReviewWorker);await client.convert('正文',[]);client.resetLanguage();
    let release!:(value:Token[])=>void;vi.spyOn(convertCache,'get').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const conversion=client.convert('正文',[]);const failure=expect(conversion).rejects.toThrow('thay đổi');
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));client.resetLanguage();release(tokens('正文','Default'));await failure;
    expect(ReviewWorker.instances).toHaveLength(1);
  });
  it('global Name mutation during cache lookup discards the hit and converts current Names',async()=>{
    vi.stubGlobal('Worker',ReviewWorker);await client.convert('正文',[]);client.resetLanguage();
    const get=convertCache.get.bind(convertCache);
    vi.spyOn(convertCache,'get').mockImplementationOnce(async(key,text)=>{const hit=await get(key,text);await db.settings.put({key:CONVERT_NAMES_KEY,value:[{key:'正文',value:'Current Name'}]});return hit;});
    expect(await client.convert('正文',[])).toEqual(tokens('正文','Current Name'));
    expect(ReviewWorker.instances).toHaveLength(2);
  });
  it('dictionary mutation while worker result is pending rejects and never caches old result',async()=>{
    vi.stubGlobal('Worker',ReviewWorker);ReviewWorker.blockConvert=true;
    const conversion=client.convert('正文',[]);const failure=expect(conversion).rejects.toThrow('thay đổi');
    await vi.waitFor(()=>expect(ReviewWorker.instances[0]?.messages.at(-1)?.type).toBe('convert'));
    await db.dictionaries.put({kind:'vp',name:'new',blob:new Blob(['正文=new']),sha256:'different',updatedAt:5});
    ReviewWorker.instances[0].reply();await failure;expect(await convertCache.entries.count()).toBe(0);
  });
  it('global Name mutation during cache persistence cannot return obsolete tokens',async()=>{
    vi.stubGlobal('Worker',ReviewWorker);const put=convertCache.put.bind(convertCache);
    vi.spyOn(convertCache,'put').mockImplementationOnce(async(...args)=>{await db.settings.put({key:CONVERT_NAMES_KEY,value:[{key:'正文',value:'Changed during persistence'}]});await put(...args);});
    await expect(client.convert('正文',[])).rejects.toThrow('thay đổi');
  });
  it('rejects dictionary ABA when files sent to Worker differ from the cache-key snapshot',async()=>{
    vi.stubGlobal('Worker',ReviewWorker);
    const original={kind:'vp' as const,name:'A',blob:new Blob(['正文=A']),sha256:'hash-A',updatedAt:1};
    await db.dictionaries.put(original);
    const read=db.dictionaries.toArray.bind(db.dictionaries);let reads=0;
    vi.spyOn(db.dictionaries,'toArray').mockImplementation(()=>Dexie.Promise.resolve((async()=>{
      // Read 1 is initial cache identity, 2 the queued job identity, and 3
      // ensureLoaded's separate snapshot. Simulate another tab changing back.
      if(++reads!==3)return read();
      await db.dictionaries.put({...original,name:'B',blob:new Blob(['正文=B']),sha256:'hash-B',updatedAt:2});
      const loaded=await read();await db.dictionaries.put(original);return loaded;
    })()));
    await expect(client.convert('正文',[])).rejects.toThrow('thay đổi');
    expect(await convertCache.entries.count()).toBe(0);
  });
});
