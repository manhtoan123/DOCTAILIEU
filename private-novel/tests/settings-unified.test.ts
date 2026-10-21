import 'fake-indexeddb/auto';
import {beforeEach,it,expect} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {validatePromptSettings} from '../src/features/ai/prompt/prompt-schema';
import {getPromptStock,savePromptProfile,copyPromptProfile,applySharedPromptStock,getBookPromptSelection,deletePromptProfile} from '../src/features/ai/prompt/prompt-stock';
import {selectReaderPrompt,setReaderSplitParts,readReaderAiPreferences,saveCustomAiDraft} from '../src/features/ai/types/ai-reader-settings';
const template='{{name}} {{firstHalfSource}} {{firstHalfTranslation}} tiếp {{text}}';
const hybrid={version:1 as const,liteModel:'gemini-3.5-flash-lite' as const,rules:'Gọi anh.',secondHalfPrompt:template};
beforeEach(async()=>{await db.settings.clear();});
it('round trips complete hybrid profiles through validators/copy/sync without touching source',async()=>{
 await getPromptStock();const first=await savePromptProfile({title:'Mẫu đủ',settings:{...AI_DEFAULTS,hybrid}});const copy=await copyPromptProfile(first.id,'Bản sao');expect(copy.settings.hybrid).toEqual(hybrid);expect(validatePromptSettings({...AI_DEFAULTS,hybrid})).toMatchObject({hybrid});
 const stock=await getPromptStock();await applySharedPromptStock(stock);expect((await getPromptStock()).profiles.find(p=>p.id===first.id)?.settings.hybrid).toEqual(hybrid);
 expect(()=>validatePromptSettings({...AI_DEFAULTS,hybrid:{...hybrid,liteModel:'bad'}})).toThrow();
});
it('profile editing is isolated until explicitly applied; applying preserves book enable flags',async()=>{
 await getPromptStock();let profile=await savePromptProfile({title:'Mẫu',settings:{...AI_DEFAULTS,splitParts:true,addressingRules:'Gọi anh.'}});await selectReaderPrompt(profile.id,'a');await setReaderSplitParts('a',false);
 profile=await savePromptProfile({...profile,settings:{...profile.settings,addressingRules:'Gọi chị.'}},profile);expect((await readReaderAiPreferences('a')).settings.addressingRules).toBe('Gọi anh.');
 await selectReaderPrompt(profile.id,'a');expect((await readReaderAiPreferences('a')).settings).toMatchObject({addressingRules:'Gọi chị.',splitParts:false});await selectReaderPrompt(profile.id,'b');await applySharedPromptStock(await getPromptStock());expect((await readReaderAiPreferences('b')).settings.splitParts).toBe(true);
});
it('sync does not erase an inherited common template from a legacy profile',async()=>{
 await getPromptStock();await db.settings.put({key:'ai-translate-settings',value:{...AI_DEFAULTS,hybrid}});const profile=await savePromptProfile({title:'Cũ',settings:{...AI_DEFAULTS}});await selectReaderPrompt(profile.id);await applySharedPromptStock(await getPromptStock());expect((await db.settings.get('ai-translate-settings'))?.value).toMatchObject({hybrid});
});
it('a book split override does not detach its selected legacy prompt during shared refresh',async()=>{
 await getPromptStock();const profile=await savePromptProfile({title:'Cũ',settings:{...AI_DEFAULTS,splitParts:true,hybrid:{version:1,liteModel:'gemini-3.1-flash-lite',rules:''}}});await selectReaderPrompt(profile.id,'a');await setReaderSplitParts('a',false);expect(await getBookPromptSelection('a')).toBe(profile.id);
 const stock=await getPromptStock();stock.profiles=stock.profiles.map(p=>p.id===profile.id?{...p,settings:{...p.settings,userPromptTemplate:'Mới {{text}}'}}:p);await applySharedPromptStock(stock);expect((await readReaderAiPreferences('a')).settings).toMatchObject({userPromptTemplate:'Mới {{text}}',splitParts:false});expect((await readReaderAiPreferences('a')).settings.hybrid).toBeUndefined();
});
it('manual addressing edits survive sync/delete and stale custom draft cannot overwrite a newer row',async()=>{
 await getPromptStock();const profile=await savePromptProfile({title:'Mẫu',settings:{...AI_DEFAULTS,addressingRules:'Gọi anh.'}});await selectReaderPrompt(profile.id,'a');await setReaderSplitParts('a',false);const before=(await db.settings.get('ai-book-settings:a'))!.value as any;await db.settings.put({key:'ai-book-settings:a',value:{...before,addressingRules:'Tùy chỉnh riêng'}});await applySharedPromptStock(await getPromptStock());await deletePromptProfile(profile.id);expect((await readReaderAiPreferences('a')).settings.addressingRules).toBe('Tùy chỉnh riêng');
 await expect(saveCustomAiDraft('a',{...AI_DEFAULTS},before)).rejects.toThrow('đã đổi');
});
it('custom split-disabled book can save prompt rules without enabling parallel translation',async()=>{
 await setReaderSplitParts('a',false);const expected=(await db.settings.get('ai-book-settings:a'))!.value;
 await saveCustomAiDraft('a',{...AI_DEFAULTS,splitParts:true,addressingRules:'Gọi chị.'},expected);expect((await readReaderAiPreferences('a')).settings).toMatchObject({splitParts:false,addressingRules:'Gọi chị.'});await setReaderSplitParts('a',true);expect((await readReaderAiPreferences('a')).settings).toMatchObject({splitParts:true,addressingRules:'Gọi chị.'});
});
