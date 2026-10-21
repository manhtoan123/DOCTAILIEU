import {isTransientAiFailure} from './ai-recovery';

/** Reader retries share the existing chapter budget; never renew it automatically. */
export function aiAutoResumeDelay(error:unknown,attempt:number,deadline:number,now=Date.now()):number|undefined{
  if(!isTransientAiFailure(error))return;
  const delay=Math.max(Math.min(30000,2000*2**Math.min(attempt,4)),error.retryAfterMs??0);
  if(!Number.isFinite(deadline)||!Number.isFinite(delay)||delay<0||now+delay>=deadline)return;
  return delay;
}
