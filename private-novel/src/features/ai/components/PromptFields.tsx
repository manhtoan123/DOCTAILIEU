import {AiModelChoice} from './AiModelChoice';
import {useState} from 'react';
import type {ReadingAiSettings} from '../services/ai-reading';
import {hybridTemplateValid} from '../services/ai-hybrid-prompt';
import {AiPromptEditor} from './AiPromptEditor';
import {disablesAiThinking,supportsAiTemperature} from '../types/ai-models';
export function promptDraftError(settings:ReadingAiSettings){
 if(!hybridTemplateValid(settings.userPromptTemplate))return 'User Prompt cần đúng một {{text}}.';
 return '';
}
export function PromptFields({settings,onChange,profileTemplate=false}:{settings:ReadingAiSettings;onChange:(value:Partial<ReadingAiSettings>)=>void;profileTemplate?:boolean}){
 const [section,setSection]=useState<'prompt'|'translation'|'advanced'>('prompt');
 return <>
  <AiModelChoice settings={settings} onChange={onChange}/>
  <div className="ai-prompt-tabs" role="group" aria-label="Chỉnh sửa prompt">{([['prompt','Prompt'],['translation','Cách dịch'],['advanced','Nâng cao']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={section===key} onClick={()=>setSection(key)}>{label}</button>)}</div>
  <div hidden={section!=='prompt'}><h4>User Prompt</h4><AiPromptEditor label="User Prompt kho" value={settings.userPromptTemplate} rows={7} variables={['{{name}}','{{text}}','{{language}}']} onChange={value=>onChange({userPromptTemplate:value})}/><small className="muted">{'{{text}}: nguồn của phần cần dịch; {{name}}: Name riêng; {{language}}: ngôn ngữ.'}</small></div>
  <div hidden={section!=='translation'}>
   <label>Dịch chia phần song song<input type="checkbox" role="switch" aria-label="Dịch chia phần song song" checked={settings.splitParts??true} onChange={e=>onChange({splitParts:e.target.checked})}/></label>
   <p className="muted">TXT dưới 3.000 ký tự luôn dịch nguyên chương và thử lại khi gặp lỗi có thể phục hồi, kể cả khi bật song song. Từ 3.000 ký tự, giữ cơ chế chia theo lựa chọn và giới hạn hiện có; phần đã hoàn tất được giữ. Mỗi truyện có thể đổi lựa chọn song song ở trang đọc.</p>
   <label>Quy tắc xưng hô<textarea aria-label="Quy tắc xưng hô" maxLength={2000} rows={4} value={settings.addressingRules??settings.hybrid?.rules??''} onChange={e=>onChange({addressingRules:e.target.value})}/></label>
  </div>
  <div hidden={section!=='advanced'}><h4>System Prompt</h4><AiPromptEditor label="System Prompt kho" value={settings.systemPrompt} rows={8} variables={[]} onChange={value=>onChange({systemPrompt:value})}/><label>Nhiệt độ ({settings.temperature})<input aria-label="Nhiệt độ" type="range" min="0" max="1" step="0.1" disabled={!supportsAiTemperature(settings.model)} value={settings.temperature} onChange={e=>onChange({temperature:Number(e.target.value)})}/></label><small className="muted">{supportsAiTemperature(settings.model)?'Áp dụng khi model thực gọi hỗ trợ. Trong Reader, nhiệt độ chung được ưu tiên nếu đã cấu hình.':'Model gắn với mẫu không dùng nhiệt độ. Giá trị đã lưu được giữ khi bạn chọn model có hỗ trợ.'} Suy nghĩ: {disablesAiThinking(settings.model)?'đã tắt để ưu tiên tốc độ dịch':'theo model; web chưa gửi mức riêng'}.</small></div>
 </>;
}
