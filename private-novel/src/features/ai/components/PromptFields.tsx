import {useState} from 'react';
import type {ReadingAiSettings} from '../services/ai-reading';
import {hybridTemplateValid} from '../services/ai-hybrid-prompt';
import {AiPromptEditor} from './AiPromptEditor';
export function promptDraftError(settings:ReadingAiSettings){
 if(!hybridTemplateValid(settings.userPromptTemplate))return 'User Prompt cần đúng một {{text}}.';
 return '';
}
export function PromptFields({settings,onChange}:{settings:ReadingAiSettings;onChange:(value:Partial<ReadingAiSettings>)=>void}){
 const [section,setSection]=useState<'prompt'|'translation'|'advanced'>('prompt');
 return <>
  <p className="muted prompt-model-policy">Các phần trong một chương dùng cùng model và prompt. Tối đa hai phần dịch đồng thời khi có hai key khả dụng.</p>
  <div className="ai-prompt-tabs" role="group" aria-label="Chỉnh sửa prompt">{([['prompt','Prompt'],['translation','Cách dịch'],['advanced','Nâng cao']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={section===key} onClick={()=>setSection(key)}>{label}</button>)}</div>
  <div hidden={section!=='prompt'}><h4>User Prompt</h4><AiPromptEditor label="User Prompt kho" value={settings.userPromptTemplate} rows={7} variables={['{{name}}','{{text}}','{{language}}']} onChange={value=>onChange({userPromptTemplate:value})}/><small className="muted">{'{{text}}: nguồn của phần cần dịch; {{name}}: Name riêng; {{language}}: ngôn ngữ.'}</small></div>
  <div hidden={section!=='translation'}>
   <label>Dịch chia phần song song<input type="checkbox" role="switch" aria-label="Dịch chia phần song song" checked={settings.splitParts??true} onChange={e=>onChange({splitParts:e.target.checked})}/></label>
   <p className="muted">Chia theo đoạn và câu, ghép đúng thứ tự. Phần lỗi tự thử lại trong giới hạn lượt dịch; phần đã hoàn tất được giữ. Mỗi truyện có thể đổi lựa chọn này ở trang đọc.</p>
   <label>Quy tắc xưng hô<textarea aria-label="Quy tắc xưng hô" maxLength={2000} rows={4} value={settings.addressingRules??settings.hybrid?.rules??''} onChange={e=>onChange({addressingRules:e.target.value})}/></label>
  </div>
  <div hidden={section!=='advanced'}><h4>System Prompt</h4><AiPromptEditor label="System Prompt kho" value={settings.systemPrompt} rows={8} variables={[]} onChange={value=>onChange({systemPrompt:value})}/><label>Nhiệt độ ({settings.temperature})<input aria-label="Nhiệt độ" type="range" min="0" max="1" step="0.1" value={settings.temperature} onChange={e=>onChange({temperature:Number(e.target.value)})}/></label><small className="muted">Chỉ áp dụng với model hỗ trợ nhiệt độ; model tự quản lý có thể bỏ qua giá trị này.</small></div>
 </>;
}
