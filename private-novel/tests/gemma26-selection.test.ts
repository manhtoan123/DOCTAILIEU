import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-settings';
import {getPromptStock} from '../src/features/ai/prompt/prompt-stock';
it('changes only model selection once and preserves subsequent user choices',async()=>{
 await db.settings.clear();const original={...AI_DEFAULTS,systemPrompt:'Keep my prompt',model:'gemini-2.5-flash',modelMode:'auto',temperature:0.7};
 await db.settings.put({key:'ai-translate-settings',value:original});
 const stock=await getPromptStock(),updated=(await db.settings.get('ai-translate-settings'))!.value as typeof original;
 expect(updated).toMatchObject({...original,model:'gemma-4-26b-a4b-it',modelMode:'fixed'});expect(stock.profiles.every(p=>p.settings.model==='gemma-4-26b-a4b-it'&&p.settings.modelMode==='fixed')).toBe(true);
 await db.settings.put({key:'ai-translate-settings',value:original});await getPromptStock();expect((await db.settings.get('ai-translate-settings'))!.value).toEqual(original);
});
