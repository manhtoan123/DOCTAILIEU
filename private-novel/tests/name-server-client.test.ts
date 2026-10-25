import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {LanguageEngine} from '../src/features/names-convert/services/language';
import {convertNameOnServer} from '../src/features/names-convert/services/name-server-client';
let version='',posts=0;
const engine=new LanguageEngine();engine.add('vp','林儿=Lâm Nhi');
beforeEach(async()=>{await db.delete();await db.open();version=crypto.randomUUID();posts=0;await db.dictionaries.put({kind:'vp',name:'vp',sha256:'a'.repeat(64),blob:new Blob(['林儿=Lâm Nhi']),updatedAt:1});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function mock(change?:(result:any)=>void|Promise<void>){vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init?:RequestInit)=>{
 if(init?.method!=='POST')return Response.json({version,dictionaries:[{kind:'vp',sha256:'a'.repeat(64)}]});
 posts++;const {text,names}=JSON.parse(String(init.body)),tokens=engine.convert(text,names,{reference:true,standardizePunctuation:true,capitalize:true});const result={version,tokens,lookup:engine.lookup(text),lookups:tokens.filter(t=>t.source.trim()).map(t=>({source:t.source,...engine.lookup(t.source)}))};await change?.(result);return Response.json(result);
}));}
it('converts and looks up without reading dictionary Blob or starting a language Worker; caches privately',async()=>{
 mock();const blob=vi.spyOn(Blob.prototype,'arrayBuffer');vi.stubGlobal('Worker',vi.fn(()=>{throw Error('must not load language worker');}));
 const first=await convertNameOnServer('林儿🙂',[{key:'$林儿',value:'Tiểu Lâm'}]);expect(first.tokens.map(t=>t.targetText).join('')).toContain('Tiểu Lâm');expect(blob).not.toHaveBeenCalled();expect(posts).toBe(1);
 first.tokens[0].targetText='mutated';const again=await convertNameOnServer('林儿🙂',[{key:'$林儿',value:'Tiểu Lâm'}]);expect(posts).toBe(1);expect(again.tokens[0].targetText).not.toBe('mutated');
});
it('rejects a different chosen dictionary before POST, preserving local data',async()=>{mock();await db.dictionaries.update('vp',{sha256:'b'.repeat(64)});await expect(convertNameOnServer('林儿',[])).rejects.toThrow(/khác bản/);expect(posts).toBe(0);expect((await db.dictionaries.get('vp'))?.sha256).toBe('b'.repeat(64));});
it('rejects wrong ranges, incomplete coverage, Unicode splits and corrupted lookup arrays',async()=>{
 const edits=[(r:any)=>{r.tokens[0].sourceEnd=999;},(r:any)=>{r.tokens=[];r.lookups=[];},(r:any)=>{r.tokens[0].sourceStart=1;},(r:any)=>{r.lookups[0].meanings=[12];}];
 for(const [index,edit]of edits.entries()){mock(edit);await expect(convertNameOnServer(`🙂林儿${index}`,[])).rejects.toThrow();}
});
it('discards aborted and dictionary/Name-changed responses instead of caching them',async()=>{
 const controller=new AbortController();mock(()=>{controller.abort();});await expect(convertNameOnServer('林儿取消',[],controller.signal)).rejects.toThrow();
 mock(async()=>{await db.settings.put({key:'convert-name-list',value:[{key:'林儿',value:'Tên mới'}]});await db.dictionaries.update('vp',{updatedAt:2,sha256:'b'.repeat(64)});});
 await expect(convertNameOnServer('林儿 thay đổi',[])).rejects.toThrow(/thay đổi/);
});
it('discards a global Name change even when dictionary files stay unchanged',async()=>{
 mock(async()=>{await db.settings.put({key:'convert-name-list',value:[{key:'林儿',value:'Tên mới'}]});});
 await expect(convertNameOnServer('林儿 đổi tên',[])).rejects.toThrow(/thay đổi/);
 mock();await convertNameOnServer('林儿 đổi tên',[]);expect(posts).toBe(2);
});
it('rejects malformed or duplicate dictionary descriptors before POST',async()=>{
 for(const dictionaries of [[null],[{kind:'unknown',sha256:'a'.repeat(64)}],[{kind:'vp',sha256:'abc'}],[{kind:'vp',sha256:'a'.repeat(64)},{kind:'vp',sha256:'b'.repeat(64)}]]){
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({version,dictionaries})));
  await expect(convertNameOnServer('林儿',[])).rejects.toThrow(/Phiên bản/);
 }
});
it('rejects a source longer than the production excerpt budget without a request',async()=>{
 mock();await expect(convertNameOnServer('甲'.repeat(257),[])).rejects.toThrow(/giới hạn/);expect(fetch).not.toHaveBeenCalled();
});
it('keeps the paragraph and expanded-word lookup requests in separate cache entries',async()=>{
 mock();await convertNameOnServer('林儿',[]);await convertNameOnServer('林儿',[],undefined,true);expect(posts).toBe(2);
 const bodies=vi.mocked(fetch).mock.calls.map(call=>call[1]).filter(init=>init?.method==='POST').map(init=>JSON.parse(String(init?.body)));
 expect(bodies.map(body=>body.includeLookup)).toEqual([false,true]);
});
