import {it,expect} from 'vitest';
import {convertPolishKey,convertPolishSettings,polishedEpubNodes,progressivePolish} from '../src/features/ai/services/convert-polish';
it('isolates results by chapter, source revision and actual converted text',async()=>{
 const key=await convertPolishKey('chapter',1,'Tên A đi về.');
 expect(await convertPolishKey('chapter',1,'Tên A đi về.')).toBe(key);
 for(const other of [await convertPolishKey('other',1,'Tên A đi về.'),await convertPolishKey('chapter',2,'Tên A đi về.'),await convertPolishKey('chapter',1,'Tên B đi về.')])expect(other).not.toBe(key);
});
it('uses a separate fixed-model editing prompt without hybrid or fallback',()=>{
 const settings=convertPolishSettings('gemma-4-26b-a4b-it');expect(settings).toMatchObject({model:'gemma-4-26b-a4b-it',modelMode:'fixed',fallbackModels:[]});expect(settings.hybrid).toBeUndefined();expect(settings.userPromptTemplate.match(/\{\{text\}\}/g)).toHaveLength(1);
});

it('preserves EPUB text node boundaries and refuses changes that would shift images',()=>{
 expect(polishedEpubNodes(['Một\nhai','ba'],'A\nB\nC')).toEqual(['A\nB','C']);
 expect(()=>polishedEpubNodes(['Một','hai'],'Only one')).toThrow('số dòng');
});
it('accepts a custom editorial prompt independently of translation settings',()=>{expect(convertPolishSettings('gemma-4-26b-a4b-it','Custom editor').systemPrompt).toBe('Custom editor');});

it('progressive replacement retains the exact unprocessed source suffix',()=>{expect(progressivePolish('old first\nkeep tail','new first',10)).toBe('new first\nkeep tail');expect(progressivePolish('source','draft',0)).toBeUndefined();expect(progressivePolish('source','draft',7)).toBeUndefined();});
