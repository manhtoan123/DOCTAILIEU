import {AiTranslateClientError} from './ai-translate';
import {AI_RECOVERY_ROUND_WAIT_MS} from './ai-job';
import {isTransientAiFailure} from './ai-recovery';

/** Reader retries share the existing chapter budget; never renew it automatically. */
export function aiAutoResumeDelay(error:unknown,attempt:number,deadline:number,now=Date.now()):number|undefined{
  if(!isTransientAiFailure(error))return;
  const delay=Math.max(Math.min(30000,2000*2**Math.min(attempt,4)),error.retryAfterMs??0);
  if(!Number.isFinite(deadline)||!Number.isFinite(delay)||delay<0||now+delay>=deadline)return;
  return delay;
}

/** Slow outer recovery keeps bounded individual rounds and all completed parts. */
export function aiAutoRecoveryPlan(error:unknown,attempt:number,deadline:number,now=Date.now()):{delay:number;renewBudget:boolean}|undefined{
  const fast=aiAutoResumeDelay(error,attempt,deadline,now);
  if(fast!==undefined)return {delay:fast,renewBudget:false};
  if(!(error instanceof AiTranslateClientError))return;
  if(error.status!==undefined&&error.status>=400&&error.status<500&&error.status!==408&&error.status!==429)return;
  if(['request_validation','not_configured','cancelled'].includes(error.reason??''))return;
  const code=error.code;
  const generated=['ai_untranslated_result','ai_empty_result','ai_incomplete_result','ai_invalid_response'].includes(code);
  if(!isTransientAiFailure(error)&&code!=='ai_recovery_exhausted'&&!generated)return;
  if(!Number.isFinite(deadline))return;
  const delay=Math.max(AI_RECOVERY_ROUND_WAIT_MS,error.retryAfterMs??0);
  if(!Number.isFinite(delay))return;
  const exhausted=error.code==='ai_recovery_exhausted'||now+delay>=deadline;
  return {delay:exhausted&&code!=='ai_recovery_exhausted'?Math.max(delay,deadline-now+AI_RECOVERY_ROUND_WAIT_MS):delay,renewBudget:exhausted};
}
