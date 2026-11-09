import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,aiBookSettingsKey} from '../src/features/ai/services/ai-reading';
import {getPromptStock,savePromptProfile,copyPromptProfile,selectPromptProfile,deletePromptProfile,getBookPromptSelection,getEligibleProfiles,PROMPT_STOCK_KEY,DEFAULT_PROMPT_PROFILE_ID} from '../src/features/ai/prompt/prompt-stock';

beforeEach(async()=>{await db.settings.clear();});
afterEach(()=>vi.restoreAllMocks());
const input=(title='Tên',bookId?:string)=>({title,bookId,settings:{...AI_DEFAULTS,systemPrompt:title}});
describe('named local prompt stock',()=>{
  it('migrates common and book legacy once without rewriting original rows',async()=>{
    const common={...AI_DEFAULTS,temperature:0.4},book={...AI_DEFAULTS,systemPrompt:'Riêng'};
    await db.settings.bulkPut([{key:'ai-translate-settings',value:common},{key:aiBookSettingsKey('a'),value:book}]);
    const first=await getPromptStock();expect(first.profiles).toHaveLength(2);expect(first.profiles[0].settings).toEqual(common);
    expect(first.profiles[1]).toMatchObject({bookId:'a',settings:book});
    const put=vi.spyOn(db.settings,'put');expect(await getPromptStock()).toEqual(first);expect(put).not.toHaveBeenCalled();
    expect((await db.settings.get('ai-translate-settings'))?.value).toEqual(common);expect((await db.settings.get(aiBookSettingsKey('a')))?.value).toEqual(book);
  });
  it('reads a removed model as the current default instead of failing the whole stock',async()=>{
    await db.settings.put({key:'ai-translate-settings',value:{...AI_DEFAULTS,systemPrompt:'Legacy prompt',model:'gemini-3.6-flash'}});
    const migrated=await getPromptStock();
    expect(migrated.profiles[0].settings).toEqual({...AI_DEFAULTS,systemPrompt:'Legacy prompt'});
    expect((await db.settings.get('ai-translate-settings'))?.value).toMatchObject({systemPrompt:'Legacy prompt',model:'gemini-3.6-flash'});
  });
  it.each([null,{}, {version:2,profiles:[]}, {version:1,profiles:[],defaultProfileId:'default'}])('fails closed on corrupt stock %j',async value=>{
    await db.settings.put({key:PROMPT_STOCK_KEY,value});await expect(getPromptStock()).rejects.toThrow();expect((await db.settings.get(PROMPT_STOCK_KEY))?.value).toEqual(value);
  });
  it('corrupt legacy refuses migration without overwriting or creating stock',async()=>{
    const bad={...AI_DEFAULTS,temperature:NaN};await db.settings.put({key:'ai-translate-settings',value:bad});await expect(getPromptStock()).rejects.toThrow();expect(await db.settings.get(PROMPT_STOCK_KEY)).toBeUndefined();
  });
  it.each([{title:'x'.repeat(121)}, {settings:{...AI_DEFAULTS,temperature:Infinity}}, {settings:{...AI_DEFAULTS,userPromptTemplate:'missing'}}, {settings:{...AI_DEFAULTS,systemPrompt:'x'.repeat(8001)}}, {settings:{...AI_DEFAULTS,model:'unknown'}}])('rejects malformed input %j',async patch=>{
    const before=await getPromptStock();await expect(savePromptProfile({...input(),...patch})).rejects.toThrow();expect(await getPromptStock()).toEqual(before);
  });
  it('enforces stock cap and immutable default',async()=>{
    const initial=await getPromptStock();const profiles=Array.from({length:499},(_,i)=>({...initial.profiles[0],id:`p${i}`,title:`p${i}`}));
    await db.settings.put({key:PROMPT_STOCK_KEY,value:{...initial,profiles:[...initial.profiles,...profiles]}});
    await expect(savePromptProfile(input())).rejects.toThrow();expect((await getPromptStock()).profiles).toHaveLength(500);
    await expect(deletePromptProfile(DEFAULT_PROMPT_PROFILE_ID)).rejects.toThrow();await expect(savePromptProfile({...input(),id:DEFAULT_PROMPT_PROFILE_ID})).rejects.toThrow();
  });
  it('serializes simultaneous profile writes without lost updates',async()=>{
    const saved=await Promise.all(Array.from({length:12},(_,i)=>savePromptProfile(input(`p${i}`))));
    expect(new Set(saved.map(p=>p.id)).size).toBe(12);expect((await getPromptStock()).profiles).toHaveLength(13);
  });
  it('native transaction locking preserves writes from a separate database connection',async()=>{
    await getPromptStock();const other=new Dexie(db.name);other.version(3).stores({settings:'key'});await other.open();
    try{await Promise.all([savePromptProfile(input('this tab')),other.transaction('rw',other.table('settings'),async()=>{
      const table=other.table('settings');const row=await table.get(PROMPT_STOCK_KEY);
      row.value.profiles.push({id:'other-tab',title:'Other',settings:{...AI_DEFAULTS},updatedAt:Date.now()});await table.put(row);
    })]);expect((await getPromptStock()).profiles).toHaveLength(3);}finally{other.close();}
  });
  it('materializes isolated snapshots; editing common does not change either book',async()=>{
    const common=await savePromptProfile(input('common')),privateA=await savePromptProfile(input('A','a'));
    await selectPromptProfile('a',common.id);await selectPromptProfile('b',common.id);
    await savePromptProfile({...input('edited'),id:common.id});
    expect((await db.settings.get(aiBookSettingsKey('a')))?.value).toMatchObject({systemPrompt:'common',chosenProfileId:common.id});
    expect((await db.settings.get(aiBookSettingsKey('b')))?.value).toMatchObject({systemPrompt:'common'});
    await expect(selectPromptProfile('b',privateA.id)).rejects.toThrow();expect(getEligibleProfiles(await getPromptStock(),'b').some(p=>p.id===privateA.id)).toBe(false);
    expect(getEligibleProfiles(await getPromptStock()).every(p=>!p.bookId)).toBe(true);
  });
  it('copy creates independent scope and settings',async()=>{
    const source=await savePromptProfile(input('common'));const copy=await copyPromptProfile(source.id,'private','a');
    expect(copy.id).not.toBe(source.id);expect(copy.bookId).toBe('a');expect(copy.settings).toEqual(source.settings);
    await savePromptProfile({...input('changed','a'),id:copy.id});expect((await getPromptStock()).profiles.find(p=>p.id===source.id)?.settings).toEqual(source.settings);
  });
  it('delete falls back only selected books, preserves manual edit and clears stale selection',async()=>{
    const p=await savePromptProfile(input('common'));await selectPromptProfile('a',p.id);await selectPromptProfile('b',p.id);
    const b=(await db.settings.get(aiBookSettingsKey('b')))!.value as object;await db.settings.put({key:aiBookSettingsKey('b'),value:{...b,systemPrompt:'manual'}});
    await db.settings.put({key:aiBookSettingsKey('c'),value:{...AI_DEFAULTS,systemPrompt:'untouched'}});
    await savePromptProfile({...input('edited'),id:p.id});await deletePromptProfile(p.id);
    expect((await db.settings.get(aiBookSettingsKey('a')))?.value).toMatchObject({...AI_DEFAULTS,chosenProfileId:DEFAULT_PROMPT_PROFILE_ID});
    expect((await db.settings.get(aiBookSettingsKey('b')))?.value).toEqual({...AI_DEFAULTS,systemPrompt:'manual'});
    expect((await db.settings.get(aiBookSettingsKey('c')))?.value).toEqual({...AI_DEFAULTS,systemPrompt:'untouched'});expect(await getBookPromptSelection('b')).toBeUndefined();
  });
  it('failed save preserves registry and legacy rows',async()=>{
    const before=await getPromptStock();vi.spyOn(db.settings,'put').mockRejectedValueOnce(new Error('quota'));
    await expect(savePromptProfile(input())).rejects.toThrow('quota');expect(await getPromptStock()).toEqual(before);
  });
  it('failed delete rolls back all already written book fallbacks and registry',async()=>{
    const p=await savePromptProfile(input());await selectPromptProfile('a',p.id);await selectPromptProfile('b',p.id);
    const before=await db.settings.toArray();const original=db.settings.put.bind(db.settings);vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof db.settings.put>)=>{if(args[0].key===PROMPT_STOCK_KEY)return Promise.reject(new Error('quota')) as ReturnType<typeof db.settings.put>;return original(...args);});
    await expect(deletePromptProfile(p.id)).rejects.toThrow('quota');expect(await db.settings.toArray()).toEqual(before);
  });
  it('failed first migration leaves no partial stock and can retry',async()=>{
    await db.settings.put({key:'ai-translate-settings',value:AI_DEFAULTS});vi.spyOn(db.settings,'put').mockRejectedValueOnce(new Error('quota'));await expect(getPromptStock()).rejects.toThrow('quota');expect(await db.settings.get(PROMPT_STOCK_KEY)).toBeUndefined();expect((await getPromptStock()).profiles).toHaveLength(1);
  });
});
