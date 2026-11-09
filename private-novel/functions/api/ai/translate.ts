import {handleAiTranslate,type AiTranslateEnv} from '../../../server/ai-translate';
import type {PagesFunction,Fetcher} from '@cloudflare/workers-types';
import {writeAiLogEvent} from '../../../server/ai-log';
export const onRequest:PagesFunction<AiTranslateEnv & {AI_TRANSLATOR?:Fetcher}>=context=>context.env.AI_TRANSLATOR?context.env.AI_TRANSLATOR.fetch(context.request):handleAiTranslate(context.request,context.env,(event,ready)=>context.waitUntil(Promise.resolve(ready).then(()=>writeAiLogEvent(context.env.DB,event)).catch(()=>{})));
