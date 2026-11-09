import { handleAiKeys } from './ai-keys';
import { handleAiTranslate, invalidateAiKeyPool, type AiTranslateEnv } from './ai-translate';
import type {ExecutionContext} from '@cloudflare/workers-types';
import {writeAiLogEvent} from './ai-log';

export default {
  async fetch(request: Request, env: AiTranslateEnv, context?:ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path === '/keys' || path.endsWith('/api/ai/keys')) {
      const response = await handleAiKeys(request, env);
      // A successful edit must not wait for the short pool cache to expire.
      if (response.headers.get('X-AI-Keys-Changed')) invalidateAiKeyPool();
      return response;
    }
    return handleAiTranslate(request, env,context?(event,ready)=>context.waitUntil(Promise.resolve(ready).then(()=>writeAiLogEvent(env.DB,event)).catch(()=>{})):undefined);
  },
};
