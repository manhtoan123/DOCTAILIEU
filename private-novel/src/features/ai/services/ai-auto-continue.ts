import {aiAutoRecoveryPlan} from './ai-auto-resume';
import {AiTranslateClientError} from './ai-translate';
import {isTransientAiFailure,waitForAiRetry} from './ai-recovery';
export interface AiContinueOptions {automatic:boolean;renewBudget:boolean}
/** Reuse the same session/checkpoints; individual request budgets remain bounded. */
export async function continueAiRun<T>(request:(options:AiContinueOptions)=>Promise<T>,deadline:()=>number,signal:AbortSignal,onWaiting:(seconds:number)=>void):Promise<T>{
 let options:AiContinueOptions={automatic:false,renewBudget:true},attempt=0;
 for(;;){
  signal.throwIfAborted();
  try{const result=await request(options);signal.throwIfAborted();return result;}catch(error){
   signal.throwIfAborted();
   // Never retry semantic/content refusal or unknown non-STOP completion as a transport failure.
   if(!(error instanceof AiTranslateClientError))throw error;
   if(error.code!=='ai_recovery_exhausted'&&!isTransientAiFailure(error))throw error;
   const plan=aiAutoRecoveryPlan(error,attempt++,deadline());if(!plan)throw error;
   const until=Date.now()+plan.delay;onWaiting(Math.ceil(plan.delay/1000));
   while(Date.now()<until){await waitForAiRetry(Math.min(1000,until-Date.now()),signal);signal.throwIfAborted();onWaiting(Math.max(0,Math.ceil((until-Date.now())/1000)));}
   options={automatic:true,renewBudget:plan.renewBudget};
  }
 }
}
