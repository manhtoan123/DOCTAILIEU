import {AI_MODELS} from '../types/ai-models';
import {recommendedFallbackModels} from '../services/ai-fallback';
import type {ReadingAiSettings} from '../types/ai-settings-type';
export function AiFallbackFields({settings}:{settings:ReadingAiSettings;onChange?:(patch:Partial<ReadingAiSettings>)=>void}){const models=recommendedFallbackModels(settings.model,settings.fallbackOrder);return <p className="ai-hint">{models.length?<>Tự chuyển khi model bận hoặc lỗi: {models.map(id=>AI_MODELS.find(model=>model.id===id)?.label.replace('Gemini ','')).join(' → ')}.</>:'Không tự chuyển model.'}</p>;}
