import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,aiBookSettingsKey} from '../src/features/ai/services/ai-reading';
import {AI_COMMON_SETTINGS_KEY,readReaderAiPreferences,selectReaderPrompt,setReaderSplitParts} from '../src/features/ai/types/ai-reader-settings';
import {getPromptStock,savePromptProfile} from '../src/features/ai/prompt/prompt-stock';

beforeEach(async()=>{await db.settings.clear();});
afterEach(()=>vi.restoreAllMocks());

it('review: concurrent switch and selection preserve both intents and other settings rows',async()=>{
 await getPromptStock();const profile=await savePromptProfile({title:'Selected',settings:{...AI_DEFAULTS,systemPrompt:'selected'}});
 const untouched={...AI_DEFAULTS,systemPrompt:'other book',chosenProfileId:'old',chosenProfileSettings:{...AI_DEFAULTS}};
 await db.settings.bulkPut([{key:aiBookSettingsKey('other'),value:untouched},{key:'unrelated',value:{keep:'exact'}}]);
 await Promise.all([setReaderSplitParts('a',false),selectReaderPrompt(profile.id,'a')]);
 const value=(await db.settings.get(aiBookSettingsKey('a')))!.value;
 expect(value).toMatchObject({systemPrompt:'selected',chosenProfileId:profile.id,splitParts:false});
 expect((await db.settings.get(aiBookSettingsKey('other')))!.value).toEqual(untouched);
 expect((await db.settings.get('unrelated'))!.value).toEqual({keep:'exact'});
});

it('review: failed atomic toggle and selection preserve existing row and queue can recover',async()=>{
 await getPromptStock();const profile=await savePromptProfile({title:'Selected',settings:{...AI_DEFAULTS,systemPrompt:'selected'}});
 const before={...AI_DEFAULTS,systemPrompt:'old',chosenProfileId:'old',chosenProfileSettings:{...AI_DEFAULTS}};
 await db.settings.put({key:aiBookSettingsKey('a'),value:before});
 const put=vi.spyOn(db.settings,'put').mockRejectedValueOnce(new Error('quota'));
 await expect(setReaderSplitParts('a',false)).rejects.toThrow('quota');expect((await db.settings.get(aiBookSettingsKey('a')))!.value).toEqual(before);
 put.mockRejectedValueOnce(new Error('quota'));
 await expect(selectReaderPrompt(profile.id,'a')).rejects.toThrow('quota');expect((await db.settings.get(aiBookSettingsKey('a')))!.value).toEqual(before);
 await setReaderSplitParts('a',false);expect((await readReaderAiPreferences('a')).settings.splitParts).toBe(false);
});

it('review: global and other books cannot select a private profile and failed selection writes nothing',async()=>{
 await getPromptStock();const profile=await savePromptProfile({title:'Private',bookId:'owner',settings:{...AI_DEFAULTS,systemPrompt:'private'}});
 const before=await db.settings.toArray();
 await expect(selectReaderPrompt(profile.id)).rejects.toThrow();await expect(selectReaderPrompt(profile.id,'other')).rejects.toThrow();
 expect(await db.settings.toArray()).toEqual(before);
});

it('review: a separate IndexedDB connection cannot lose an unrelated row field during toggle',async()=>{
 await db.settings.put({key:aiBookSettingsKey('a'),value:{...AI_DEFAULTS}});
 const other=new Dexie(db.name);other.version(3).stores({settings:'key'});await other.open();
 try{
  await Promise.all([setReaderSplitParts('a',false),other.transaction('rw',other.table('settings'),async()=>{
   const row=await other.table('settings').get(aiBookSettingsKey('a'));await other.table('settings').put({...row,value:{...row.value,reviewMarker:'other tab'}});
  })]);
  expect((await db.settings.get(aiBookSettingsKey('a')))!.value).toMatchObject({reviewMarker:'other tab',splitParts:false});
 }finally{other.close();}
});

it('review: runtime policy reads never rewrite book, common or unrelated persisted rows',async()=>{
 await db.settings.bulkPut([{key:AI_COMMON_SETTINGS_KEY,value:{...AI_DEFAULTS,temperature:.6}},{key:aiBookSettingsKey('a'),value:{...AI_DEFAULTS,chosenProfileId:'old',chosenProfileSettings:{...AI_DEFAULTS}}}]);
 const before=await db.settings.toArray();await readReaderAiPreferences('a');await readReaderAiPreferences('new-book');expect(await db.settings.toArray()).toEqual(before);
});
