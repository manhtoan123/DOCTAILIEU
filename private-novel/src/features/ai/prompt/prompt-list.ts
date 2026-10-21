import type {PromptProfile,PromptStock} from './prompt-schema';
import type {ReadingAiSettings} from '../services/ai-reading';
export interface PromptGroup {key:string;profiles:PromptProfile[]}
/** Presentation only: keep every stored ID and selection, group names within their scope. */
export function promptGroups(stock?:PromptStock):PromptGroup[]{
 const groups=new Map<string,PromptProfile[]>();
 for(const profile of stock?.profiles??[]){if(profile.id===stock?.defaultProfileId)continue;const key=JSON.stringify([profile.bookId??null,profile.title.trim()]);let versions=groups.get(key);if(!versions)groups.set(key,versions=[]);versions.push(profile);}
 return [...groups].map(([key,profiles])=>({key,profiles:profiles.sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id))}));
}
export function promptVersionLabel(profile:PromptProfile,index:number){return `${index===0?'Mới nhất · ':''}${new Date(profile.updatedAt).toLocaleString('vi-VN')} · ${profile.settings.model.replace('gemini-','Gemini ').replace('-flash',' Flash')}`;}
/** Name the prompt body independently of a book's manual model/temperature override. */
export function currentPromptChoice(stock:PromptStock|undefined,bookId:string|undefined,settings:ReadingAiSettings,chosenId?:string){
 const groups=promptGroups(stock).filter(g=>!g.profiles[0].bookId||g.profiles[0].bookId===bookId),profiles=groups.map(g=>g.profiles[0]);
 const matches=(p:PromptProfile)=>p.settings.systemPrompt===settings.systemPrompt&&p.settings.userPromptTemplate===settings.userPromptTemplate;
 const selected=groups.flatMap(g=>g.profiles).find(p=>p.id===chosenId&&matches(p)),candidates=profiles.filter(matches),active=selected??(candidates.length===1?candidates[0]:undefined);
 return {profiles,value:active&&profiles.some(p=>p.id===active.id)?active.id:'',label:active?.title??'Tùy chỉnh của truyện',savedVersion:!!active&&!profiles.some(p=>p.id===active.id)};
}
