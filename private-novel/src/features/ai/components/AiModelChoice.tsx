import {useId} from 'react';
import {AI_MODELS} from '../types/ai-models';
import type {ReadingAiSettings} from '../types/ai-settings-type';
import {recommendedFallbackModels} from '../services/ai-fallback';
import '../styles/ai-model-choice.css';
export function AiModelChoice({settings,disabled=false,onChange}:{settings:ReadingAiSettings;disabled?:boolean;onChange:(patch:Partial<ReadingAiSettings>)=>void}){
 const id=useId(),mode=settings.modelMode??'fixed',auto=mode==='auto';
 const chain=[settings.model,...recommendedFallbackModels(settings.model)];
 const label=(id:string)=>AI_MODELS.find(m=>m.id===id)?.label??id;
 return <div className="ai-model-choice">
  <span id={id}>Cách chọn model</span>
  <div className="ai-model-modes" role="group" aria-labelledby={id}>
   <button type="button" aria-pressed={auto} disabled={disabled} onClick={()=>onChange({modelMode:'auto',fallbackModels:[]})}>Tự động hạ model</button>
   <button type="button" aria-pressed={!auto} disabled={disabled} onClick={()=>onChange({modelMode:'fixed',fallbackModels:[]})}>Cố định model</button>
  </div>
  <p id={id+'-hint'} className="muted">{auto?'Nếu model ưu tiên gặp lỗi có thể phục hồi, tự chuyển sang model dự phòng.':'Luôn dùng model bạn chọn. Khi lỗi, đổi key hoặc chờ rồi thử lại cùng model.'}</p>
  <label>{auto?'Model ưu tiên':'Model cố định'}<select aria-label="Model" aria-describedby={id+'-hint'} value={settings.model} disabled={disabled} onChange={e=>onChange({model:e.target.value,modelMode:mode,fallbackModels:[]})}>{AI_MODELS.map(model=><option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
  {auto&&<details className="ai-model-chain"><summary>Thứ tự dự phòng · {chain.length} model</summary><ol>{chain.map(model=><li key={model}>{label(model)}</li>)}</ol><small>Giữ cùng model khi đã có phần hoàn tất; không trộn model giữa các phần. Lỗi quyền hoặc cấu hình cần xử lý riêng.</small></details>}
  <small className="muted">Giữ các chương đã dịch xong, kể cả chương đã dịch sẵn. Model mới áp dụng từ chương chưa có bản dịch hoàn tất. Đổi prompt hoặc Name vẫn kiểm tra lại bản dịch.</small>
 </div>;
}
