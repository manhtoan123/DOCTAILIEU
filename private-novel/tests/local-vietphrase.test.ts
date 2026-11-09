import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {convertCache} from '../src/features/names-convert/services/convert-cache';
import {convertAndLookup,convertLocal,localDictionarySignature,resetLanguage} from '../src/features/names-convert/services/language-client';
import {readLocalVietphrase,saveLocalVietphrase,saveLocalVietphrases} from '../src/features/names-convert/services/local-vietphrase';

beforeEach(async()=>{
  await db.settings.clear();
  await db.dictionaries.clear();
  await convertCache.entries.clear();
  vi.stubGlobal('localStorage',{getItem:()=> 'local'});
});
afterEach(()=>{
  resetLanguage();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('upserts a bounded local override atomically without losing other tabs’ entries',async()=>{
  expect(await localDictionarySignature()).toBe('[]');
  await Promise.all([saveLocalVietphrase('江湖','giang hồ'),saveLocalVietphrase('武功','võ công')]);
  const before=await readLocalVietphrase();
  expect(before.entries).toEqual(expect.arrayContaining([{key:'江湖',value:'giang hồ'},{key:'武功',value:'võ công'}]));
  await saveLocalVietphrase('江湖','giang hồ');
  expect(await readLocalVietphrase()).toEqual(before);
  await expect(saveLocalVietphrase('江湖','nhiều\ndòng')).rejects.toThrow('trên một dòng');
  await expect(saveLocalVietphrase('江湖=','từ')).rejects.toThrow('chữ Hán');
  await expect(saveLocalVietphrase('江湖','a'.repeat(2049))).rejects.toThrow('2.048');
  vi.spyOn(db.settings,'put').mockRejectedValueOnce(new DOMException('quota','QuotaExceededError'));
  await expect(saveLocalVietphrase('江湖','nghĩa mới')).rejects.toThrow('quota');
  vi.stubGlobal('localStorage',{getItem:()=> 'server'});
  await expect(saveLocalVietphrase('江湖','nghĩa mới')).rejects.toThrow('trên thiết bị này');
  expect(await readLocalVietphrase()).toEqual(before);
});

it('saves a selected group in one update or leaves every entry intact',async()=>{
  await saveLocalVietphrases([{key:'江湖',value:'giang hồ'},{key:'武功',value:'võ công'}]);
  const before=await readLocalVietphrase();
  expect(before.entries).toEqual([{key:'江湖',value:'giang hồ'},{key:'武功',value:'võ công'}]);
  await expect(saveLocalVietphrases([{key:'江湖',value:'võ lâm'},{key:'山河',value:'nhiều\ndòng'}])).rejects.toThrow('trên một dòng');
  await expect(saveLocalVietphrases([{key:'江湖',value:'võ lâm'},{key:'江湖',value:'giang hồ'}])).rejects.toThrow('chỉ chọn một nghĩa');
  expect(await readLocalVietphrase()).toEqual(before);
});

it('uses the revised Vietphrase in real worker conversion and lookup while preserving Name and the original TXT',async()=>{
  const blob=new Blob(['江湖=nghĩa gốc\n武功=võ công']);
  await db.dictionaries.put({kind:'vp',blob,name:'VietPhrase.txt',sha256:'original',updatedAt:1});
  type WorkerRequest={id:number;type:string};
  let currentWorker:LocalWorker;
  const workerScope={
    onmessage:undefined as ((e:MessageEvent)=>Promise<void>)|undefined,
    postMessage(data:unknown){currentWorker.dispatchEvent(new MessageEvent('message',{data}));},
  };
  const messages:string[]=[];
  class LocalWorker extends EventTarget {
    constructor(){super();currentWorker=this;}
    postMessage(data:WorkerRequest){messages.push(data.type);void workerScope.onmessage?.(new MessageEvent('message',{data}));}
    terminate(){}
  }
  vi.stubGlobal('self',workerScope);
  vi.stubGlobal('Worker',LocalWorker);
  await import('../src/workers/language.worker');
  const source='江湖';
  const options={capitalize:false};
  const first=await convertLocal(source,[],options);
  expect(first[0]).toMatchObject({source,sourceStart:0,sourceEnd:2,targetText:'nghĩa gốc'});
  expect(await convertLocal(source,[],options)).toEqual(first);
  expect(messages).toEqual(['load','convert']);
  await saveLocalVietphrase(source,'giới võ lâm');
  const [lookup,tokens]=await convertAndLookup(source,[],new AbortController().signal);
  expect(lookup.meanings).toEqual(['giới võ lâm']);
  expect(tokens[0]).toMatchObject({source,sourceStart:0,sourceEnd:2,targetText:'giới võ lâm',type:'vp'});
  expect((await convertLocal(source,[{key:source,value:'Tên riêng'}],options))[0]).toMatchObject({targetText:'Tên riêng',type:'name'});
  expect((await convertLocal('武功',[],options))[0].targetText).toBe('võ công');
  expect(messages.filter(type=>type==='load')).toHaveLength(2);
  expect((await convertLocal(source,[],options,false))[0].targetText).toBe('nghĩa gốc');
  expect((await convertLocal(source,[],options))[0].targetText).toBe('giới võ lâm');
  const original=await db.dictionaries.get('vp');
  expect(original).toMatchObject({sha256:'original',updatedAt:1});
  expect(await original?.blob.text()).toBe(await blob.text());
});
