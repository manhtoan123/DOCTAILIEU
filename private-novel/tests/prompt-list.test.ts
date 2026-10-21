import {it,expect} from 'vitest';
import {promptGroups,currentPromptChoice} from '../src/features/ai/prompt/prompt-list';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import type {PromptProfile,PromptStock} from '../src/features/ai/prompt/prompt-schema';
const profile=(id:string,title:string,updatedAt:number,bookId?:string):PromptProfile=>({id,title,updatedAt,bookId,settings:{...AI_DEFAULTS,systemPrompt:id}});
it('groups repeated titles within a scope, opens the newest version and preserves every stored ID/settings',()=>{
 const stock:PromptStock={version:1,defaultProfileId:'default',profiles:[profile('default','Mặc định',10),profile('old','0 độ',1),profile('new','0 độ',3),profile('own','0 độ',2,'book'),profile('user-default','Mặc định',2)]},before=JSON.stringify(stock),groups=promptGroups(stock);
 expect(groups.map(g=>g.profiles.map(p=>p.id))).toEqual([['new','old'],['own'],['user-default']]);expect(JSON.stringify(stock)).toBe(before);expect(promptGroups()).toEqual([]);
});
it('names the selected prompt after a manual model override without changing the stored settings',()=>{
 const p=profile('p','0 độ',1),stock:PromptStock={version:1,defaultProfileId:'default',profiles:[profile('default','Mặc định',1),p]},settings={...p.settings,model:'gemma-4-26b-a4b-it',temperature:.4},before=JSON.stringify({stock,settings});
 expect(currentPromptChoice(stock,'book',settings,'p')).toMatchObject({value:'p',label:'0 độ',savedVersion:false});expect(JSON.stringify({stock,settings})).toBe(before);
});
it('keeps a selected older body named without displaying old versions or silently applying a newer one',()=>{
 const old=profile('old','0 độ',1),newer=profile('new','0 độ',2),other=profile('other','Private',3,'other'),stock:PromptStock={version:1,defaultProfileId:'default',profiles:[old,newer,other]};
 const choice=currentPromptChoice(stock,'book',old.settings,'old');expect(choice).toMatchObject({value:'',label:'0 độ',savedVersion:true});expect(choice.profiles.map(p=>p.id)).toEqual(['new']);
});
it('identifies only a unique matching body and never picks another book or an ambiguous profile',()=>{
 const p=profile('a','A',1),q={...profile('b','B',1),settings:p.settings},privateProfile={...p,id:'private',bookId:'other'},stock:PromptStock={version:1,defaultProfileId:'default',profiles:[privateProfile,p,q]};
 expect(currentPromptChoice(stock,'book',p.settings)).toMatchObject({value:'',label:'Tùy chỉnh của truyện'});expect(currentPromptChoice(stock,'book',p.settings,'a')).toMatchObject({value:'a',label:'A'});expect(currentPromptChoice(stock,'book',{...p.settings,systemPrompt:'Custom'},'a')).toMatchObject({value:'',label:'Tùy chỉnh của truyện'});
});
it('names the first-half prompt independently of the shared continuation template',()=>{
 const p={...profile('p','Kết hợp',1),settings:{...AI_DEFAULTS,hybrid:{version:1 as const,liteModel:'gemini-3.1-flash-lite' as const,rules:''}}},stock:PromptStock={version:1,defaultProfileId:'default',profiles:[p]};
 expect(currentPromptChoice(stock,'book',p.settings,'p').label).toBe('Kết hợp');expect(currentPromptChoice(stock,'book',{...p.settings,hybrid:{...p.settings.hybrid,secondHalfPrompt:'CUSTOM {{name}} {{firstHalfTranslation}} {{text}}'}},'p').label).toBe('Kết hợp');
});
