import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {ConvertCache,CONVERT_CACHE_DB,CONVERT_CACHE_VERSION,convertCacheKey,effectiveConvertOptions,convertCacheMetrics,type CacheInputs} from '../src/features/names-convert/services/convert-cache';
import {LanguageEngine,type Token} from '../src/features/names-convert/services/language';

const text='张三，你好！😀\r\n中国。';
const engine=new LanguageEngine();engine.add('vp','你好=xin chào');engine.add('vp','中国=trung quốc');engine.add('hanviet','张=trương');
const names=[{key:'张三',value:'Trương Tam'}];
const tokens=engine.convert(text,names,effectiveConvertOptions());
const base:CacheInputs={text,options:{},globalNames:[],bookNames:names,dictionarySignature:'[["vp","abc",1,20]]'};
let cache:ConvertCache|undefined;
afterEach(async()=>{cache?.close();cache=undefined;await Dexie.delete('cache-test');await Dexie.delete(CONVERT_CACHE_DB);vi.restoreAllMocks();vi.unstubAllGlobals();});
it('persists exact Chinese conversion tokens and UTF16 source ranges across reopen',async()=>{
 cache=new ConvertCache('cache-test');const key=await convertCacheKey(base);expect(key).toHaveLength(64);await cache.put(key,text,tokens);cache.close();cache=new ConvertCache('cache-test');
 const hit=await cache.get(key,text);expect(hit).toEqual(tokens);expect(hit!.map(t=>t.targetText).join('')).toContain('Trương Tam');
 expect(hit!.map(t=>t.source).join('')).toBe(text);for(const token of hit!)expect(text.slice(token.sourceStart,token.sourceEnd)).toBe(token.source);
 expect(hit!.find(t=>t.source.includes('😀'))!.sourceEnd-hit!.find(t=>t.source.includes('😀'))!.sourceStart).toBeGreaterThanOrEqual(2);
});
it('invalidates every semantic input while canonical defaults share a key',async()=>{
 expect(CONVERT_CACHE_VERSION).toBe(3);
 const key=await convertCacheKey(base);expect(await convertCacheKey({...base,options:effectiveConvertOptions()})).toBe(key);
 const changes:CacheInputs[]=[{...base,text:text+' '},{...base,options:{mode:'hanviet'}},{...base,options:{capitalize:false}},{...base,options:{reference:false}},{...base,options:{multipleMeanings:true}},{...base,options:{standardizePunctuation:false}},{...base,globalNames:names},{...base,bookNames:[{key:'张三',value:'Tên mới'}]},{...base,bookNames:[{key:'李四',value:'Trương Tam'}]},{...base,dictionarySignature:'[["vp","changed",1,20]]'},{...base,dictionarySignature:'[["vp","abc",2,20]]'},{...base,dictionarySignature:'[["vp","abc",1,21]]'},{...base,dictionarySignature:'[["names","abc",1,20]]'}];
 for(const input of changes)expect(await convertCacheKey(input)).not.toBe(key);
 expect(await convertCacheKey({...base,bookNames:[...names,{key:'李四',value:'Lý Tứ'}]})).not.toBe(await convertCacheKey({...base,bookNames:[{key:'李四',value:'Lý Tứ'},...names]}));
 expect(await convertCacheKey({...base,text:'\ud800'})).not.toBe(await convertCacheKey({...base,text:'\ud801'}));
});
it('corrupt checksum, token provenance and old version all become cache misses',async()=>{
 cache=new ConvertCache('cache-test');const key=(await convertCacheKey(base))!;await cache.put(key,text,tokens);
 const original=(await cache.entries.get(key))!;await cache.entries.update(key,{payload:original.payload.replace('Trương','Wrong')});expect(await cache.get(key,text)).toBeUndefined();
 await cache.put(key,text,tokens);await cache.entries.update(key,{version:0});expect(await cache.get(key,text)).toBeUndefined();
 await cache.put(key,text,tokens);expect(await cache.get(key,text+' khác')).toBeUndefined();
 await cache.put(key,text,[{...tokens[0],sourceStart:1},...tokens.slice(1)]);expect(await cache.entries.count()).toBe(0);
});
it('quota and unavailable storage/hash degrade to normal misses without throwing',async()=>{
 cache=new ConvertCache('cache-test');const key=await convertCacheKey(base);
 vi.spyOn(cache.database,'transaction').mockRejectedValue(new DOMException('quota','QuotaExceededError'));await expect(cache.put(key,text,tokens)).resolves.toBeUndefined();expect(await cache.get(key,text)).toBeUndefined();
 vi.spyOn(cache.entries,'get').mockRejectedValue(new Error('storage disabled'));expect(await cache.get(key,text)).toBeUndefined();
 vi.stubGlobal('crypto',undefined);expect(await convertCacheKey(base)).toBeUndefined();
});
it('evicts least recently used rows and enforces per-entry/total byte bounds',async()=>{
 const size=new TextEncoder().encode(JSON.stringify(tokens)).byteLength+256;
 cache=new ConvertCache('cache-test',size*2,size);await cache.put('a',text,tokens);await cache.put('b',text,tokens);expect(await cache.get('a',text)).toEqual(tokens);await cache.put('c',text,tokens);
 expect(await cache.get('b',text)).toBeUndefined();expect(await cache.get('a',text)).toEqual(tokens);expect(await cache.get('c',text)).toEqual(tokens);
 const rows=await cache.entries.toArray();expect(rows.reduce((n,r)=>n+r.bytes,0)).toBeLessThanOrEqual(size*2);
 await cache.put('oversized',text,tokens.map(t=>({...t,targetText:t.targetText+'x'})));expect(await cache.entries.get('oversized')).toBeUndefined();
});

vi.mock('../src/core/db',()=>({db:{dictionaries:{toArray:vi.fn(async()=>[])},settings:{get:vi.fn(async()=>undefined)}}}));
class EngineWorker extends EventTarget {
 static instances:EngineWorker[]=[];static blockLoad=false;loads=0;conversions=0;
 constructor(){super();EngineWorker.instances.push(this);}
 postMessage(message:any){if(message.type==='load'){this.loads++;if(EngineWorker.blockLoad)return;}
 if(message.type==='convert')this.conversions++;
 queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:{id:message.id,type:'result',result:message.type==='load'?[]:engine.convert(message.text,message.names,message.options)}})));
 }
 terminate(){}
}
it('warm cache hit resolves while startup dictionary load remains blocked, with zero worker Convert calls',async()=>{
 EngineWorker.instances=[];EngineWorker.blockLoad=false;vi.stubGlobal('Worker',EngineWorker);
 const client=await import('../src/features/names-convert/services/language-client');client.resetLanguage();
 expect(await client.convert(text,names)).toEqual(tokens);expect(EngineWorker.instances[0].conversions).toBe(1);client.resetLanguage();
 EngineWorker.blockLoad=true;const warm=client.loadDictionaries();const warmRejected=expect(warm).rejects.toThrow('thay đổi');
 await vi.waitFor(()=>expect(EngineWorker.instances).toHaveLength(2));const start=performance.now(),hits=convertCacheMetrics.hits;
 expect(await client.convert(text,names)).toEqual(tokens);expect(EngineWorker.instances[1].loads).toBe(1);expect(EngineWorker.instances[1].conversions).toBe(0);expect(convertCacheMetrics.hits).toBe(hits+1);
 console.info(`Synthetic warm hit ${Math.round(performance.now()-start)} ms; blocked load bypassed; worker Convert 0`);
 client.resetLanguage();await warmRejected;EngineWorker.blockLoad=false;
});
