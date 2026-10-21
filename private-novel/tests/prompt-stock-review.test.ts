import 'fake-indexeddb/auto';
import Dexie, {liveQuery} from 'dexie';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,aiBookSettingsKey} from '../src/features/ai/services/ai-reading';
import {getPromptStock,readStoredPromptStock,savePromptProfile,selectPromptProfile,deletePromptProfile,getBookPromptSelection,PROMPT_STOCK_KEY} from '../src/features/ai/prompt/prompt-stock';

beforeEach(async()=>{await db.settings.clear();});
afterEach(()=>vi.restoreAllMocks());
const input=(title:string)=>({title,settings:{...AI_DEFAULTS,systemPrompt:title}});

it('readonly stock path does not create or rewrite missing/corrupt rows',async()=>{
  const put=vi.spyOn(db.settings,'put');
  await expect(readStoredPromptStock()).rejects.toThrow();expect(put).not.toHaveBeenCalled();
  await db.settings.put({key:PROMPT_STOCK_KEY,value:{version:99}});put.mockClear();
  await expect(readStoredPromptStock()).rejects.toThrow();expect(put).not.toHaveBeenCalled();
  expect((await db.settings.get(PROMPT_STOCK_KEY))!.value).toEqual({version:99});
});

it('readonly stock subscription works in Dexie liveQuery and observes committed edits',async()=>{
  await getPromptStock();
  const observed:number[]=[];let subscription:{unsubscribe:()=>void}|undefined;
  let rejectPromise:(reason:unknown)=>void=()=>{};
  let resolveInitial:()=>void=()=>{};
  const initial=new Promise<void>(resolve=>{resolveInitial=resolve;});
  const completed=new Promise<void>((resolve,reject)=>{
    rejectPromise=reject;
    subscription=liveQuery(()=>readStoredPromptStock()).subscribe({next:value=>{observed.push(value.profiles.length);if(value.profiles.length===1)resolveInitial();if(value.profiles.length===2)resolve();},error:reject});
  });
  const timer=setTimeout(()=>rejectPromise(new Error('liveQuery did not emit committed registry')),2000);
  try{await initial;await savePromptProfile(input('observable'));await completed;expect(observed).toEqual([1,2]);}
  finally{clearTimeout(timer);subscription?.unsubscribe();}
});

it('native second connection writes serialize with registry read-modify-write',async()=>{
  await getPromptStock();
  const other=new Dexie(db.name);await other.open();
  try {
    const external=other.transaction('rw',other.table('settings'),async()=>{
      const row=await other.table('settings').get(PROMPT_STOCK_KEY);
      await other.table('settings').put({key:PROMPT_STOCK_KEY,value:{...row.value,profiles:[...row.value.profiles,{id:'external',title:'External',settings:{...AI_DEFAULTS},updatedAt:1}]}});
    });
    await Promise.all([external,savePromptProfile(input('Local'))]);
    expect((await getPromptStock()).profiles.map(p=>p.title)).toEqual(expect.arrayContaining(['External','Local']));
  } finally {other.close();}
});

it('native transaction abort after first fallback keeps all selected snapshots and stock',async()=>{
  const p=await savePromptProfile(input('chosen'));await selectPromptProfile('a',p.id);await selectPromptProfile('b',p.id);
  const before=await db.settings.toArray();const original=db.settings.put.bind(db.settings);
  vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof db.settings.put>)=>{
    const result=original(...args);
    if(args[0].key===aiBookSettingsKey('a')) Dexie.currentTransaction!.abort();
    return result;
  });
  await expect(deletePromptProfile(p.id)).rejects.toThrow();
  expect(await db.settings.toArray()).toEqual(before);
});

it('malformed selected snapshot prevents partial fallback writes',async()=>{
  const p=await savePromptProfile(input('chosen'));await selectPromptProfile('a',p.id);await selectPromptProfile('b',p.id);
  const b=(await db.settings.get(aiBookSettingsKey('b')))!.value as object;
  await db.settings.put({key:aiBookSettingsKey('b'),value:{...b,chosenProfileSettings:{...AI_DEFAULTS,temperature:NaN}}});
  const before=await db.settings.toArray();await expect(deletePromptProfile(p.id)).rejects.toThrow();expect(await db.settings.toArray()).toEqual(before);
});

it('manual saved snapshot without marker is untouched by delete',async()=>{
  const p=await savePromptProfile(input('chosen'));await selectPromptProfile('a',p.id);
  const manual={...AI_DEFAULTS,systemPrompt:'manual saved'};
  await db.settings.put({key:aiBookSettingsKey('a'),value:manual});await deletePromptProfile(p.id);
  expect((await db.settings.get(aiBookSettingsKey('a')))!.value).toEqual(manual);
});

it('selection detector clears mismatched marker while exact snapshot remains selected after profile edit',async()=>{
  const p=await savePromptProfile(input('chosen'));await selectPromptProfile('a',p.id);
  await savePromptProfile({...input('changed registry'),id:p.id});expect(await getBookPromptSelection('a')).toBe(p.id);
  const a=(await db.settings.get(aiBookSettingsKey('a')))!.value as object;
  await db.settings.put({key:aiBookSettingsKey('a'),value:{...a,temperature:0.25}});
  expect(await getBookPromptSelection('a')).toBeUndefined();
});

it('corrupt legacy book aborts initial migration and preserves every original row',async()=>{
  await db.settings.bulkPut([{key:'ai-translate-settings',value:{...AI_DEFAULTS}},{key:aiBookSettingsKey('valid'),value:{...AI_DEFAULTS}},{key:aiBookSettingsKey('invalid'),value:{...AI_DEFAULTS,userPromptTemplate:'missing'}}]);
  const before=await db.settings.toArray();await expect(getPromptStock()).rejects.toThrow();expect(await db.settings.toArray()).toEqual(before);
});
