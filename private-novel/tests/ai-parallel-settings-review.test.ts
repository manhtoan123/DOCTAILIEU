import 'fake-indexeddb/auto';
import {beforeEach,expect,it} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,aiBookSettingsKey,aiReadingKey,readReadingAiSettings} from '../src/features/ai/services/ai-reading';
import {AI_COMMON_SETTINGS_KEY,automaticAiSettings,readReaderAiPreferences,saveCustomAiDraft,selectReaderPrompt,setReaderSplitParts} from '../src/features/ai/types/ai-reader-settings';
import {getPromptStock,savePromptProfile} from '../src/features/ai/prompt/prompt-stock';
import {validatePromptProfile,validatePromptSettings} from '../src/features/ai/prompt/prompt-schema';
import {validateSharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {validReadingResult} from '../src/features/ai/services/ai-fallback';

beforeEach(async()=>{await db.settings.clear();});

it.each([false,true])('review: split=%s and addressing rules survive prompt and shared settings roundtrips',enabled=>{
 const settings={...AI_DEFAULTS,splitParts:enabled,addressingRules:'Gọi anh. Giữ literal {{text}}.'};
 const profile={id:'review-parallel',title:'Review',settings,updatedAt:1};
 expect(validatePromptProfile(JSON.parse(JSON.stringify(profile))).settings).toEqual(settings);
 const record=validateSharedRecord({kind:'ai-settings',bookId:'review-book',key:'',value:{...settings,chosenProfileId:profile.id,chosenProfileSettings:settings}});
 expect(record.value).toEqual({...settings,chosenProfileId:profile.id,chosenProfileSettings:settings});
 expect(readReadingAiSettings(settings)).toEqual(settings);
});

it.each(['false',0,null,{}])('review: rejects malformed split mode %j rather than silently losing a shared preference',splitParts=>{
 expect(()=>validatePromptSettings({...AI_DEFAULTS,splitParts})).toThrow();
});

it('review: runtime legacy compatibility keeps saved rows intact and cannot accept a hybrid cache result',async()=>{
 const legacy={...AI_DEFAULTS,hybrid:{version:1 as const,liteModel:'gemini-3.5-flash-lite' as const,rules:'Gọi chị.',secondHalfPrompt:'{{name}} {{firstHalfTranslation}} {{text}}'}};
 await db.settings.put({key:aiBookSettingsKey('legacy'),value:legacy});
 const before=await db.settings.toArray(),runtime=(await readReaderAiPreferences('legacy')).settings;
 expect(runtime.hybrid).toBeUndefined();expect(runtime.splitParts).toBe(true);expect(runtime.addressingRules).toBe('Gọi chị.');
 expect(await db.settings.toArray()).toEqual(before);
 const source={bookId:'legacy',id:'chapter',revision:1,text:'原文'};
 expect(aiReadingKey(source,runtime,[])).not.toBe(aiReadingKey(source,legacy,[]));
 expect(validReadingResult({result:'Bản dịch cũ.',model:'hybrid',finishReason:'STOP',inputTokens:1,outputTokens:1,halves:{version:1,models:[legacy.model,legacy.hybrid.liteModel],sampleHash:'a'.repeat(64)}},runtime)).toBe(false);
});

it('review: whole/split and addressing changes retain separate completed cache identities',()=>{
 const source={bookId:'review-book',id:'chapter',revision:1,text:'原文'},split={...automaticAiSettings(AI_DEFAULTS),splitParts:true,addressingRules:'Gọi anh.'};
 const identities=[aiReadingKey(source,split,[]),aiReadingKey(source,{...split,splitParts:false},[]),aiReadingKey(source,{...split,addressingRules:'Gọi chị.'},[])];
 expect(new Set(identities).size).toBe(identities.length);
});

it.each([false,true])('review: selecting and saving a prompt preserve explicit book split=%s and other book state',async enabled=>{
 await getPromptStock();
 const profile=await savePromptProfile({title:'Opposite mode',settings:{...AI_DEFAULTS,systemPrompt:'Selected',splitParts:!enabled,addressingRules:'Gọi chị.'}});
 const own={...AI_DEFAULTS,systemPrompt:'Before',splitParts:enabled},other={...AI_DEFAULTS,systemPrompt:'Other',splitParts:!enabled};
 await db.settings.bulkPut([{key:aiBookSettingsKey('owner'),value:own},{key:aiBookSettingsKey('other'),value:other}]);
 await selectReaderPrompt(profile.id,'owner');
 expect((await readReaderAiPreferences('owner')).settings).toMatchObject({systemPrompt:'Selected',splitParts:enabled,addressingRules:'Gọi chị.'});
 const selected=(await db.settings.get(aiBookSettingsKey('owner')))!.value;
 await saveCustomAiDraft('owner',{...profile.settings,systemPrompt:'Custom'},selected);
 expect((await readReaderAiPreferences('owner')).settings).toMatchObject({systemPrompt:'Custom',splitParts:enabled,addressingRules:'Gọi chị.'});
 expect((await db.settings.get(aiBookSettingsKey('other')))!.value).toEqual(other);
 const saved=(await db.settings.get(aiBookSettingsKey('owner')))!.value as Record<string,unknown>;
 await expect(saveCustomAiDraft('owner',{...profile.settings,systemPrompt:'Stale'},selected)).rejects.toThrow();
 expect((await db.settings.get(aiBookSettingsKey('owner')))!.value).toEqual(saved);
});

it('review: books without an explicit split mode inherit the common choice through selection and custom save',async()=>{
 await getPromptStock();
 await db.settings.put({key:AI_COMMON_SETTINGS_KEY,value:{...AI_DEFAULTS,splitParts:false}});
 const profile=await savePromptProfile({title:'Parallel template',settings:{...AI_DEFAULTS,splitParts:true}});
 await selectReaderPrompt(profile.id,'selected');
 expect((await readReaderAiPreferences('selected')).settings.splitParts).toBe(false);
 await db.settings.put({key:aiBookSettingsKey('custom'),value:{...AI_DEFAULTS}});
 const expected=(await db.settings.get(aiBookSettingsKey('custom')))!.value;
 await saveCustomAiDraft('custom',profile.settings,expected);
 expect((await readReaderAiPreferences('custom')).settings.splitParts).toBe(false);
});

it('review: simultaneous switch and prompt selection preserve the prompt snapshot and split intent',async()=>{
 await getPromptStock();
 const profile=await savePromptProfile({title:'Chosen',settings:{...AI_DEFAULTS,systemPrompt:'Chosen',splitParts:true}});
 await Promise.all([setReaderSplitParts('owner',false),selectReaderPrompt(profile.id,'owner')]);
 expect((await readReaderAiPreferences('owner')).settings).toMatchObject({systemPrompt:'Chosen',splitParts:false});
 expect((await db.settings.get(aiBookSettingsKey('owner')))!.value).toMatchObject({chosenProfileId:profile.id,chosenProfileSettings:{systemPrompt:'Chosen',splitParts:true},splitParts:false});
});

it('review: the first book toggle materializes complete syncable settings when neither book nor common exists',async()=>{
 expect(await db.settings.get(AI_COMMON_SETTINGS_KEY)).toBeUndefined();
 await setReaderSplitParts('first-toggle',false);
 const persisted=(await db.settings.get(aiBookSettingsKey('first-toggle')))!.value;
 expect(validatePromptSettings(persisted)).toMatchObject({...AI_DEFAULTS,splitParts:false});
 const shared=validateSharedRecord({kind:'ai-settings',bookId:'first-toggle',key:'',value:JSON.parse(JSON.stringify(persisted))});
 expect(shared.value).toMatchObject({...AI_DEFAULTS,splitParts:false});
 expect((await readReaderAiPreferences('first-toggle')).settings.splitParts).toBe(false);
 expect(await db.settings.get(AI_COMMON_SETTINGS_KEY)).toBeUndefined();
});
