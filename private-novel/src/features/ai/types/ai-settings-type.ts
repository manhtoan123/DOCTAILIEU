import type {AiHybridSettings,AiContinuation} from '../services/ai-hybrid-prompt';
export interface ReadingAiSettings {systemPrompt:string;userPromptTemplate:string;model:string;temperature:number;splitParts?:boolean;fallbackModels?:string[];hybrid?:AiHybridSettings;/** Runtime only; never restored from saved settings. */continuation?:AiContinuation;addressingRules?:string}
