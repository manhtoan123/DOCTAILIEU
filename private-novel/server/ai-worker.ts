import { handleAiKeys } from './ai-keys';
import { handleAiTranslate, invalidateAiKeyPool, type AiTranslateEnv } from './ai-translate';

export default {
  async fetch(request: Request, env: AiTranslateEnv) {
    const path = new URL(request.url).pathname;
    if (path === '/keys' || path.endsWith('/api/ai/keys')) {
      const response = await handleAiKeys(request, env);
      // A successful edit must not wait for the short pool cache to expire.
      if (response.headers.get('X-AI-Keys-Changed')) invalidateAiKeyPool();
      return response;
    }
    return handleAiTranslate(request, env);
  },
};
