import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {getPromptStock,savePromptProfile,selectPromptProfile} from '../src/features/ai/prompt/prompt-stock';
import {automaticAiSettings,resolveReaderAiSettings,readReaderAiPreferences,selectReaderPrompt,setReaderSplitParts,setReaderModel,commonAiEditorDefaults,customAiDisplaySettings} from '../src/features/ai/types/ai-reader-settings';
beforeEach(async()=>{await db.settings.clear();});afterEach(()=>vi.restoreAllMocks());
it('runtime preserves the saved selected model and disables cross-model fallback without rewriting legacy rows',()=>{const old={...AI_DEFAULTS,model:'gemma-4-26b-a4b-it',hybrid:{version:1 as const,liteModel:'gemini-3.1-flash-lite' as const,rules:'Gọi anh.'}},snapshot=JSON.stringify(old),runtime=automaticAiSettings(old);expect(runtime).toMatchObject({model:'gemma-4-26b-a4b-it',fallbackModels:[],splitParts:true,addressingRules:'Gọi anh.'});expect(runtime.hybrid).toBeUndefined();expect(JSON.stringify(old)).toBe(snapshot);});
it('shared split choice is inherited while each book keeps its own prompt and explicit switch',()=>{const common={...commonAiEditorDefaults(),systemPrompt:'Common',splitParts:false};expect(resolveReaderAiSettings(undefined,common)).toMatchObject({systemPrompt:'Common',splitParts:false});expect(resolveReaderAiSettings({...AI_DEFAULTS,systemPrompt:'Book',splitParts:true},common)).toMatchObject({systemPrompt:'Book',splitParts:true});});
it('global prompt selection is available, scoped, atomic and does not write book selections',async()=>{await getPromptStock();const p=await savePromptProfile({title:'Common',settings:{...AI_DEFAULTS,systemPrompt:'COMMON'}}),own=await savePromptProfile({title:'Private',bookId:'a',settings:{...AI_DEFAULTS,systemPrompt:'PRIVATE'}});await selectPromptProfile('a',own.id);const before=(await db.settings.get('ai-book-settings:a'))?.value;await selectReaderPrompt(p.id);expect((await db.settings.get('ai-translate-settings'))?.value).toMatchObject({chosenProfileId:p.id,systemPrompt:'COMMON'});expect((await db.settings.get('ai-book-settings:a'))?.value).toEqual(before);await expect(selectReaderPrompt(own.id)).rejects.toThrow();expect((await db.settings.get('ai-translate-settings'))?.value).toMatchObject({chosenProfileId:p.id});});
it('changing prompt keeps the book switch; toggles retain chosen identity and other book data',async()=>{await getPromptStock();const a=await savePromptProfile({title:'A',settings:{...AI_DEFAULTS,systemPrompt:'A'}}),b=await savePromptProfile({title:'B',settings:{...AI_DEFAULTS,systemPrompt:'B'}});await selectReaderPrompt(a.id,'one');await selectReaderPrompt(a.id,'two');const other=(await db.settings.get('ai-book-settings:two'))?.value;await setReaderSplitParts('one',false);await selectReaderPrompt(b.id,'one');expect(await readReaderAiPreferences('one')).toMatchObject({chosenId:b.id,settings:{splitParts:false}});await setReaderSplitParts('one',true);expect(await readReaderAiPreferences('one')).toMatchObject({chosenId:b.id,settings:{splitParts:true}});expect((await db.settings.get('ai-book-settings:one'))?.value).toMatchObject({chosenProfileId:b.id,chosenProfileSettings:{systemPrompt:'B'}});expect((await db.settings.get('ai-book-settings:two'))?.value).toEqual(other);});
it('a failed settings commit leaves prompt choice and split state intact',async()=>{await getPromptStock();const a=await savePromptProfile({title:'A',settings:AI_DEFAULTS});await selectReaderPrompt(a.id,'one');const before=(await db.settings.get('ai-book-settings:one'))?.value;const put=db.settings.put.bind(db.settings);vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof db.settings.put>)=>{if(args[0].key==='ai-book-settings:one')throw Error('write failed');return put(...args);});await expect(setReaderSplitParts('one',false)).rejects.toThrow('write failed');expect((await db.settings.get('ai-book-settings:one'))?.value).toEqual(before);});
it('custom prompt display inherits the common row when the book has no own settings row',()=>{
  const common={...AI_DEFAULTS,systemPrompt:'COMMON INHERITED',model:'gemini-2.5-flash'};
  expect(customAiDisplaySettings(undefined,common)).toMatchObject({systemPrompt:'COMMON INHERITED',model:'gemini-2.5-flash'});
  const own={...AI_DEFAULTS,systemPrompt:'BOOK OWN'};
  expect(customAiDisplaySettings(own,common)).toMatchObject({systemPrompt:'BOOK OWN'});
  expect(customAiDisplaySettings(undefined,undefined)).toEqual(AI_DEFAULTS);
});

it('model choice survives reload, common inheritance, split toggles and changing a prompt',async()=>{
 await getPromptStock();const p=await savePromptProfile({title:'Other model template',settings:{...AI_DEFAULTS,model:'gemini-2.5-flash',systemPrompt:'Selected prompt'}});
 await db.settings.put({key:'ai-translate-settings',value:{...AI_DEFAULTS,model:'qwen/qwen3.8-27b'}});
 expect((await readReaderAiPreferences('one')).settings.model).toBe('qwen/qwen3.8-27b');
 await selectReaderPrompt(p.id,'one');expect((await readReaderAiPreferences('one')).settings).toMatchObject({model:'qwen/qwen3.8-27b',systemPrompt:'Selected prompt',fallbackModels:[]});
 await setReaderModel('one','gemini-3.7-flash');await setReaderSplitParts('one',false);await selectReaderPrompt(p.id,'one');
 expect((await readReaderAiPreferences('one')).settings).toMatchObject({model:'gemini-3.7-flash',splitParts:false,fallbackModels:[]});
 expect((await readReaderAiPreferences('two')).settings.model).toBe('qwen/qwen3.8-27b');
 await selectReaderPrompt(p.id);expect((await readReaderAiPreferences('two')).settings.model).toBe('qwen/qwen3.8-27b');
 await expect(setReaderModel('one','unknown/model')).rejects.toThrow('Model');
 expect((await readReaderAiPreferences('one')).settings.model).toBe('gemini-3.7-flash');
});
