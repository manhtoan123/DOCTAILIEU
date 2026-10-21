import {handleAiKeys} from '../../../server/ai-keys';
import {invalidateAiKeyPool,type AiTranslateEnv} from '../../../server/ai-translate';

export const onRequest:PagesFunction<AiTranslateEnv & {AI_TRANSLATOR?:Fetcher}>=async context=>{
  if(context.env.AI_TRANSLATOR)return context.env.AI_TRANSLATOR.fetch(context.request);
  const response=await handleAiKeys(context.request,context.env);
  if(response.headers.get('X-AI-Keys-Changed'))invalidateAiKeyPool();
  return response;
};
